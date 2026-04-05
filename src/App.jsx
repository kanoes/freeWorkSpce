import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState
} from 'react';
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import {
  APP_VERSION,
  DIVIDEND_START_DATE,
  MANUAL_TYPE_MAP,
  RECORDS_PAGE_SIZE,
  addDays,
  applyManualTypeToTrade,
  buildAnalytics,
  buildTradeSoftKey,
  clearCloudTradeData,
  clearLocalTradeData,
  compareTradeProcessingOrder,
  createManualTrade,
  formatDateParts,
  formatMoney,
  formatPercent,
  getCurrentWeekMondayStr,
  getManualTypeOptions,
  getScopeLabel,
  getStockDisplayName,
  importCsvFile,
  initializeTradeCore,
  marketLabelFromKey,
  maskEmail,
  normalizeAnyDate,
  normalizeDay,
  normalizeTrade,
  parseFirebaseConfigInput,
  pullFromCloud,
  pushToCloud,
  removeDayById,
  saveFirebaseConfig,
  signInWithGoogle,
  signOutFromFirebase,
  todayStr,
  trimText,
  updateDividendRule,
  upsertManualDay,
  getTradeAppSnapshot
} from '../app.js';

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip
);

const TAB_ITEMS = [
  { id: 'home', label: '总览', icon: 'home' },
  { id: 'records', label: '记录', icon: 'list' },
  { id: 'analysis', label: '分析', icon: 'bars' },
  { id: 'dividend', label: '分红', icon: 'gift' },
  { id: 'settings', label: '设置', icon: 'gear' }
];

const DEFAULT_RECORD_FILTERS = {
  month: 'all',
  search: '',
  source: 'all',
  outcome: 'all',
  sort: 'desc',
  compact: false
};

const EMPTY_SNAPSHOT = {
  version: APP_VERSION,
  settings: {
    lastCsvImportAt: '',
    lastCsvImportSummary: null,
    dividendRules: {
      cash: { numerator: 1, denominator: 3, updatedAt: '' },
      margin: { numerator: 1, denominator: 3, updatedAt: '' }
    }
  },
  days: [],
  analytics: buildAnalytics([]),
  firebase: {
    configText: '',
    isSignedIn: false,
    isSyncing: false,
    syncStatusText: '从未同步',
    authStatusText: '还没有填写 Firebase Web 配置。',
    user: null
  }
};

function cloneValue(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function isManualTradeComplete(trade) {
  return Boolean(trimText(trade?.symbol)) && (Number(trade?.quantity) || 0) > 0 && (Number(trade?.price) || 0) > 0;
}

function getTradeBadgeTone(trade) {
  if (trade.assetType === 'margin') return 'margin';
  return 'cash';
}

function getTradeActionLabel(trade) {
  if (trade.tradeTypeLabel) return trade.tradeTypeLabel;
  return MANUAL_TYPE_MAP[trade.manualType]?.label || '交易';
}

function getTradeSourceLabel(trade) {
  return trade.fingerprint ? 'CSV' : '手动';
}

function getTradeRealizedLabel(trade) {
  if (trade.realizedProfit > 0) return 'positive';
  if (trade.realizedProfit < 0) return 'negative';
  return 'neutral';
}

function formatTradeQuantity(trade) {
  return `${Number(trade.quantity) || 0} 股`;
}

function getMonthOptions(days) {
  return Array.from(new Set(days.map((day) => day.date.slice(0, 7))))
    .sort()
    .reverse();
}

function getChartAccent(scope) {
  if (scope === 'cash') {
    return { line: '#5f87d5', fill: 'rgba(95, 135, 213, 0.14)' };
  }
  if (scope === 'margin') {
    return { line: '#d98758', fill: 'rgba(217, 135, 88, 0.18)' };
  }
  return { line: '#a56838', fill: 'rgba(165, 104, 56, 0.16)' };
}

function getValueTone(value) {
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'neutral';
}

function buildDashboardTimeline(daysAsc, scope, chartRange) {
  const today = todayStr();
  const startDate = chartRange === 'week'
    ? addDays(today, -6)
    : chartRange === 'month'
      ? addDays(today, -29)
      : '';

  let running = 0;
  return daysAsc
    .filter((day) => day.scopes[scope].tradeCount > 0)
    .filter((day) => !startDate || day.date >= startDate)
    .map((day) => {
      const scopeDay = day.scopes[scope];
      running += scopeDay.profit;
      return {
        date: day.date,
        profit: scopeDay.profit,
        cumulative: running,
        tradeCount: scopeDay.tradeCount,
        dividend: scopeDay.dividend,
        financingCost: scopeDay.financingCost
      };
    });
}

function buildLineChartData(timeline, scope, chartType) {
  const labels = timeline.map((item) => {
    const parts = formatDateParts(item.date);
    return `${parts.month}/${parts.day}`;
  });
  const values = timeline.map((item) => (chartType === 'cumulative' ? item.cumulative : item.profit));

  const accent = getChartAccent(scope);
  return {
    labels,
    datasets: [
      {
        data: values,
        borderColor: accent.line,
        backgroundColor: accent.fill,
        borderWidth: 3,
        tension: 0.34,
        fill: true,
        pointRadius: timeline.map((_, index) => (index === timeline.length - 1 ? 4 : 0)),
        pointHoverRadius: 5,
        pointHitRadius: 18,
        pointBackgroundColor: accent.line
      }
    ]
  };
}

function summarizeRecordDays(days, scope) {
  return days.reduce((acc, day) => {
    const scopeDay = day.scopes[scope];
    acc.totalProfit += scopeDay.profit;
    acc.tradeCount += scopeDay.tradeCount;
    acc.dividend += scopeDay.dividend;
    if (scopeDay.profit > 0) acc.winDays += 1;
    if (scopeDay.profit < 0) acc.lossDays += 1;
    return acc;
  }, {
    totalProfit: 0,
    tradeCount: 0,
    dividend: 0,
    winDays: 0,
    lossDays: 0
  });
}

function findExtremeDays(days, scope) {
  const relevantDays = days.filter((day) => day.scopes[scope].tradeCount > 0);
  if (!relevantDays.length) {
    return { best: null, worst: null };
  }

  return relevantDays.reduce((acc, day) => {
    if (!acc.best || day.scopes[scope].profit > acc.best.scopes[scope].profit) {
      acc.best = day;
    }
    if (!acc.worst || day.scopes[scope].profit < acc.worst.scopes[scope].profit) {
      acc.worst = day;
    }
    return acc;
  }, { best: null, worst: null });
}

function buildMonthlyHighlights(monthly) {
  if (!monthly.length) {
    return { best: null, worst: null };
  }

  return monthly.reduce((acc, item) => {
    if (!acc.best || item.profit > acc.best.profit) acc.best = item;
    if (!acc.worst || item.profit < acc.worst.profit) acc.worst = item;
    return acc;
  }, { best: null, worst: null });
}

function buildRecordFilterBadges(filters) {
  const badges = [];

  if (filters.month !== 'all') {
    badges.push({ tone: 'neutral', label: `月份 ${filters.month}` });
  }
  if (trimText(filters.search)) {
    badges.push({ tone: 'warning', label: `搜索 ${trimText(filters.search)}` });
  }
  if (filters.source !== 'all') {
    badges.push({ tone: filters.source === 'csv' ? 'success' : 'neutral', label: filters.source === 'csv' ? '仅 CSV' : '仅手动' });
  }
  if (filters.outcome !== 'all') {
    const map = { win: '盈利日', loss: '亏损日', flat: '平盘日' };
    badges.push({ tone: filters.outcome === 'loss' ? 'danger' : 'neutral', label: map[filters.outcome] });
  }
  if (filters.sort !== 'desc') {
    const map = { oldest: '最早优先', profit: '波动最大' };
    badges.push({ tone: 'neutral', label: map[filters.sort] });
  }
  if (filters.compact) {
    badges.push({ tone: 'cash', label: '紧凑模式' });
  }

  return badges;
}

function buildBarChartData(summary) {
  return {
    labels: summary.monthly.map((item) => item.month.replace('-', '/')),
    datasets: [
      {
        label: '月度收益',
        data: summary.monthly.map((item) => item.profit),
        backgroundColor: summary.monthly.map((item) => (item.profit >= 0 ? '#148164' : '#cf5c5c')),
        borderRadius: 10,
        borderSkipped: false
      }
    ]
  };
}

function buildHealthReport(days) {
  const duplicates = [];
  const duplicateMap = new Map();
  const positionMap = new Map();
  const orphanCloses = [];
  const normalizedDays = [...days].map(normalizeDay).sort((a, b) => a.date.localeCompare(b.date));

  normalizedDays.forEach((day) => {
    [...day.trades]
      .sort(compareTradeProcessingOrder)
      .forEach((trade) => {
        const duplicateKey = trade.fingerprint
          ? `fp:${trade.fingerprint}`
          : `soft:${buildTradeSoftKey(day.date, trade)}`;

        if (duplicateMap.has(duplicateKey)) {
          duplicates.push({
            date: day.date,
            symbol: trade.symbol,
            name: trade.name,
            tradeTypeLabel: trade.tradeTypeLabel
          });
        } else {
          duplicateMap.set(duplicateKey, true);
        }

        const qty = Number(trade.quantity) || 0;
        const key = `${trade.assetType}|${trade.positionSide}|${trade.symbol}`;
        const current = positionMap.get(key) || 0;
        const next = trade.positionEffect === 'open' ? current + qty : current - qty;

        if (trade.positionEffect === 'close' && qty > current + 1e-8) {
          orphanCloses.push({
            date: day.date,
            symbol: trade.symbol,
            name: trade.name,
            tradeTypeLabel: trade.tradeTypeLabel,
            missingQuantity: qty - current
          });
        }

        positionMap.set(key, Math.max(0, next));
      });
  });

  return {
    duplicateCount: duplicates.length,
    orphanCloseCount: orphanCloses.length,
    duplicateExamples: duplicates.slice(0, 3),
    orphanExamples: orphanCloses.slice(0, 3)
  };
}

function buildAnalysisDiagnostics(summary, trades) {
  const closingTrades = trades.filter((trade) => {
    const isCashClose = trade.assetType === 'cash' && trade.action === 'sell';
    return (isCashClose || trade.positionEffect === 'close') && trade.realizedProfit !== 0;
  });

  const winTrades = closingTrades.filter((trade) => trade.realizedProfit > 0);
  const lossTrades = closingTrades.filter((trade) => trade.realizedProfit < 0);
  const avgPerClose = closingTrades.length
    ? closingTrades.reduce((acc, trade) => acc + trade.realizedProfit, 0) / closingTrades.length
    : 0;
  const avgWin = winTrades.length
    ? winTrades.reduce((acc, trade) => acc + trade.realizedProfit, 0) / winTrades.length
    : 0;
  const avgLoss = lossTrades.length
    ? lossTrades.reduce((acc, trade) => acc + trade.realizedProfit, 0) / lossTrades.length
    : 0;
  const profitFactor = lossTrades.length
    ? winTrades.reduce((acc, trade) => acc + trade.realizedProfit, 0) / Math.abs(lossTrades.reduce((acc, trade) => acc + trade.realizedProfit, 0))
    : 0;
  const tradeWinRate = closingTrades.length ? Math.round((winTrades.length / closingTrades.length) * 100) : 0;

  let peak = 0;
  let running = 0;
  let maxDrawdown = 0;
  let winStreak = 0;
  let lossStreak = 0;
  let maxWinStreak = 0;
  let maxLossStreak = 0;

  summary.daySeries.forEach((item) => {
    running += item.value;
    peak = Math.max(peak, running);
    maxDrawdown = Math.max(maxDrawdown, peak - running);

    if (item.value > 0) {
      winStreak += 1;
      lossStreak = 0;
    } else if (item.value < 0) {
      lossStreak += 1;
      winStreak = 0;
    } else {
      winStreak = 0;
      lossStreak = 0;
    }

    maxWinStreak = Math.max(maxWinStreak, winStreak);
    maxLossStreak = Math.max(maxLossStreak, lossStreak);
  });

  return {
    avgPerClose,
    avgWin,
    avgLoss,
    profitFactor,
    maxDrawdown,
    maxWinStreak,
    maxLossStreak,
    closeTradeCount: closingTrades.length,
    winTradeCount: winTrades.length,
    lossTradeCount: lossTrades.length,
    tradeWinRate
  };
}

function parseConfigPreview(configText) {
  if (!trimText(configText)) return null;
  try {
    const config = parseFirebaseConfigInput(configText);
    return {
      projectId: config.projectId || '',
      authDomain: config.authDomain || '',
      appId: config.appId || ''
    };
  } catch {
    return null;
  }
}

function createEmptySheetState() {
  const date = todayStr();
  return {
    open: false,
    mode: 'add',
    dayId: '',
    date,
    trades: [createManualTrade({ order: 0, date })]
  };
}

function createRatioState() {
  return {
    open: false,
    target: 'cash',
    numerator: '1',
    denominator: '3'
  };
}

function SegmentedControl({ value, onChange, options, ownerLabel, className = '', compact = false }) {
  return (
    <div
      className={`segment-control ${compact ? 'compact' : ''} ${className}`.trim()}
      style={{ '--segment-count': options.length }}
    >
      {options.map((option) => (
        <button
          key={`${ownerLabel}-${option.value}`}
          type="button"
          className={`segment-btn ${value === option.value ? 'active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ScopeToggle({ value, onChange, ownerLabel }) {
  return (
    <SegmentedControl
      value={value}
      onChange={onChange}
      ownerLabel={ownerLabel}
      className="scope-toggle"
      options={['all', 'cash', 'margin'].map((scope) => ({
        value: scope,
        label: getScopeLabel(scope)
      }))}
    />
  );
}

function Icon({ name }) {
  if (name === 'home') {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path fill="currentColor" d="M12 3.6 4 10v9a1 1 0 0 0 1 1h5v-6h4v6h5a1 1 0 0 0 1-1v-9z" />
      </svg>
    );
  }
  if (name === 'list') {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path fill="currentColor" d="M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2m2 4v2h8V8zm0 4v2h8v-2zm0 4v2h5v-2z" />
      </svg>
    );
  }
  if (name === 'bars') {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path fill="currentColor" d="M5 19V9h3v10zm5 0V5h4v14zm6 0v-7h3v7z" />
      </svg>
    );
  }
  if (name === 'gift') {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path fill="currentColor" d="M12 21c4.97 0 9-3.58 9-8 0-2.67-1.48-5.04-3.77-6.49A6.5 6.5 0 0 0 5.3 8.96 5.5 5.5 0 0 0 3 13c0 4.42 4.03 8 9 8m-1-12h2v7h-2zm0 8h2v2h-2z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path fill="currentColor" d="M12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7m7.43-2.53c.04-.32.07-.64.07-.97s-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.64-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.5.5 0 0 0 14 2h-4a.5.5 0 0 0-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.25-.09-.52 0-.64.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1s.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.64.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.25.08.52 0 .64-.22l2-3.46c.12-.22.07-.49-.12-.64z" />
    </svg>
  );
}

function BottomNav({ activeTab, onChange }) {
  return (
    <nav className="bottom-tab-bar" aria-label="底部导航">
      {TAB_ITEMS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
          aria-current={activeTab === tab.id ? 'page' : undefined}
          onClick={() => onChange(tab.id)}
        >
          <Icon name={tab.icon} />
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}

function SummaryCard({ label, value, note, tone = 'neutral', hero = false }) {
  return (
    <article className={`summary-card ${hero ? 'hero' : ''}`}>
      <span className="summary-label">{label}</span>
      <strong className={`summary-value ${tone}`}>{value}</strong>
      {note ? <span className="summary-note">{note}</span> : null}
    </article>
  );
}

function StatusBadge({ tone, children }) {
  return <span className={`status-pill ${tone}`}>{children}</span>;
}

function RecordDayCard({ day, scope, compact, onOpen }) {
  const scopeDay = day.scopes[scope];
  const symbols = Array.from(scopeDay.symbols || []).filter(Boolean).slice(0, compact ? 3 : 5);
  const parts = formatDateParts(day.date);
  const tone = getValueTone(scopeDay.profit);

  return (
    <details className={`record-card-react ${compact ? 'compact' : ''}`}>
      <summary className="record-card-summary">
        <div>
          <div className="record-date">
            <strong>{parts.month}月{parts.day}日</strong>
            <span>{parts.weekday}</span>
          </div>
          <div className="record-meta">
            {symbols.length ? symbols.map((symbol) => (
              <span key={`${day.date}-${symbol}`} className="chip neutral">
                {getStockDisplayName(symbol, day.trades.find((trade) => trade.symbol === symbol)?.name)}
              </span>
            )) : <span className="record-empty-inline">暂无标的</span>}
          </div>
        </div>
        <div className="record-summary-side">
          <strong className={tone}>
            {formatMoney(scopeDay.profit)}
          </strong>
          <span>{scopeDay.tradeCount} 笔 · 已实现 {scopeDay.closeTradeCount}</span>
        </div>
      </summary>

      <div className="record-card-body">
        <div className="record-tags">
          <span className={`badge badge-tone-${tone}`}>{tone === 'positive' ? '盈利日' : tone === 'negative' ? '亏损日' : '平盘日'}</span>
          {day.scopes.cash.tradeCount ? <span className="badge badge-cash">现物 {day.scopes.cash.tradeCount}</span> : null}
          {day.scopes.margin.tradeCount ? <span className="badge badge-margin">信用 {day.scopes.margin.tradeCount}</span> : null}
          {day.importedCount ? <span className="badge badge-imported">CSV {day.importedCount}</span> : null}
          {day.manualCount ? <span className="badge badge-manual">手动 {day.manualCount}</span> : null}
        </div>
        <div className="record-detail-meta">
          <span>已实现 {scopeDay.closeTradeCount} 笔</span>
          <span>分红 {formatMoney(scopeDay.dividend)}</span>
          <span>融资成本 {formatMoney(scopeDay.financingCost, { signed: false })}</span>
          <span>交易标的 {Array.from(scopeDay.symbols || []).length}</span>
        </div>
        <div className="trade-list-compact">
          {day.trades
            .filter((trade) => scope === 'all' || trade.assetType === scope)
            .map((trade) => (
              <article key={trade.id} className="trade-row-compact">
                <div>
                  <div className="trade-title-row">
                    <strong>{getStockDisplayName(trade.symbol, trade.name)}</strong>
                    <div className="trade-mini-badges">
                      <StatusBadge tone={getTradeBadgeTone(trade)}>{trade.assetType === 'margin' ? '信用' : '现物'}</StatusBadge>
                      <StatusBadge tone={trade.fingerprint ? 'success' : 'neutral'}>{getTradeSourceLabel(trade)}</StatusBadge>
                    </div>
                  </div>
                  <div className="trade-row-sub">
                    <span>{trade.symbol}</span>
                    <span>{getTradeActionLabel(trade)}</span>
                    <span>{formatTradeQuantity(trade)}</span>
                    <span>单价 {formatMoney(trade.price, { signed: false })}</span>
                  </div>
                </div>
                <div className={`trade-row-pnl ${getTradeRealizedLabel(trade)}`}>
                  {formatMoney(trade.realizedProfit)}
                </div>
              </article>
            ))}
        </div>
        <div className="record-card-actions">
          <button type="button" className="ghost-btn" onClick={() => onOpen(day)}>
            查看 / 追加这一天
          </button>
        </div>
      </div>
    </details>
  );
}

function ConfirmSheet({ state, onCancel, onConfirm }) {
  if (!state.open) return null;

  const isCloud = state.mode === 'cloud';
  return (
    <div className="sheet" aria-hidden="false">
      <div className="sheet-backdrop" onClick={onCancel} />
      <div className="sheet-panel">
        <div className="sheet-header">
          <div>
            <div className="section-kicker">危险操作</div>
            <h2>{isCloud ? '确认清除云端数据？' : '确认清除本地数据？'}</h2>
            <p>
              {isCloud
                ? '该操作会清除 Firebase 云端中的所有交易与设置。'
                : '该操作会清除当前设备上的所有交易与本地设置。'}
            </p>
          </div>
          <button className="icon-btn small" type="button" onClick={onCancel} aria-label="关闭">✕</button>
        </div>
        <div className="confirm-body">
          <div className="confirm-step">{isCloud ? '云端数据' : '本地数据'}</div>
          <div className="confirm-warning">
            {isCloud
              ? '云端清除后，如果你之后再点“上传到云端”，本地数据会把云端重新写满。'
              : '本地清除后，仍然可以随时通过“从云端拉取”把 Firebase 云端数据拉回这台设备。'}
          </div>
        </div>
        <div className="confirm-actions">
          <button type="button" className="primary-btn" onClick={onConfirm}>是，立即清除</button>
          <button type="button" className="ghost-btn" onClick={onCancel}>否，取消</button>
        </div>
      </div>
    </div>
  );
}

function RatioSheet({ state, onCancel, onChange, onSave }) {
  if (!state.open) return null;
  const label = state.target === 'margin' ? '信用' : '现物';

  return (
    <div className="sheet" aria-hidden="false">
      <div className="sheet-backdrop" onClick={onCancel} />
      <div className="sheet-panel">
        <div className="sheet-header">
          <div>
            <div className="section-kicker">分红规则</div>
            <h2>修改{label}分红比例</h2>
            <p>注意：修改前分红将不受新比例影响，保存后只影响后续新增交易。</p>
          </div>
          <button className="icon-btn small" type="button" onClick={onCancel} aria-label="关闭">✕</button>
        </div>
        <div className="ratio-editor visible">
          <div className="ratio-editor-head">
            <strong>新的分红比例</strong>
            <span>历史分红不会回溯重算</span>
          </div>
          <div className="ratio-input-row">
            <input
              type="number"
              className="form-input"
              min="1"
              step="1"
              value={state.numerator}
              onChange={(event) => onChange('numerator', event.target.value)}
            />
            <span className="ratio-divider">/</span>
            <input
              type="number"
              className="form-input"
              min="1"
              step="1"
              value={state.denominator}
              onChange={(event) => onChange('denominator', event.target.value)}
            />
          </div>
          <div className="ratio-editor-actions">
            <button type="button" className="ghost-btn" onClick={onCancel}>取消</button>
            <button type="button" className="primary-btn" onClick={onSave}>保存比例</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ManualDaySheet({
  state,
  snapshot,
  onCancel,
  onChangeDate,
  onUpdateTrade,
  onRemoveTrade,
  onAddTrade,
  onDeleteDay,
  onSave
}) {
  if (!state.open) return null;

  const previewDate = normalizeAnyDate(state.date);
  const existingSameDate = snapshot.days.find((day) => day.date === previewDate && day.id !== state.dayId);
  const validTrades = state.trades.filter((trade) => trade.fingerprint || isManualTradeComplete(trade));
  const previewDays = [
    ...snapshot.days
      .filter((day) => day.id !== state.dayId && day.date !== previewDate)
      .map((day) => normalizeDay(day)),
    normalizeDay({
      id: state.dayId || 'draft',
      date: previewDate || todayStr(),
      trades: existingSameDate
        ? [...normalizeDay(existingSameDate).trades, ...validTrades.filter((trade) => !trade.fingerprint)]
        : validTrades,
      updatedAt: new Date().toISOString()
    })
  ];
  const preview = buildAnalytics(previewDays);
  const previewDay = preview.daysDesc.find((day) => day.date === (previewDate || todayStr()));
  const previewProfit = previewDay?.scopes.all.profit || 0;
  const previewFinancing = previewDay?.scopes.all.financingCost || 0;

  return (
    <div className="sheet" aria-hidden="false">
      <div className="sheet-backdrop" onClick={onCancel} />
      <div className="sheet-panel tall">
        <div className="sheet-header">
          <div>
            <div className="section-kicker">手动录入</div>
            <h2>{state.mode === 'edit' ? '查看 / 追加手动交易' : '手动录入'}</h2>
            <p>{state.mode === 'edit' ? 'CSV 交易保持锁定显示，手动交易可以继续追加。' : '录入时会自动套用当前账户对应的分红比例。'}</p>
          </div>
          <button className="icon-btn small" type="button" onClick={onCancel} aria-label="关闭">✕</button>
        </div>

        <div className="form-block">
          <label className="form-label" htmlFor="manualDate">日期</label>
          <input
            id="manualDate"
            type="date"
            className="form-input"
            value={state.date}
            disabled={state.mode === 'edit'}
            onChange={(event) => onChangeDate(event.target.value)}
          />
          <p className="inline-help">
            {state.mode === 'edit'
              ? `当前日期共 ${state.trades.length} 笔记录，其中 CSV ${state.trades.filter((trade) => trade.fingerprint).length} 笔。`
              : existingSameDate
                ? `该日期已有 ${existingSameDate.trades.length} 笔记录；保存时会把新手动交易合并进去。`
                : '保存后会作为新的交易日写入。'}
          </p>
        </div>

        <div className={`day-sheet-summary ${previewProfit > 0 ? 'positive' : previewProfit < 0 ? 'negative' : 'neutral'}`}>
          {previewFinancing > 0
            ? `当日已实现损益：${formatMoney(previewProfit)}（已扣融资成本 ${formatMoney(previewFinancing, { signed: false })}）`
            : `当日已实现损益：${formatMoney(previewProfit)}`}
        </div>

        <div className="trade-editor-list">
          {state.trades.map((trade, index) => {
            const displayName = getStockDisplayName(trade.symbol, trade.name);
            const gross = (Number(trade.quantity) || 0) * (Number(trade.price) || 0);
            const ratio = trade.ratioSnapshot || snapshot.settings.dividendRules[trade.assetType === 'margin' ? 'margin' : 'cash'];

            if (trade.fingerprint) {
              return (
                <article className="trade-display-card locked" key={trade.id}>
                  <div className="editor-card-top">
                    <div>
                      <h3 className="trade-title">{displayName || 'CSV 交易'}</h3>
                      <p className="trade-subtitle">{trade.symbol} · {trade.tradeTypeLabel}</p>
                    </div>
                    <div className="badge-row">
                      <span className={trade.assetType === 'margin' ? 'badge badge-margin' : 'badge badge-cash'}>
                        {trade.assetType === 'margin' ? '信用' : '现物'}
                      </span>
                      <span className="badge badge-imported">CSV</span>
                    </div>
                  </div>
                  <div className="trade-meta">
                    <span className="chip">{marketLabelFromKey(trade.market)}</span>
                    <span className="chip">{trade.custody || '--'}</span>
                    <span className="chip">{trade.taxCategory || '--'}</span>
                    {trade.settlementDate ? <span className="chip">受渡 {trade.settlementDate}</span> : null}
                  </div>
                  <div className="trade-readout">
                    <span className="meta-label">{trade.positionSide === 'short' ? '参考建仓金额' : '成交金额'}</span>
                    <strong>{formatMoney(gross, { signed: false })}</strong>
                    <span className="trade-subline">
                      数量 {Number(trade.quantity) || 0} 股 · 单价 {formatMoney(trade.price, { signed: false })} · 快照比例 {ratio?.numerator || 1} / {ratio?.denominator || 3}
                    </span>
                  </div>
                </article>
              );
            }

            const typeOptions = getManualTypeOptions(trade.assetType);

            return (
              <article className="trade-editor-card" key={trade.id}>
                <div className="editor-card-top">
                  <div>
                    <h3 className="trade-title">{displayName || '新交易'}</h3>
                    <p className="trade-subtitle">{trade.symbol || '输入代码后会自动匹配日股名称'}</p>
                  </div>
                  <button type="button" className="remove-trade-btn" onClick={() => onRemoveTrade(index)}>×</button>
                </div>

                <div className="editor-row two">
                  <label className="field-group">
                    <span className="form-label">股票代码</span>
                    <input
                      type="text"
                      className="form-input"
                      value={trade.symbol || ''}
                      placeholder="例如 8306"
                      onChange={(event) => onUpdateTrade(index, 'symbol', event.target.value)}
                    />
                  </label>
                  <label className="field-group">
                    <span className="form-label">名称</span>
                    <input
                      type="text"
                      className="form-input"
                      value={trade.name || ''}
                      placeholder="可手动补充名称"
                      onChange={(event) => onUpdateTrade(index, 'name', event.target.value)}
                    />
                  </label>
                </div>

                <div className="editor-row">
                  <span className="form-label">账户类型</span>
                  <div className="editor-segment">
                    <button
                      type="button"
                      className={`editor-chip ${trade.assetType === 'cash' ? 'active' : ''}`}
                      onClick={() => onUpdateTrade(index, 'assetType', 'cash')}
                    >
                      现物
                    </button>
                    <button
                      type="button"
                      className={`editor-chip ${trade.assetType === 'margin' ? 'active' : ''}`}
                      onClick={() => onUpdateTrade(index, 'assetType', 'margin')}
                    >
                      信用
                    </button>
                  </div>
                </div>

                <div className="editor-row">
                  <span className="form-label">交易类型</span>
                  <div className="editor-segment">
                    {typeOptions.map((optionKey) => (
                      <button
                        key={optionKey}
                        type="button"
                        className={`editor-chip ${trade.manualType === optionKey ? 'active' : ''}`}
                        onClick={() => onUpdateTrade(index, 'manualType', optionKey)}
                      >
                        {MANUAL_TYPE_MAP[optionKey].label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="editor-row">
                  <span className="form-label">市场</span>
                  <div className="editor-segment">
                    {['tse', 'pts', 'other'].map((market) => (
                      <button
                        key={market}
                        type="button"
                        className={`editor-chip ${trade.market === market ? 'active' : ''}`}
                        onClick={() => onUpdateTrade(index, 'market', market)}
                      >
                        {marketLabelFromKey(market)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="editor-row two">
                  <label className="field-group">
                    <span className="form-label">数量</span>
                    <input
                      type="text"
                      className="form-input"
                      inputMode="numeric"
                      value={trade.quantity ?? ''}
                      placeholder="100"
                      onChange={(event) => onUpdateTrade(index, 'quantity', event.target.value)}
                    />
                  </label>
                  <label className="field-group">
                    <span className="form-label">单价</span>
                    <input
                      type="text"
                      className="form-input"
                      inputMode="decimal"
                      value={trade.price ?? ''}
                      placeholder="1234.5"
                      onChange={(event) => onUpdateTrade(index, 'price', event.target.value)}
                    />
                  </label>
                </div>

                <div className="trade-readout">
                  <span className="meta-label">估算成交金额</span>
                  <strong>{formatMoney(gross, { signed: false })}</strong>
                  <span className="trade-subline">
                    {trade.assetType === 'margin' ? '信用' : '现物'}快照比例 {ratio?.numerator || 1} / {ratio?.denominator || 3}
                  </span>
                </div>

                <details className="trade-advanced">
                  <summary>更多字段</summary>
                  <div className="trade-advanced-body">
                    <div className="editor-row two">
                      <label className="field-group">
                        <span className="form-label">期限</span>
                        <input
                          type="text"
                          className="form-input"
                          value={trade.term || ''}
                          placeholder="-- / 6ヶ月"
                          onChange={(event) => onUpdateTrade(index, 'term', event.target.value)}
                        />
                      </label>
                      <label className="field-group">
                        <span className="form-label">预り</span>
                        <input
                          type="text"
                          className="form-input"
                          value={trade.custody || ''}
                          placeholder="特定 / NISA(成)"
                          onChange={(event) => onUpdateTrade(index, 'custody', event.target.value)}
                        />
                      </label>
                    </div>
                    <div className="editor-row two">
                      <label className="field-group">
                        <span className="form-label">课税</span>
                        <input
                          type="text"
                          className="form-input"
                          value={trade.taxCategory || ''}
                          placeholder="-- / 非課税"
                          onChange={(event) => onUpdateTrade(index, 'taxCategory', event.target.value)}
                        />
                      </label>
                      <label className="field-group">
                        <span className="form-label">受渡日</span>
                        <input
                          type="date"
                          className="form-input"
                          value={trade.settlementDate || ''}
                          onChange={(event) => onUpdateTrade(index, 'settlementDate', event.target.value)}
                        />
                      </label>
                    </div>
                    <div className="editor-row two">
                      <label className="field-group">
                        <span className="form-label">手续费</span>
                        <input
                          type="text"
                          className="form-input"
                          inputMode="decimal"
                          value={trade.fee ?? ''}
                          onChange={(event) => onUpdateTrade(index, 'fee', event.target.value)}
                        />
                      </label>
                      <label className="field-group">
                        <span className="form-label">税额</span>
                        <input
                          type="text"
                          className="form-input"
                          inputMode="decimal"
                          value={trade.taxAmount ?? ''}
                          onChange={(event) => onUpdateTrade(index, 'taxAmount', event.target.value)}
                        />
                      </label>
                    </div>
                    <label className="field-group">
                      <span className="form-label">受渡金额 / 决済损益</span>
                      <input
                        type="text"
                        className="form-input"
                        inputMode="decimal"
                        value={trade.settlementAmount ?? ''}
                        placeholder="可留空让系统按数量×单价估算"
                        onChange={(event) => onUpdateTrade(index, 'settlementAmount', event.target.value)}
                      />
                    </label>
                    <label className="field-group">
                      <span className="form-label">备注</span>
                      <textarea
                        className="form-input"
                        rows="3"
                        value={trade.notes || ''}
                        placeholder="可选备注"
                        onChange={(event) => onUpdateTrade(index, 'notes', event.target.value)}
                      />
                    </label>
                  </div>
                </details>
              </article>
            );
          })}
        </div>

        <button type="button" className="add-trade-btn" onClick={onAddTrade}>+ 再添加一笔</button>

        <div className="sheet-actions">
          {state.mode === 'edit' ? (
            <button type="button" className="ghost-btn danger" onClick={onDeleteDay}>删除当天记录</button>
          ) : null}
          <div className="sheet-actions-spacer" />
          <button type="button" className="ghost-btn" onClick={onCancel}>取消</button>
          <button type="button" className="primary-btn" onClick={onSave}>保存</button>
        </div>
      </div>
    </div>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  return <div className={`toast-banner ${toast.tone}`}>{toast.text}</div>;
}

export function App() {
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [ready, setReady] = useState(false);
  const [initialError, setInitialError] = useState('');
  const [activeTab, setActiveTab] = useState('home');
  const [dashboardScope, setDashboardScope] = useState('all');
  const [analysisScope, setAnalysisScope] = useState('all');
  const [dividendScope, setDividendScope] = useState('all');
  const [chartRange, setChartRange] = useState('week');
  const [chartType, setChartType] = useState('cumulative');
  const [recordsPage, setRecordsPage] = useState(0);
  const [recordFilters, setRecordFilters] = useState(DEFAULT_RECORD_FILTERS);
  const [manualSheet, setManualSheet] = useState(createEmptySheetState());
  const [ratioSheet, setRatioSheet] = useState(createRatioState());
  const [confirmState, setConfirmState] = useState({ open: false, mode: 'local' });
  const [firebaseDraft, setFirebaseDraft] = useState('');
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);
  const [toast, setToast] = useState(null);
  const csvInputRef = useRef(null);
  const deferredSearch = useDeferredValue(recordFilters.search);

  const applySnapshot = useEffectEvent((nextSnapshot) => {
    startTransition(() => {
      setSnapshot(nextSnapshot);
      setFirebaseDraft(nextSnapshot.firebase.configText || '');
    });
  });

  useEffect(() => {
    let active = true;

    initializeTradeCore()
      .then((nextSnapshot) => {
        if (!active) return;
        applySnapshot(nextSnapshot);
        setReady(true);
      })
      .catch((error) => {
        if (!active) return;
        setInitialError(error.message || String(error));
      });

    return () => {
      active = false;
    };
  }, [applySnapshot]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    setRecordsPage(0);
  }, [dashboardScope, deferredSearch, recordFilters.month, recordFilters.source, recordFilters.outcome, recordFilters.sort, recordFilters.compact]);

  async function syncSnapshot() {
    applySnapshot(getTradeAppSnapshot());
  }

  async function runTask(task, options = {}) {
    try {
      const result = await task();
      if (result?.version) {
        applySnapshot(result);
      } else if (result?.snapshot?.version) {
        applySnapshot(result.snapshot);
      } else {
        await syncSnapshot();
      }
      if (options.successText) {
        setToast({ tone: 'success', text: options.successText });
      }
      return result;
    } catch (error) {
      setToast({ tone: 'danger', text: error.message || String(error) });
      throw error;
    }
  }

  function openAddSheet() {
    const date = todayStr();
    setManualSheet({
      open: true,
      mode: 'add',
      dayId: '',
      date,
      trades: [createManualTrade({ order: 0, date })]
    });
  }

  function openEditSheet(day) {
    setManualSheet({
      open: true,
      mode: 'edit',
      dayId: day.id,
      date: day.date,
      trades: cloneValue(day.trades)
    });
  }

  function closeManualSheet() {
    setManualSheet(createEmptySheetState());
  }

  function handleManualTradeUpdate(index, field, value) {
    setManualSheet((current) => {
      const nextTrades = [...current.trades];
      const existing = nextTrades[index];
      if (!existing) return current;

      let nextTrade = { ...existing, updatedAt: new Date().toISOString() };

      if (field === 'assetType') {
        const fallbackType = value === 'margin' ? 'margin_open_long' : 'spot_buy';
        nextTrade = applyManualTypeToTrade(nextTrade, fallbackType, current.date || todayStr());
      } else if (field === 'manualType') {
        nextTrade = applyManualTypeToTrade(nextTrade, value, current.date || todayStr());
      } else {
        nextTrade = normalizeTrade({
          ...nextTrade,
          [field]: value
        }, current.date || todayStr(), index);

        if (field === 'symbol' && !trimText(existing.name)) {
          const autoName = getStockDisplayName(value, '');
          if (autoName && autoName !== value) {
            nextTrade = normalizeTrade({
              ...nextTrade,
              name: autoName
            }, current.date || todayStr(), index);
          }
        }
      }

      nextTrades[index] = nextTrade;
      return {
        ...current,
        trades: nextTrades
      };
    });
  }

  function handleManualRemove(index) {
    setManualSheet((current) => {
      const nextTrades = current.trades.filter((_, tradeIndex) => tradeIndex !== index);
      return {
        ...current,
        trades: nextTrades.length ? nextTrades : [createManualTrade({ order: 0, date: current.date || todayStr() })]
      };
    });
  }

  function handleManualAdd() {
    setManualSheet((current) => ({
      ...current,
      trades: [...current.trades, createManualTrade({ order: current.trades.length, date: current.date || todayStr() })]
    }));
  }

  async function handleManualSave() {
    await runTask(
      () => upsertManualDay({
        date: manualSheet.date,
        trades: manualSheet.trades,
        dayId: manualSheet.mode === 'edit' ? manualSheet.dayId : ''
      }),
      {
        successText: manualSheet.mode === 'edit' ? '这一天的交易已更新。' : '新的手动交易已保存。'
      }
    );
    closeManualSheet();
    setActiveTab('records');
  }

  async function handleDeleteDay() {
    if (!manualSheet.dayId) return;
    await runTask(() => removeDayById(manualSheet.dayId), { successText: '该交易日已删除。' });
    closeManualSheet();
  }

  function openRatioEditor(target) {
    if (!window.confirm('注意！修改前分红将不受新比例影响！')) return;
    const rule = snapshot.settings.dividendRules[target];
    setRatioSheet({
      open: true,
      target,
      numerator: String(rule?.numerator || 1),
      denominator: String(rule?.denominator || 1)
    });
  }

  async function handleRatioSave() {
    const next = updateDividendRule(ratioSheet.target, ratioSheet.numerator, ratioSheet.denominator);
    applySnapshot(next);
    setRatioSheet(createRatioState());
    setToast({ tone: 'success', text: '新的分红比例已保存，只会影响后续新增交易。' });
  }

  async function handleCsvImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const summary = await importCsvFile(file);
      await syncSnapshot();
      setActiveTab('records');
      setToast({
        tone: 'success',
        text: `CSV 导入完成：导入 ${summary.importedRows} 行，忽略投信 ${summary.skippedInvestmentTrust} 行。`
      });
    } catch (error) {
      setToast({ tone: 'danger', text: error.message || String(error) });
    } finally {
      event.target.value = '';
    }
  }

  async function handleFirebaseConfigSave() {
    const result = await runTask(() => saveFirebaseConfig(firebaseDraft));
    if (result?.requiresRefresh) {
      setToast({
        tone: 'warning',
        text: 'Firebase 项目已切换。请刷新页面后重新连接。'
      });
    } else {
      setToast({ tone: 'success', text: 'Firebase 配置已保存。' });
    }
  }

  async function handleCloudAction(type) {
    if (type === 'login') {
      await runTask(() => signInWithGoogle());
      return;
    }
    if (type === 'logout') {
      await runTask(() => signOutFromFirebase(), { successText: '已退出当前 Google 云账号。' });
      return;
    }
    if (type === 'push') {
      await runTask(() => pushToCloud({ notify: false }), { successText: '本地数据已上传到云端。' });
      return;
    }
    if (type === 'pull') {
      await runTask(() => pullFromCloud({ notify: false }), { successText: '已从云端拉取，并覆盖本地数据。' });
    }
  }

  async function handleDangerConfirm() {
    if (confirmState.mode === 'cloud') {
      await runTask(() => clearCloudTradeData(), { successText: '云端数据已清除，本地未受影响。' });
    } else {
      await runTask(() => clearLocalTradeData(), { successText: '本地数据已清除，云端未受影响。' });
    }
    setConfirmState({ open: false, mode: 'local' });
  }

  const dashboardSummary = snapshot.analytics.summaries[dashboardScope];
  const analysisSummary = snapshot.analytics.summaries[analysisScope];
  const dividendSummary = snapshot.analytics.summaries[dividendScope];
  const dashboardTimeline = buildDashboardTimeline(snapshot.analytics.daysAsc, dashboardScope, chartRange);
  const chartData = buildLineChartData(dashboardTimeline, dashboardScope, chartType);
  const monthlyChartData = buildBarChartData(analysisSummary);
  const healthReport = buildHealthReport(snapshot.days);
  const dashboardDiagnostics = buildAnalysisDiagnostics(
    dashboardSummary,
    snapshot.analytics.trades.filter((trade) => dashboardScope === 'all' || trade.assetType === dashboardScope)
  );
  const analysisDiagnostics = buildAnalysisDiagnostics(
    analysisSummary,
    snapshot.analytics.trades.filter((trade) => analysisScope === 'all' || trade.assetType === analysisScope)
  );
  const currentMonthKey = todayStr().slice(0, 7);
  const currentMonthProfit = dashboardSummary.monthly.find((item) => item.month === currentMonthKey)?.profit || 0;
  const latestDay = snapshot.analytics.daysDesc.find((day) => day.scopes[dashboardScope].tradeCount > 0);
  const configPreview = parseConfigPreview(firebaseDraft);
  const monthOptions = getMonthOptions(snapshot.days);
  const dashboardExtremes = findExtremeDays(snapshot.analytics.daysDesc, dashboardScope);
  const analysisExtremes = findExtremeDays(snapshot.analytics.daysDesc, analysisScope);
  const monthlyHighlights = buildMonthlyHighlights(analysisSummary.monthly);
  const bestStock = analysisSummary.ranking[0] || null;
  const worstStock = [...analysisSummary.ranking].reverse().find((item) => item.profit < 0) || analysisSummary.ranking[analysisSummary.ranking.length - 1] || null;
  const latestDividendEntry = dividendSummary.dividendHistory[0] || null;
  const recordFilterBadges = buildRecordFilterBadges(recordFilters);
  const currentAccountLabel = snapshot.firebase.user?.email
    ? maskEmail(snapshot.firebase.user.email)
    : (configPreview?.projectId ? '已配置，未登录' : '尚未配置');

  const filteredRecordDays = snapshot.analytics.daysDesc
    .filter((day) => day.scopes[dashboardScope].tradeCount > 0)
    .filter((day) => (recordFilters.month === 'all' ? true : day.date.slice(0, 7) === recordFilters.month))
    .filter((day) => {
      const normalizedSearch = trimText(deferredSearch).toLowerCase();
      if (!normalizedSearch) return true;
      return day.trades.some((trade) => {
        if (dashboardScope !== 'all' && trade.assetType !== dashboardScope) return false;
        const haystack = [
          trade.symbol,
          trade.name,
          trade.notes,
          trade.tradeTypeLabel
        ].join(' ').toLowerCase();
        return haystack.includes(normalizedSearch);
      });
    })
    .filter((day) => {
      if (recordFilters.source === 'all') return true;
      const trades = day.trades.filter((trade) => dashboardScope === 'all' || trade.assetType === dashboardScope);
      if (recordFilters.source === 'csv') return trades.some((trade) => trade.fingerprint);
      return trades.some((trade) => !trade.fingerprint);
    })
    .filter((day) => {
      const profit = day.scopes[dashboardScope].profit;
      if (recordFilters.outcome === 'win') return profit > 0;
      if (recordFilters.outcome === 'loss') return profit < 0;
      if (recordFilters.outcome === 'flat') return profit === 0;
      return true;
    })
    .sort((a, b) => {
      if (recordFilters.sort === 'profit') {
        return Math.abs(b.scopes[dashboardScope].profit) - Math.abs(a.scopes[dashboardScope].profit);
      }
      if (recordFilters.sort === 'oldest') {
        return a.date.localeCompare(b.date);
      }
      return b.date.localeCompare(a.date);
    });

  const filteredRecordSummary = summarizeRecordDays(filteredRecordDays, dashboardScope);
  const hasActiveRecordFilters = Boolean(recordFilterBadges.length);

  const recordPageSize = recordFilters.compact ? 10 : RECORDS_PAGE_SIZE;
  const totalRecordPages = filteredRecordDays.length ? Math.ceil(filteredRecordDays.length / recordPageSize) : 0;
  const safeRecordsPage = totalRecordPages ? Math.min(recordsPage, totalRecordPages - 1) : 0;
  const visibleRecordDays = filteredRecordDays.slice(safeRecordsPage * recordPageSize, (safeRecordsPage + 1) * recordPageSize);

  if (!ready && !initialError) {
    return (
      <div className="app-shell">
        <div className="app-page loading-page">
          <div className="loading-card">
            <div className="loading-dot" />
            <h1>正在装配新的 React 版本…</h1>
            <p>先把本地数据、公司资料和云登录状态接起来。</p>
          </div>
        </div>
      </div>
    );
  }

  if (initialError) {
    return (
      <div className="app-shell">
        <div className="app-page loading-page">
          <div className="loading-card error">
            <h1>应用初始化失败</h1>
            <p>{initialError}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-layer">
        <div className="bg-orb orb-a" />
        <div className="bg-orb orb-b" />
        <div className="bg-grid" />
      </div>

      <input
        ref={csvInputRef}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={handleCsvImport}
      />

      <div className="app-shell app-shell-react">
        {activeTab === 'home' ? (
          <div className="app-page tab-page">
            <section className="page-hero page-hero-home">
              <div className="page-hero-main">
                <div>
                  <div className="section-kicker">Trade Ledger</div>
                  <h1>交易总览</h1>
                  <p>累计收益、最近节奏、当前在仓、同步状态和数据健康，第一屏直接扫完。</p>
                </div>
                <div className="page-hero-side">
                  <div className="date-chip">{formatDateParts(todayStr()).fullLabel}</div>
                  <div className="hero-account-card">
                    <span>云账号</span>
                    <strong>{currentAccountLabel}</strong>
                  </div>
                </div>
              </div>
              <div className="page-hero-toolbar">
                <ScopeToggle value={dashboardScope} onChange={setDashboardScope} ownerLabel="dashboard-home" />
                <div className="quick-action-row">
                  <button type="button" className="secondary-btn" onClick={openAddSheet}>手动录入</button>
                  <button type="button" className="ghost-btn" onClick={() => csvInputRef.current?.click()}>导入 CSV</button>
                  <button type="button" className="ghost-btn" onClick={() => setActiveTab('settings')}>同步设置</button>
                </div>
              </div>
            </section>

            <div className="dashboard-grid">
              <div className="dashboard-main-stack">
                <section className="card hero-overview-card">
                  <div className="hero-overview-head">
                    <div>
                      <div className="section-kicker">核心收益</div>
                      <h2>收益和节奏先看这一块</h2>
                    </div>
                    <StatusBadge tone={snapshot.firebase.isSignedIn ? 'success' : 'warning'}>
                      {snapshot.firebase.isSignedIn ? '云同步已连接' : '云同步未连接'}
                    </StatusBadge>
                  </div>
                  <div className="hero-overview-grid">
                    <div className="hero-overview-primary">
                      <span className="summary-label">累计已实现收益</span>
                      <strong className={`mega-profit ${getValueTone(dashboardSummary.totalProfit)}`}>
                        {formatMoney(dashboardSummary.totalProfit, { signed: false })}
                      </strong>
                      <p className="summary-note">
                        {dashboardSummary.closeTradeCount
                          ? `${dashboardSummary.closeTradeCount} 笔已实现平仓 / 卖出`
                          : '还没有已实现收益记录'}
                        {dashboardSummary.financingCost > 0 ? ` · 已扣融资成本 ${formatMoney(dashboardSummary.financingCost, { signed: false })}` : ''}
                      </p>
                    </div>
                    <div className="hero-overview-metrics">
                      <article className="mini-stat highlight">
                        <span>今天收益</span>
                        <strong className={getValueTone(dashboardSummary.today.profit)}>
                          {formatMoney(dashboardSummary.today.profit)}
                        </strong>
                      </article>
                      <article className="mini-stat">
                        <span>本周收益</span>
                        <strong className={getValueTone(dashboardSummary.week.profit)}>
                          {formatMoney(dashboardSummary.week.profit)}
                        </strong>
                      </article>
                      <article className="mini-stat">
                        <span>本月收益</span>
                        <strong className={getValueTone(currentMonthProfit)}>
                          {formatMoney(currentMonthProfit)}
                        </strong>
                      </article>
                      <article className="mini-stat">
                        <span>当前在仓</span>
                        <strong>{dashboardSummary.positionsCount}</strong>
                      </article>
                    </div>
                  </div>
                  <div className="hero-signal-row">
                    <article className="signal-chip-card">
                      <span>按日胜率</span>
                      <strong>{formatPercent(dashboardSummary.winRate)}</strong>
                    </article>
                    <article className="signal-chip-card">
                      <span>按笔胜率</span>
                      <strong>{formatPercent(dashboardDiagnostics.tradeWinRate)}</strong>
                    </article>
                    <article className="signal-chip-card">
                      <span>本周分红</span>
                      <strong className={getValueTone(dashboardSummary.week.dividend)}>
                        {formatMoney(dashboardSummary.week.dividend)}
                      </strong>
                    </article>
                    <article className="signal-chip-card">
                      <span>最大回撤</span>
                      <strong className="negative">
                        {formatMoney(dashboardDiagnostics.maxDrawdown, { signed: false })}
                      </strong>
                    </article>
                  </div>
                </section>

                <section className="card chart-stage-card">
                  <div className="card-header chart-card-header">
                    <div>
                      <div className="section-kicker">收益趋势</div>
                      <h2>{chartType === 'cumulative' ? '累计收益走势' : '日收益走势'}</h2>
                    </div>
                    <div className="chart-controls">
                      <SegmentedControl
                        value={chartRange}
                        onChange={setChartRange}
                        ownerLabel="chart-range"
                        className="mini-toggle"
                        compact
                        options={[
                          { value: 'week', label: '近7天' },
                          { value: 'month', label: '近30天' },
                          { value: 'all', label: '全部' }
                        ]}
                      />
                      <SegmentedControl
                        value={chartType}
                        onChange={setChartType}
                        ownerLabel="chart-type"
                        className="mini-toggle"
                        compact
                        options={[
                          { value: 'cumulative', label: '累计' },
                          { value: 'daily', label: '每日' }
                        ]}
                      />
                    </div>
                  </div>
                  <div className="chart-stage-summary">
                    <div className="chart-summary-item">
                      <span>区间交易日</span>
                      <strong>{dashboardTimeline.length}</strong>
                    </div>
                    <div className="chart-summary-item">
                      <span>最强单日</span>
                      <strong className={dashboardExtremes.best ? getValueTone(dashboardExtremes.best.scopes[dashboardScope].profit) : 'neutral'}>
                        {dashboardExtremes.best ? formatMoney(dashboardExtremes.best.scopes[dashboardScope].profit) : '暂无'}
                      </strong>
                    </div>
                    <div className="chart-summary-item">
                      <span>最弱单日</span>
                      <strong className={dashboardExtremes.worst ? getValueTone(dashboardExtremes.worst.scopes[dashboardScope].profit) : 'neutral'}>
                        {dashboardExtremes.worst ? formatMoney(dashboardExtremes.worst.scopes[dashboardScope].profit) : '暂无'}
                      </strong>
                    </div>
                  </div>
                  <div className="chart-box">
                    {dashboardTimeline.length ? (
                      <Line
                        data={chartData}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          interaction: {
                            mode: 'index',
                            intersect: false
                          },
                          plugins: {
                            legend: { display: false },
                            tooltip: {
                              displayColors: false,
                              callbacks: {
                                title: (items) => {
                                  const point = dashboardTimeline[items[0]?.dataIndex];
                                  return point ? formatDateParts(point.date).fullLabel : '';
                                },
                                label: (context) => {
                                  const point = dashboardTimeline[context.dataIndex];
                                  if (!point) return '';
                                  return [
                                    `当日收益 ${formatMoney(point.profit)}`,
                                    `累计收益 ${formatMoney(point.cumulative)}`,
                                    `交易 ${point.tradeCount} 笔`,
                                    `分红 ${formatMoney(point.dividend)}`
                                  ];
                                }
                              }
                            }
                          },
                          scales: {
                            x: {
                              grid: { display: false },
                              ticks: { color: 'rgba(70, 48, 32, 0.58)', maxRotation: 0 }
                            },
                            y: {
                              grid: { color: 'rgba(92, 66, 48, 0.08)' },
                              ticks: {
                                color: 'rgba(70, 48, 32, 0.58)',
                                maxTicksLimit: 5,
                                callback: (value) => `¥${value}`
                              }
                            }
                          }
                        }}
                      />
                    ) : (
                      <div className="empty-state">
                        <div className="empty-icon">📈</div>
                        <div className="empty-title">这个范围还没有收益曲线</div>
                        <div className="empty-desc">先导入 CSV 或手动录入后，这里会出现趋势。</div>
                      </div>
                    )}
                  </div>
                </section>

                <section className="summary-grid dashboard-summary-grid">
                  <SummaryCard label="交易天数" value={dashboardSummary.activeDays} note="有交易的日期" />
                  <SummaryCard label="交易标的" value={dashboardSummary.symbolCount} note="去重后的代码数" />
                  <SummaryCard
                    label="今日分红"
                    value={formatMoney(dashboardSummary.today.dividend)}
                    note={dashboardSummary.today.tradeCount ? `今日 ${dashboardSummary.today.tradeCount} 笔交易` : '今天暂无分红'}
                    tone={getValueTone(dashboardSummary.today.dividend)}
                  />
                  <SummaryCard
                    label="累计融资成本"
                    value={formatMoney(dashboardSummary.financingCost, { signed: false })}
                    note="已从信用收益中扣除"
                    tone={dashboardSummary.financingCost > 0 ? 'negative' : 'neutral'}
                  />
                </section>
              </div>

              <div className="dashboard-side-stack">
                <section className="card side-panel-card">
                  <div className="card-header">
                    <div>
                      <div className="section-kicker">近期动向</div>
                      <h2>最近在发生什么</h2>
                    </div>
                  </div>
                  <div className="insight-list">
                    <article className="insight-card">
                      <span className="insight-label">最近交易日</span>
                      <strong>{latestDay ? formatDateParts(latestDay.date).fullLabel : '暂无记录'}</strong>
                      <span className="insight-note">
                        {latestDay
                          ? `${latestDay.scopes[dashboardScope].tradeCount} 笔交易 · ${formatMoney(latestDay.scopes[dashboardScope].profit)}`
                          : '录入后会在这里显示最近活动'}
                      </span>
                    </article>
                    <article className="insight-card">
                      <span className="insight-label">最佳单日</span>
                      <strong>{dashboardExtremes.best ? formatDateParts(dashboardExtremes.best.date).label : '暂无'}</strong>
                      <span className={`insight-note ${dashboardExtremes.best ? getValueTone(dashboardExtremes.best.scopes[dashboardScope].profit) : ''}`}>
                        {dashboardExtremes.best ? formatMoney(dashboardExtremes.best.scopes[dashboardScope].profit) : '暂无交易'}
                      </span>
                    </article>
                    <article className="insight-card">
                      <span className="insight-label">最大回吐日</span>
                      <strong>{dashboardExtremes.worst ? formatDateParts(dashboardExtremes.worst.date).label : '暂无'}</strong>
                      <span className={`insight-note ${dashboardExtremes.worst ? getValueTone(dashboardExtremes.worst.scopes[dashboardScope].profit) : ''}`}>
                        {dashboardExtremes.worst ? formatMoney(dashboardExtremes.worst.scopes[dashboardScope].profit) : '暂无交易'}
                      </span>
                    </article>
                  </div>
                </section>

                <section className="card side-panel-card">
                  <div className="card-header">
                    <div>
                      <div className="section-kicker">健康检查</div>
                      <h2>数据可信度</h2>
                    </div>
                  </div>
                  <div className="health-grid">
                    <div className="health-item">
                      <span>重复记录</span>
                      <strong>{healthReport.duplicateCount}</strong>
                    </div>
                    <div className="health-item">
                      <span>未匹配平仓</span>
                      <strong>{healthReport.orphanCloseCount}</strong>
                    </div>
                    <div className="health-item">
                      <span>当前在仓</span>
                      <strong>{snapshot.analytics.summaries.all.positionsCount}</strong>
                    </div>
                  </div>
                  {(healthReport.duplicateExamples.length || healthReport.orphanExamples.length) ? (
                    <div className="health-list">
                      {healthReport.duplicateExamples.map((item, index) => (
                        <div className="health-row" key={`dup-${index}`}>
                          <span className="chip warning">重复</span>
                          <span>{formatDateParts(item.date).label} · {getStockDisplayName(item.symbol, item.name)} · {item.tradeTypeLabel}</span>
                        </div>
                      ))}
                      {healthReport.orphanExamples.map((item, index) => (
                        <div className="health-row" key={`orphan-${index}`}>
                          <span className="chip danger">未匹配</span>
                          <span>{formatDateParts(item.date).label} · {getStockDisplayName(item.symbol, item.name)} · 缺少 {item.missingQuantity} 股对应仓位</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="empty-desc">当前数据看起来是干净的，没有明显重复，也没有卖出大于持仓的记录。</p>
                  )}
                </section>

                <section className="card side-panel-card">
                  <div className="card-header">
                    <div>
                      <div className="section-kicker">同步与导入</div>
                      <h2>当前工作状态</h2>
                    </div>
                  </div>
                  <div className="insight-list">
                    <article className="insight-card compact">
                      <span className="insight-label">CSV 导入</span>
                      <strong>{snapshot.settings.lastCsvImportAt ? formatDateParts(snapshot.settings.lastCsvImportAt).label : '尚未导入'}</strong>
                      <span className="insight-note">
                        {snapshot.settings.lastCsvImportSummary
                          ? `共 ${snapshot.settings.lastCsvImportSummary.totalRows} 行，导入 ${snapshot.settings.lastCsvImportSummary.importedRows} 行`
                          : '支持券商约定履历 CSV 导入'}
                      </span>
                    </article>
                    <article className="insight-card compact">
                      <span className="insight-label">同步模式</span>
                      <strong>镜像同步</strong>
                      <span className="insight-note">上传：本地覆盖云端；拉取：云端覆盖本地</span>
                    </article>
                    <article className="insight-card compact">
                      <span className="insight-label">当前版本</span>
                      <strong>v{snapshot.version}</strong>
                      <span className="insight-note">{snapshot.firebase.syncStatusText}</span>
                    </article>
                  </div>
                </section>
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === 'records' ? (
          <div className="app-page tab-page">
            <section className="page-hero">
              <div className="page-hero-main">
                <div>
                  <div className="section-kicker">交易记录</div>
                  <h1>查历史不该靠拼命下拉</h1>
                  <p>先筛范围，再看按日汇总和日内明细，尽量少做无效滚动。</p>
                </div>
                <div className="page-hero-side compact">
                  <div className="hero-account-card">
                    <span>命中交易日</span>
                    <strong>{filteredRecordDays.length}</strong>
                  </div>
                  <div className="hero-account-card">
                    <span>筛选收益</span>
                    <strong className={getValueTone(filteredRecordSummary.totalProfit)}>
                      {formatMoney(filteredRecordSummary.totalProfit)}
                    </strong>
                  </div>
                </div>
              </div>
            </section>

            <div className="records-layout">
              <aside className="card filter-panel">
                <div className="card-header">
                  <div>
                    <div className="section-kicker">筛选与视角</div>
                    <h2>{getScopeLabel(dashboardScope)}记录</h2>
                  </div>
                </div>
                <div className="filter-panel-stack">
                  <div className="field-group">
                    <span className="form-label">记录视角</span>
                    <ScopeToggle value={dashboardScope} onChange={setDashboardScope} ownerLabel="records" />
                  </div>
                  <label className="field-group">
                    <span className="form-label">月份</span>
                    <select
                      className="form-input"
                      value={recordFilters.month}
                      onChange={(event) => setRecordFilters((current) => ({ ...current, month: event.target.value }))}
                    >
                      <option value="all">全部</option>
                      {monthOptions.map((month) => (
                        <option key={month} value={month}>
                          {month.replace('-', '年')}月
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-group">
                    <span className="form-label">搜索股票 / 备注</span>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="代码、名称、备注、交易类型"
                      value={recordFilters.search}
                      onChange={(event) => setRecordFilters((current) => ({ ...current, search: event.target.value }))}
                    />
                  </label>
                  <div className="field-group">
                    <span className="form-label">来源</span>
                    <SegmentedControl
                      value={recordFilters.source}
                      onChange={(value) => setRecordFilters((current) => ({ ...current, source: value }))}
                      ownerLabel="record-source"
                      className="mini-toggle block"
                      compact
                      options={[
                        { value: 'all', label: '全部' },
                        { value: 'csv', label: 'CSV' },
                        { value: 'manual', label: '手动' }
                      ]}
                    />
                  </div>
                  <div className="field-group">
                    <span className="form-label">结果</span>
                    <SegmentedControl
                      value={recordFilters.outcome}
                      onChange={(value) => setRecordFilters((current) => ({ ...current, outcome: value }))}
                      ownerLabel="record-outcome"
                      className="mini-toggle block four"
                      compact
                      options={[
                        { value: 'all', label: '全部' },
                        { value: 'win', label: '盈利' },
                        { value: 'loss', label: '亏损' },
                        { value: 'flat', label: '平盘' }
                      ]}
                    />
                  </div>
                  <div className="field-group">
                    <span className="form-label">排序</span>
                    <SegmentedControl
                      value={recordFilters.sort}
                      onChange={(value) => setRecordFilters((current) => ({ ...current, sort: value }))}
                      ownerLabel="record-sort"
                      className="mini-toggle block"
                      compact
                      options={[
                        { value: 'desc', label: '最新' },
                        { value: 'oldest', label: '最早' },
                        { value: 'profit', label: '波动' }
                      ]}
                    />
                  </div>
                  <div className="field-group">
                    <span className="form-label">密度</span>
                    <SegmentedControl
                      value={recordFilters.compact ? 'compact' : 'comfortable'}
                      onChange={(value) => setRecordFilters((current) => ({ ...current, compact: value === 'compact' }))}
                      ownerLabel="record-density"
                      className="mini-toggle block"
                      compact
                      options={[
                        { value: 'comfortable', label: '舒适' },
                        { value: 'compact', label: '紧凑' }
                      ]}
                    />
                  </div>
                </div>
                {hasActiveRecordFilters ? (
                  <div className="filter-badge-wrap">
                    {recordFilterBadges.map((badge) => (
                      <StatusBadge key={badge.label} tone={badge.tone}>{badge.label}</StatusBadge>
                    ))}
                  </div>
                ) : (
                  <p className="empty-desc">当前没有额外筛选，显示该视角下的全部交易日。</p>
                )}
                <div className="settings-actions">
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => {
                      setRecordFilters({ ...DEFAULT_RECORD_FILTERS });
                      setRecordsPage(0);
                    }}
                  >
                    清空筛选
                  </button>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => {
                      setRecordFilters((current) => ({ ...current, sort: 'desc' }));
                      setRecordsPage(0);
                    }}
                  >
                    回到最新
                  </button>
                </div>
              </aside>

              <div className="records-main-stack">
                <section className="card results-hero-card">
                  <div className="results-hero-grid">
                    <article className="overview-card compact">
                      <span className="overview-label">筛选收益</span>
                      <strong className={`overview-value ${getValueTone(filteredRecordSummary.totalProfit)}`}>
                        {formatMoney(filteredRecordSummary.totalProfit)}
                      </strong>
                      <span className="overview-meta">命中 {filteredRecordDays.length} 个交易日</span>
                    </article>
                    <article className="overview-card compact">
                      <span className="overview-label">交易笔数</span>
                      <strong className="overview-value">{filteredRecordSummary.tradeCount}</strong>
                      <span className="overview-meta">当前页前先看整体工作量</span>
                    </article>
                    <article className="overview-card compact">
                      <span className="overview-label">盈利 / 亏损日</span>
                      <strong className="overview-value">{filteredRecordSummary.winDays} / {filteredRecordSummary.lossDays}</strong>
                      <span className="overview-meta">按日统计当前筛选结果</span>
                    </article>
                    <article className="overview-card compact">
                      <span className="overview-label">筛选分红</span>
                      <strong className={`overview-value ${getValueTone(filteredRecordSummary.dividend)}`}>
                        {formatMoney(filteredRecordSummary.dividend)}
                      </strong>
                      <span className="overview-meta">仅统计当前命中的交易日</span>
                    </article>
                  </div>
                </section>

                <section className="card">
                  <div className="records-toolbar">
                    <div className="records-page-meta">
                      {totalRecordPages ? `第 ${safeRecordsPage + 1} / ${totalRecordPages} 页 · 共 ${filteredRecordDays.length} 个交易日` : '共 0 页'}
                    </div>
                    <div className="records-pagination-controls">
                      <button
                        type="button"
                        className="ghost-btn pagination-btn"
                        disabled={!totalRecordPages || safeRecordsPage <= 0}
                        onClick={() => setRecordsPage((current) => Math.max(0, current - 1))}
                      >
                        上一页
                      </button>
                      <button
                        type="button"
                        className="ghost-btn pagination-btn"
                        disabled={!totalRecordPages || safeRecordsPage >= totalRecordPages - 1}
                        onClick={() => setRecordsPage((current) => Math.min(totalRecordPages - 1, current + 1))}
                      >
                        下一页
                      </button>
                    </div>
                  </div>

                  <div className="records-list">
                    {!visibleRecordDays.length ? (
                      <div className="empty-state">
                        <div className="empty-icon">📄</div>
                        <div className="empty-title">这个范围还没有记录</div>
                        <div className="empty-desc">切换筛选条件，或者先去设置页上传 CSV / 手动录入。</div>
                      </div>
                    ) : visibleRecordDays.map((day) => (
                      <RecordDayCard
                        key={day.id}
                        day={day}
                        scope={dashboardScope}
                        compact={recordFilters.compact}
                        onOpen={openEditSheet}
                      />
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === 'analysis' ? (
          <div className="app-page tab-page">
            <section className="page-hero">
              <div className="page-hero-main">
                <div>
                  <div className="section-kicker">分析</div>
                  <h1>不只看赚多少，也看怎么赚</h1>
                  <p>把收益、行为、回撤、交易节奏和标的贡献放在同一个工作台里。</p>
                </div>
                <div className="page-hero-toolbar single">
                  <ScopeToggle value={analysisScope} onChange={setAnalysisScope} ownerLabel="analysis" />
                </div>
              </div>
            </section>

            <section className="card analysis-hero-card">
              <div className="analysis-hero-grid">
                <div className="analysis-hero-main">
                  <span className="summary-label">总收益</span>
                  <strong className={`mega-profit ${getValueTone(analysisSummary.totalProfit)}`}>
                    {formatMoney(analysisSummary.totalProfit, { signed: false })}
                  </strong>
                  <p className="summary-note">
                    当前视角覆盖 {analysisSummary.tradeCount} 笔交易，已实现 {analysisDiagnostics.closeTradeCount} 笔。
                  </p>
                </div>
                <div className="analysis-hero-side">
                  <article className="mini-stat highlight">
                    <span>按日胜率</span>
                    <strong>{formatPercent(analysisSummary.winRate)}</strong>
                  </article>
                  <article className="mini-stat">
                    <span>按笔胜率</span>
                    <strong>{formatPercent(analysisDiagnostics.tradeWinRate)}</strong>
                  </article>
                  <article className="mini-stat">
                    <span>最大回撤</span>
                    <strong className="negative">{formatMoney(analysisDiagnostics.maxDrawdown, { signed: false })}</strong>
                  </article>
                  <article className="mini-stat">
                    <span>当前在仓</span>
                    <strong>{analysisSummary.positionsCount}</strong>
                  </article>
                </div>
              </div>
            </section>

            <div className="analysis-layout">
              <section className="card diagnostics-card">
                <div className="section-kicker">交易诊断</div>
                <h2>行为指标</h2>
                <div className="stats-table">
                  <div className="stats-row">
                    <span>平均单笔已实现收益</span>
                    <strong>{formatMoney(analysisDiagnostics.avgPerClose)}</strong>
                  </div>
                  <div className="stats-row">
                    <span>平均盈利交易</span>
                    <strong className="positive">{formatMoney(analysisDiagnostics.avgWin)}</strong>
                  </div>
                  <div className="stats-row">
                    <span>平均亏损交易</span>
                    <strong className="negative">{formatMoney(analysisDiagnostics.avgLoss)}</strong>
                  </div>
                  <div className="stats-row">
                    <span>盈亏比</span>
                    <strong>{analysisDiagnostics.profitFactor ? analysisDiagnostics.profitFactor.toFixed(2) : '0.00'}</strong>
                  </div>
                  <div className="stats-row">
                    <span>最长连胜 / 连亏</span>
                    <strong>{analysisDiagnostics.maxWinStreak} / {analysisDiagnostics.maxLossStreak} 天</strong>
                  </div>
                  <div className="stats-row">
                    <span>盈利笔数 / 亏损笔数</span>
                    <strong>{analysisDiagnostics.winTradeCount} / {analysisDiagnostics.lossTradeCount}</strong>
                  </div>
                </div>
              </section>

              <section className="card diagnostics-card">
                <div className="section-kicker">节奏统计</div>
                <h2>交易频率与高低点</h2>
                <div className="stats-table">
                  <div className="stats-row">
                    <span>总交易笔数</span>
                    <strong>{analysisSummary.tradeCount}</strong>
                  </div>
                  <div className="stats-row">
                    <span>平均每日交易</span>
                    <strong>{analysisSummary.activeDays ? (analysisSummary.tradeCount / analysisSummary.activeDays).toFixed(1) : '0'}</strong>
                  </div>
                  <div className="stats-row">
                    <span>最佳月份</span>
                    <strong className={monthlyHighlights.best ? getValueTone(monthlyHighlights.best.profit) : 'neutral'}>
                      {monthlyHighlights.best ? `${monthlyHighlights.best.month.replace('-', '/')} · ${formatMoney(monthlyHighlights.best.profit)}` : '暂无'}
                    </strong>
                  </div>
                  <div className="stats-row">
                    <span>最弱月份</span>
                    <strong className={monthlyHighlights.worst ? getValueTone(monthlyHighlights.worst.profit) : 'neutral'}>
                      {monthlyHighlights.worst ? `${monthlyHighlights.worst.month.replace('-', '/')} · ${formatMoney(monthlyHighlights.worst.profit)}` : '暂无'}
                    </strong>
                  </div>
                  <div className="stats-row">
                    <span>最佳单日</span>
                    <strong className={analysisExtremes.best ? getValueTone(analysisExtremes.best.scopes[analysisScope].profit) : 'neutral'}>
                      {analysisExtremes.best ? `${formatDateParts(analysisExtremes.best.date).label} · ${formatMoney(analysisExtremes.best.scopes[analysisScope].profit)}` : '暂无'}
                    </strong>
                  </div>
                  <div className="stats-row">
                    <span>累计融资成本</span>
                    <strong className="negative">{formatMoney(analysisSummary.financingCost, { signed: false })}</strong>
                  </div>
                </div>
              </section>

              <section className="card">
                <div className="card-header">
                  <div>
                    <div className="section-kicker">当前在仓</div>
                    <h2>仓位面板</h2>
                  </div>
                </div>
                <div className="stack-list">
                  {analysisSummary.positions.length ? analysisSummary.positions
                    .sort((a, b) => (b.quantity * b.avgPrice) - (a.quantity * a.avgPrice))
                    .map((position) => (
                      <article className="position-card" key={`${position.assetType}-${position.positionSide}-${position.symbol}`}>
                        <div className="position-head">
                          <div>
                            <div className="badge-row">
                              <span className={position.assetType === 'margin' ? 'badge badge-margin' : 'badge badge-cash'}>
                                {position.assetType === 'margin' ? '信用' : '现物'}
                              </span>
                              {position.positionSide === 'short' ? <span className="badge">空头</span> : null}
                            </div>
                            <div className="position-main">{getStockDisplayName(position.symbol, position.name)}</div>
                            <div className="position-sub">{position.symbol} · {marketLabelFromKey(position.market)}</div>
                          </div>
                          <div className="position-values">
                            <strong>{formatMoney(position.quantity * position.avgPrice, { signed: false })}</strong>
                            <span className="position-sub">{position.quantity} 股 · 均价 {formatMoney(position.avgPrice, { signed: false })}</span>
                          </div>
                        </div>
                      </article>
                    )) : (
                      <div className="empty-state">
                        <div className="empty-icon">📦</div>
                        <div className="empty-title">当前没有在仓标的</div>
                      </div>
                    )}
                </div>
              </section>

              <section className="card">
                <div className="card-header">
                  <div>
                    <div className="section-kicker">盈亏排行</div>
                    <h2>股票贡献度</h2>
                  </div>
                </div>
                {(bestStock || worstStock) ? (
                  <div className="results-hero-grid ranking-highlight-grid">
                    {bestStock ? (
                      <article className="overview-card compact">
                        <span className="overview-label">最大正贡献</span>
                        <strong className={`overview-value ${getValueTone(bestStock.profit)}`}>
                          {getStockDisplayName(bestStock.symbol, bestStock.name)}
                        </strong>
                        <span className="overview-meta">{formatMoney(bestStock.profit)} · 共 {bestStock.tradeCount} 笔</span>
                      </article>
                    ) : null}
                    {worstStock ? (
                      <article className="overview-card compact">
                        <span className="overview-label">最大负贡献</span>
                        <strong className={`overview-value ${getValueTone(worstStock.profit)}`}>
                          {getStockDisplayName(worstStock.symbol, worstStock.name)}
                        </strong>
                        <span className="overview-meta">{formatMoney(worstStock.profit)} · 共 {worstStock.tradeCount} 笔</span>
                      </article>
                    ) : null}
                  </div>
                ) : null}
                <div className="stack-list">
                  {analysisSummary.ranking.length ? analysisSummary.ranking.slice(0, 20).map((item, index) => (
                    <article className="rank-card" key={`${item.symbol}-${index}`}>
                      <div className="rank-head">
                        <div>
                          <div className="rank-main">#{index + 1} {getStockDisplayName(item.symbol, item.name)}</div>
                          <div className="rank-sub">{item.symbol} · 买 {item.buyCount} / 卖 {item.sellCount}</div>
                        </div>
                        <div className="rank-values">
                          <strong className={getValueTone(item.profit)}>{formatMoney(item.profit)}</strong>
                          <span className="rank-sub">共 {item.tradeCount} 笔</span>
                        </div>
                      </div>
                    </article>
                  )) : (
                    <div className="empty-state">
                      <div className="empty-icon">🏅</div>
                      <div className="empty-title">还没有已实现盈亏</div>
                    </div>
                  )}
                </div>
              </section>

              <section className="card analysis-chart-card">
                <div className="card-header">
                  <div>
                    <div className="section-kicker">月度收益</div>
                    <h2>按月看波动</h2>
                  </div>
                </div>
                <div className="chart-box monthly">
                  <Bar
                    data={monthlyChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { display: false },
                        tooltip: {
                          displayColors: false,
                          callbacks: {
                            label: (context) => `月收益 ${formatMoney(context.raw)}`
                          }
                        }
                      },
                      scales: {
                        x: {
                          grid: { display: false },
                          ticks: { color: 'rgba(70, 48, 32, 0.58)' }
                        },
                        y: {
                          grid: { color: 'rgba(92, 66, 48, 0.08)' },
                          ticks: {
                            color: 'rgba(70, 48, 32, 0.58)',
                            maxTicksLimit: 5,
                            callback: (value) => `¥${value}`
                          }
                        }
                      }
                    }}
                  />
                </div>
              </section>
            </div>
          </div>
        ) : null}

        {activeTab === 'dividend' ? (
          <div className="app-page tab-page">
            <section className="page-hero">
              <div className="page-hero-main">
                <div>
                  <div className="section-kicker">分红</div>
                  <h1>把分红规则做成特色模块</h1>
                  <p>区分现物和信用，也把规则快照、历史分红和留存关系拆得更清楚。</p>
                </div>
                <div className="page-hero-toolbar single">
                  <ScopeToggle value={dividendScope} onChange={setDividendScope} ownerLabel="dividend" />
                </div>
              </div>
            </section>

            <section className="notice-banner">
              <strong>统计口径：</strong> 仅统计从 {DIVIDEND_START_DATE} 起新增或平仓后产生的分红。
            </section>

            <div className="dividend-layout">
              <div className="dividend-main-stack">
                <section className="card dividend-hero-card">
                  <div className="hero-overview-head">
                    <div>
                      <div className="section-kicker">净分红</div>
                      <h2>{getScopeLabel(dividendScope)}视角</h2>
                    </div>
                    <StatusBadge tone={getValueTone(dividendSummary.netDividend)}>
                      当前净分红 {formatMoney(dividendSummary.netDividend)}
                    </StatusBadge>
                  </div>
                  <div className="hero-overview-grid">
                    <div className="hero-overview-primary">
                      <span className="summary-label">净分红</span>
                      <strong className={`mega-profit ${getValueTone(dividendSummary.netDividend)}`}>
                        {formatMoney(dividendSummary.netDividend)}
                      </strong>
                      <p className="summary-note">累计分红减去累计分担亏损后得到的净结果。</p>
                    </div>
                    <div className="hero-overview-metrics">
                      <article className="mini-stat highlight">
                        <span>今日分红</span>
                        <strong className={getValueTone(dividendSummary.today.dividend)}>
                          {formatMoney(dividendSummary.today.dividend)}
                        </strong>
                      </article>
                      <article className="mini-stat">
                        <span>本周分红</span>
                        <strong className={getValueTone(dividendSummary.week.dividend)}>
                          {formatMoney(dividendSummary.week.dividend)}
                        </strong>
                      </article>
                      <article className="mini-stat">
                        <span>累计分红</span>
                        <strong>{formatMoney(dividendSummary.totalDividend, { signed: false })}</strong>
                      </article>
                      <article className="mini-stat">
                        <span>累计分担亏损</span>
                        <strong className="negative">{formatMoney(dividendSummary.totalLossShare, { signed: false })}</strong>
                      </article>
                    </div>
                  </div>
                </section>

                <section className="card">
                  <div className="card-header">
                    <div>
                      <div className="section-kicker">最近一次结果</div>
                      <h2>分红前后对照</h2>
                    </div>
                  </div>
                  {latestDividendEntry ? (
                    <div className="stats-table">
                      <div className="stats-row">
                        <span>日期</span>
                        <strong>{formatDateParts(latestDividendEntry.date).fullLabel}</strong>
                      </div>
                      <div className="stats-row">
                        <span>分红前收益</span>
                        <strong className={getValueTone(latestDividendEntry.profit)}>{formatMoney(latestDividendEntry.profit)}</strong>
                      </div>
                      <div className="stats-row">
                        <span>分红结果</span>
                        <strong className={getValueTone(latestDividendEntry.dividend)}>{formatMoney(latestDividendEntry.dividend)}</strong>
                      </div>
                      <div className="stats-row emphasis">
                        <span>分红后留存</span>
                        <strong className={getValueTone(latestDividendEntry.profit - latestDividendEntry.dividend)}>
                          {formatMoney(latestDividendEntry.profit - latestDividendEntry.dividend)}
                        </strong>
                      </div>
                    </div>
                  ) : (
                    <div className="empty-state">
                      <div className="empty-icon">🎀</div>
                      <div className="empty-title">还没有分红历史</div>
                    </div>
                  )}
                </section>

                <section className="card">
                  <div className="card-header">
                    <div>
                      <div className="section-kicker">分红历史</div>
                      <h2>分红历史（2026年度起）</h2>
                    </div>
                  </div>
                  <div className="stack-list">
                    {dividendSummary.dividendHistory.length ? dividendSummary.dividendHistory.map((item) => (
                      <article className="history-card" key={item.date}>
                        <div className="history-head">
                          <div>
                            <div className="trade-title">{formatDateParts(item.date).fullLabel}</div>
                            <div className="trade-subline">分红前收益 {formatMoney(item.profit)}</div>
                          </div>
                          <div className={`dividend-amount ${getValueTone(item.dividend)}`}>
                            {formatMoney(item.dividend)}
                          </div>
                        </div>
                        <div className="history-metric-row">
                          <span>分红后留存</span>
                          <strong className={getValueTone(item.profit - item.dividend)}>
                            {formatMoney(item.profit - item.dividend)}
                          </strong>
                        </div>
                        <div className="meta-chips">
                          <span className="chip">总分红 {formatMoney(item.dividend)}</span>
                          {dividendScope === 'all' ? <span className="chip">现物 {formatMoney(item.cashDividend)}</span> : null}
                          {dividendScope === 'all' ? <span className="chip">信用 {formatMoney(item.marginDividend)}</span> : null}
                        </div>
                      </article>
                    )) : (
                      <div className="empty-state">
                        <div className="empty-icon">🎀</div>
                        <div className="empty-title">还没有分红历史</div>
                      </div>
                    )}
                  </div>
                </section>
              </div>

              <div className="dividend-side-stack">
                <section className="card">
                  <div className="card-header">
                    <div>
                      <div className="section-kicker">规则快照</div>
                      <h2>现行比例</h2>
                    </div>
                  </div>
                  <div className="ratio-grid">
                    {['cash', 'margin'].map((target) => {
                      const rule = snapshot.settings.dividendRules[target];
                      return (
                        <article className="ratio-card" key={target}>
                          <div className="ratio-card-top">
                            <span className={target === 'margin' ? 'badge badge-margin' : 'badge badge-cash'}>
                              {target === 'margin' ? '信用' : '现物'}
                            </span>
                            <strong className="ratio-value">{rule.numerator} / {rule.denominator}</strong>
                          </div>
                          <p className="ratio-meta">
                            新交易会套用这个比例 · {formatDateParts(rule.updatedAt || todayStr()).fullLabel}
                          </p>
                          <button type="button" className="secondary-btn" onClick={() => openRatioEditor(target)}>
                            修改分红比例
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </section>

                <section className="card">
                  <div className="card-header">
                    <div>
                      <div className="section-kicker">规则说明</div>
                      <h2>当前结算方式</h2>
                    </div>
                  </div>
                  <div className="insight-list">
                    <article className="insight-card compact">
                      <span className="insight-label">现物比例</span>
                      <strong>{snapshot.settings.dividendRules.cash.numerator} / {snapshot.settings.dividendRules.cash.denominator}</strong>
                      <span className="insight-note">正收益按比例分红，负收益按比例分担亏损。</span>
                    </article>
                    <article className="insight-card compact">
                      <span className="insight-label">信用比例</span>
                      <strong>{snapshot.settings.dividendRules.margin.numerator} / {snapshot.settings.dividendRules.margin.denominator}</strong>
                      <span className="insight-note">融资成本已先计入信用收益，再计算分红快照。</span>
                    </article>
                    <article className="insight-card compact">
                      <span className="insight-label">历史处理</span>
                      <strong>不回溯旧规则</strong>
                      <span className="insight-note">修改比例后，只影响后续新增交易；旧记录沿用各自快照。</span>
                    </article>
                  </div>
                </section>
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === 'settings' ? (
          <div className="app-page tab-page">
            <section className="page-hero">
              <div className="page-hero-main">
                <div>
                  <div className="section-kicker">设置</div>
                  <h1>录入、同步、清理都分区收好</h1>
                  <p>把高频动作单独摆出来，把开发味太重的配置收进高级区，把危险操作彻底隔开。</p>
                </div>
                <div className="page-hero-side compact">
                  <div className="hero-account-card">
                    <span>版本</span>
                    <strong>v{snapshot.version}</strong>
                  </div>
                  <div className="hero-account-card">
                    <span>云状态</span>
                    <strong>{snapshot.firebase.isSignedIn ? currentAccountLabel : '未登录'}</strong>
                  </div>
                </div>
              </div>
            </section>

            <div className="settings-layout">
              <section className="card settings-card-large">
                <div className="card-header">
                  <div>
                    <div className="section-kicker">录入与导入</div>
                    <h2>高频入口</h2>
                  </div>
                </div>
                <div className="settings-overview-grid">
                  <article className="status-card">
                    <span className="status-card-label">手动录入</span>
                    <strong className="status-card-value">按交易日追加</strong>
                    <p className="settings-note">支持现物 / 信用、买卖 / 开平仓、更多附加字段和当天合并保存。</p>
                  </article>
                  <article className="status-card">
                    <span className="status-card-label">CSV 数据</span>
                    <strong className="status-card-value">
                      {snapshot.settings.lastCsvImportAt ? `最近导入 ${formatDateParts(snapshot.settings.lastCsvImportAt).label}` : '还没有导入 CSV'}
                    </strong>
                    <p className="settings-note">
                      {snapshot.settings.lastCsvImportSummary
                        ? `最近一次共读取 ${snapshot.settings.lastCsvImportSummary.totalRows} 行，导入 ${snapshot.settings.lastCsvImportSummary.importedRows} 行，忽略投信 ${snapshot.settings.lastCsvImportSummary.skippedInvestmentTrust} 行。`
                        : '支持券商约定履历 CSV；只导入株式現物和信用数据，并会用最新 CSV 重建券商记录。'}
                    </p>
                  </article>
                </div>
                <div className="settings-actions">
                  <button type="button" className="primary-btn wide-btn" onClick={openAddSheet}>手动录入交易</button>
                  <button type="button" className="secondary-btn wide-btn" onClick={() => csvInputRef.current?.click()}>上传券商 CSV</button>
                </div>
              </section>

              <section className="card settings-card-large">
                <div className="card-header">
                  <div>
                    <div className="section-kicker">云同步（Firebase）</div>
                    <h2>账号与推拉策略</h2>
                  </div>
                </div>
                <div className="sync-rule-card">
                  <div className="sync-rule-row">
                    <strong>上传到云端</strong>
                    <span>以本地为准覆盖云端</span>
                  </div>
                  <div className="sync-rule-row">
                    <strong>从云端拉取</strong>
                    <span>以云端为准覆盖本地</span>
                  </div>
                </div>
                <div className="settings-overview-grid">
                  <article className="status-card">
                    <span className="status-card-label">当前云账号</span>
                    <strong className="status-card-value">{snapshot.firebase.isSignedIn ? currentAccountLabel : '尚未登录'}</strong>
                    <p className="settings-note">{snapshot.firebase.authStatusText}</p>
                  </article>
                  <article className="status-card">
                    <span className="status-card-label">同步状态</span>
                    <strong className="status-card-value">{snapshot.firebase.syncStatusText}</strong>
                    <p className="settings-note">同步中会锁定推拉按钮，避免覆盖冲突。</p>
                  </article>
                </div>
                <div className="settings-actions">
                  <button type="button" className="primary-btn" onClick={() => handleCloudAction('login')}>
                    {snapshot.firebase.isSignedIn ? '重新选择 Google 账号' : 'Google 登录'}
                  </button>
                  <button type="button" className="ghost-btn" disabled={!snapshot.firebase.isSignedIn} onClick={() => handleCloudAction('logout')}>
                    退出
                  </button>
                </div>
                <div className="settings-actions">
                  <button type="button" className="primary-btn" disabled={!snapshot.firebase.isSignedIn || snapshot.firebase.isSyncing} onClick={() => handleCloudAction('push')}>
                    上传到云端
                  </button>
                  <button type="button" className="ghost-btn" disabled={!snapshot.firebase.isSignedIn || snapshot.firebase.isSyncing} onClick={() => handleCloudAction('pull')}>
                    从云端拉取
                  </button>
                </div>
              </section>

              <section className="card settings-card-large">
                <div className="card-header">
                  <div>
                    <div className="section-kicker">健康与高级配置</div>
                    <h2>当前状态</h2>
                  </div>
                </div>
                <div className="settings-overview-grid">
                  <article className="status-card">
                    <span className="status-card-label">数据健康</span>
                    <strong className="status-card-value">{healthReport.duplicateCount + healthReport.orphanCloseCount ? '需要关注' : '状态良好'}</strong>
                    <p className="settings-note">重复 {healthReport.duplicateCount} 条，未匹配平仓 {healthReport.orphanCloseCount} 条。</p>
                  </article>
                  <article className="status-card">
                    <span className="status-card-label">Firebase 项目</span>
                    <strong className="status-card-value">{configPreview?.projectId || '未配置'}</strong>
                    <p className="settings-note">{configPreview?.authDomain || '尚未填写 Firebase Web 配置。'}</p>
                  </article>
                </div>
                <button type="button" className="settings-inline-toggle" onClick={() => setShowAdvancedConfig((current) => !current)}>
                  {showAdvancedConfig ? '收起高级配置' : '查看高级配置'}
                </button>
                {showAdvancedConfig ? (
                  <div className="advanced-config-panel">
                    <div className="config-preview-grid">
                      <div className="config-preview-item">
                        <span>Project</span>
                        <strong>{configPreview?.projectId || '未配置'}</strong>
                      </div>
                      <div className="config-preview-item">
                        <span>Domain</span>
                        <strong>{configPreview?.authDomain || '未配置'}</strong>
                      </div>
                    </div>
                    <label className="field-group">
                      <span className="form-label">Firebase Web 配置</span>
                      <textarea
                        className="form-input"
                        rows="8"
                        value={firebaseDraft}
                        placeholder={'可以直接粘贴 firebaseConfig，例如：\nconst firebaseConfig = {\n  apiKey: "...",\n  authDomain: "...",\n  projectId: "...",\n  appId: "..."\n};'}
                        onChange={(event) => setFirebaseDraft(event.target.value)}
                      />
                    </label>
                    <div className="settings-actions">
                      <button type="button" className="ghost-btn" onClick={handleFirebaseConfigSave}>保存配置</button>
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="card settings-card-large danger-zone">
                <div className="card-header">
                  <div>
                    <div className="section-kicker">危险操作</div>
                    <h2>清除数据前先确认影响范围</h2>
                  </div>
                </div>
                <button type="button" className="settings-item danger" onClick={() => setConfirmState({ open: true, mode: 'local' })}>
                  <div>
                    <strong>清除本地数据</strong>
                    <p>清除当前设备上的交易记录和本地设置，不影响 Firebase 云端数据。</p>
                  </div>
                  <span>›</span>
                </button>
                <button
                  type="button"
                  className="settings-item danger"
                  disabled={!snapshot.firebase.isSignedIn}
                  onClick={() => setConfirmState({ open: true, mode: 'cloud' })}
                >
                  <div>
                    <strong>清除云端数据</strong>
                    <p>清除 Firebase 云端中的交易记录和云端设置，不影响当前设备上的本地数据。</p>
                  </div>
                  <span>›</span>
                </button>
              </section>
            </div>
          </div>
        ) : null}
      </div>

      <BottomNav activeTab={activeTab} onChange={setActiveTab} />
      <ManualDaySheet
        state={manualSheet}
        snapshot={snapshot}
        onCancel={closeManualSheet}
        onChangeDate={(value) => setManualSheet((current) => ({ ...current, date: value }))}
        onUpdateTrade={handleManualTradeUpdate}
        onRemoveTrade={handleManualRemove}
        onAddTrade={handleManualAdd}
        onDeleteDay={handleDeleteDay}
        onSave={handleManualSave}
      />
      <RatioSheet
        state={ratioSheet}
        onCancel={() => setRatioSheet(createRatioState())}
        onChange={(field, value) => setRatioSheet((current) => ({ ...current, [field]: value }))}
        onSave={handleRatioSave}
      />
      <ConfirmSheet
        state={confirmState}
        onCancel={() => setConfirmState({ open: false, mode: 'local' })}
        onConfirm={handleDangerConfirm}
      />
      <Toast toast={toast} />
    </>
  );
}
