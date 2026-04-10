import { useEffect, useRef, useState } from 'react';

import {
  buildAnalytics,
  buildNextTradeFromType,
  clearCloudTradeData,
  clearLocalTradeData,
  findCompanyNameBySymbol,
  getTradeAppSnapshot,
  importCsvFile,
  initializeTradeCore,
  maskEmail,
  normalizeTrade,
  parseFirebaseConfigPreview,
  RECORDS_PAGE_SIZE,
  removeDayById,
  saveFirebaseConfig,
  signInWithGoogle,
  signOutFromFirebase,
  syncWithCloud,
  todayStr,
  trimText,
  updateDividendRule,
  upsertManualDay
} from './lib/trade/index.js';
import {
  buildAnalysisDiagnostics,
  buildBarChartData,
  buildDashboardTimeline,
  buildDividendMonthlySummary,
  buildHealthReport,
  buildLineChartData,
  buildMonthlyHighlights,
  buildRecordFilterBadges,
  findExtremeDays,
  summarizeRecordDays
} from './lib/view-models.js';
import { BottomNav, Toast } from './components/common.jsx';
import {
  ConfirmSheet,
  DividendRuleSheet,
  ManualDaySheet,
  RecordFilterSheet
} from './components/sheets.jsx';
import {
  AnalysisTab,
  DividendTab,
  HomeTab,
  RecordsTab,
  SettingsTab
} from './components/tabs.jsx';

const MOBILE_BREAKPOINT = '(max-width: 720px)';
const MOBILE_VISIBLE_LIMIT = 8;
const MOBILE_RANKING_LIMIT = 10;

const DEFAULT_RECORD_FILTERS = {
  month: 'all',
  search: '',
  source: 'all',
  outcome: 'all',
  sort: 'desc',
  compact: false
};

const EMPTY_SNAPSHOT = {
  version: '5.0.0',
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
    syncStatusText: '尚未同步',
    authStatusText: '还没有填写 Firebase Web 配置。',
    user: null
  }
};

function createEmptySheetState() {
  const date = todayStr();
  return {
    open: false,
    mode: 'add',
    dayId: '',
    date,
    trades: []
  };
}

function createRuleState() {
  return {
    open: false,
    target: 'cash',
    numerator: '1',
    denominator: '3'
  };
}

function createConfirmState() {
  return {
    open: false,
    mode: 'local'
  };
}

function getMonthOptions(days) {
  return Array.from(new Set(days.map((day) => day.date.slice(0, 7)))).sort().reverse();
}

function isCompactViewport() {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_BREAKPOINT).matches;
}

export function App() {
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [ready, setReady] = useState(false);
  const [initialError, setInitialError] = useState('');
  const [isCompactScreen, setIsCompactScreen] = useState(isCompactViewport);
  const [activeTab, setActiveTab] = useState('home');
  const [dashboardScope, setDashboardScope] = useState('all');
  const [analysisScope, setAnalysisScope] = useState('all');
  const [dividendScope, setDividendScope] = useState('all');
  const [chartRange, setChartRange] = useState('week');
  const [chartType, setChartType] = useState('cumulative');
  const [recordsPage, setRecordsPage] = useState(0);
  const [recordFilters, setRecordFilters] = useState(DEFAULT_RECORD_FILTERS);
  const [recordFilterSheetOpen, setRecordFilterSheetOpen] = useState(false);
  const [manualSheet, setManualSheet] = useState(createEmptySheetState());
  const [ruleSheet, setRuleSheet] = useState(createRuleState());
  const [confirmState, setConfirmState] = useState(createConfirmState());
  const [firebaseDraft, setFirebaseDraft] = useState('');
  const [showAllPositions, setShowAllPositions] = useState(false);
  const [showAllRanking, setShowAllRanking] = useState(false);
  const [showAllDividendHistory, setShowAllDividendHistory] = useState(false);
  const [toast, setToast] = useState(null);
  const csvInputRef = useRef(null);
  const bootSyncedRef = useRef(false);

  function applySnapshot(nextSnapshot) {
    setSnapshot(nextSnapshot);
    setFirebaseDraft(nextSnapshot.firebase.configText || '');
  }

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
  }, []);

  useEffect(() => {
    if (!ready || bootSyncedRef.current || !snapshot.firebase.isSignedIn) return;
    bootSyncedRef.current = true;

    syncWithCloud({ silent: true })
      .then((nextSnapshot) => applySnapshot(nextSnapshot))
      .catch(() => {});
  }, [ready, snapshot.firebase.isSignedIn]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const media = window.matchMedia(MOBILE_BREAKPOINT);
    const sync = () => setIsCompactScreen(media.matches);
    sync();
    media.addEventListener('change', sync);

    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!isCompactScreen) return;
    setRecordFilters((current) => (current.compact ? current : { ...current, compact: true }));
  }, [isCompactScreen]);

  useEffect(() => {
    setRecordsPage(0);
  }, [dashboardScope, recordFilters.month, recordFilters.search, recordFilters.source, recordFilters.outcome, recordFilters.sort, recordFilters.compact]);

  useEffect(() => {
    setShowAllPositions(false);
    setShowAllRanking(false);
    setShowAllDividendHistory(false);
  }, [analysisScope, dividendScope, activeTab, isCompactScreen]);

  async function runTask(task, options = {}) {
    try {
      const result = await task();
      if (result?.version) {
        applySnapshot(result);
      } else if (result?.snapshot?.version) {
        applySnapshot(result.snapshot);
      } else {
        applySnapshot(getTradeAppSnapshot());
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
      trades: [normalizeTrade(buildNextTradeFromType({}, 'spot_buy', date), date, 0)]
    });
  }

  function openEditSheet(day) {
    setManualSheet({
      open: true,
      mode: 'edit',
      dayId: day.id,
      date: day.date,
      trades: structuredClone(day.trades)
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
        nextTrade = buildNextTradeFromType(nextTrade, fallbackType, current.date || todayStr());
      } else if (field === 'manualType') {
        nextTrade = buildNextTradeFromType(nextTrade, value, current.date || todayStr());
      } else {
        nextTrade = normalizeTrade({
          ...nextTrade,
          [field]: value
        }, current.date || todayStr(), index);
      }

      nextTrades[index] = nextTrade;
      return { ...current, trades: nextTrades };
    });

    if (field === 'symbol') {
      findCompanyNameBySymbol(value).then((companyName) => {
        if (!companyName) return;
        setManualSheet((current) => {
          const nextTrades = [...current.trades];
          const target = nextTrades[index];
          if (!target || trimText(target.name) || trimText(target.symbol) !== trimText(value)) return current;
          nextTrades[index] = normalizeTrade({
            ...target,
            name: companyName
          }, current.date || todayStr(), index);
          return { ...current, trades: nextTrades };
        });
      });
    }
  }

  function handleManualRemove(index) {
    setManualSheet((current) => {
      const nextTrades = current.trades.filter((_, tradeIndex) => tradeIndex !== index);
      return {
        ...current,
        trades: nextTrades.length ? nextTrades : [normalizeTrade(buildNextTradeFromType({}, 'spot_buy', current.date || todayStr()), current.date || todayStr(), 0)]
      };
    });
  }

  function handleManualMove(index, offset) {
    setManualSheet((current) => {
      const targetIndex = index + offset;
      if (targetIndex < 0 || targetIndex >= current.trades.length) return current;

      const nextTrades = [...current.trades];
      const [movedTrade] = nextTrades.splice(index, 1);
      nextTrades.splice(targetIndex, 0, movedTrade);

      return {
        ...current,
        trades: nextTrades.map((trade, tradeIndex) => normalizeTrade({
          ...trade,
          order: tradeIndex
        }, current.date || todayStr(), tradeIndex))
      };
    });
  }

  function handleManualAdd() {
    setManualSheet((current) => ({
      ...current,
      trades: [
        ...current.trades,
        normalizeTrade(buildNextTradeFromType({}, 'spot_buy', current.date || todayStr()), current.date || todayStr(), current.trades.length)
      ]
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
        successText: manualSheet.mode === 'edit' ? '已更新交易日。' : '已保存交易日。'
      }
    );
    closeManualSheet();
    setActiveTab('records');
  }

  async function handleDeleteDay() {
    if (!manualSheet.dayId) return;
    await runTask(() => removeDayById(manualSheet.dayId), { successText: '已删除交易日。' });
    closeManualSheet();
  }

  function openRuleEditor(target) {
    const rule = snapshot.settings.dividendRules[target];
    setRuleSheet({
      open: true,
      target,
      numerator: String(rule?.numerator || 1),
      denominator: String(rule?.denominator || 1)
    });
  }

  function handleRuleSave() {
    const nextSnapshot = updateDividendRule(ruleSheet.target, ruleSheet.numerator, ruleSheet.denominator);
    applySnapshot(nextSnapshot);
    setRuleSheet(createRuleState());
    setToast({ tone: 'success', text: '分红比例已更新。' });
  }

  async function handleCsvImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const result = await runTask(() => importCsvFile(file));
      setActiveTab('records');
      setToast({
        tone: 'success',
        text: `导入 ${result.summary.importedRows} 行，忽略投信 ${result.summary.skippedInvestmentTrust} 行。`
      });
    } finally {
      event.target.value = '';
    }
  }

  async function handleFirebaseConfigSave() {
    await runTask(() => saveFirebaseConfig(firebaseDraft), { successText: 'Firebase 配置已保存。' });
  }

  async function handleCloudLogin() {
    await runTask(() => signInWithGoogle(firebaseDraft), { successText: '已完成安全合并同步。' });
  }

  async function handleCloudLogout() {
    await runTask(() => signOutFromFirebase(), { successText: '已退出当前账号。' });
  }

  async function handleCloudSync() {
    await runTask(() => syncWithCloud(), { successText: '已完成安全合并同步。' });
  }

  async function handleDangerConfirm() {
    if (confirmState.mode === 'cloud') {
      await runTask(() => clearCloudTradeData(), { successText: '云端数据已清空。' });
    } else {
      await runTask(() => clearLocalTradeData(), { successText: '本地数据已清空。' });
    }
    setConfirmState(createConfirmState());
  }

  const dashboardSummary = snapshot.analytics.summaries[dashboardScope];
  const analysisSummary = snapshot.analytics.summaries[analysisScope];
  const dividendSummary = snapshot.analytics.summaries[dividendScope];
  const chartData = buildLineChartData(buildDashboardTimeline(snapshot.analytics.daysAsc, dashboardScope, chartRange), dashboardScope, chartType);
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
  const latestDay = snapshot.analytics.daysDesc.find((day) => day.scopes[dashboardScope].tradeCount > 0) || null;
  const configPreview = parseFirebaseConfigPreview(firebaseDraft);
  const monthOptions = getMonthOptions(snapshot.days);
  const analysisExtremes = findExtremeDays(snapshot.analytics.daysDesc, analysisScope);
  const monthlyHighlights = buildMonthlyHighlights(analysisSummary.monthly);
  const bestStock = analysisSummary.ranking[0] || null;
  const worstStock = [...analysisSummary.ranking].reverse().find((item) => item.profit < 0) || analysisSummary.ranking[analysisSummary.ranking.length - 1] || null;
  const latestDividendEntry = dividendSummary.dividendHistory[0] || null;
  const recordFilterBadges = buildRecordFilterBadges(recordFilters);
  const currentAccountLabel = snapshot.firebase.user?.email
    ? maskEmail(snapshot.firebase.user.email)
    : (configPreview?.projectId ? '已配置' : '未配置');

  const filteredRecordDays = snapshot.analytics.daysDesc
    .filter((day) => day.scopes[dashboardScope].tradeCount > 0)
    .filter((day) => (recordFilters.month === 'all' ? true : day.date.slice(0, 7) === recordFilters.month))
    .filter((day) => {
      const normalizedSearch = trimText(recordFilters.search).toLowerCase();
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
    .sort((left, right) => {
      if (recordFilters.sort === 'profit') {
        return Math.abs(right.scopes[dashboardScope].profit) - Math.abs(left.scopes[dashboardScope].profit);
      }
      if (recordFilters.sort === 'oldest') {
        return left.date.localeCompare(right.date);
      }
      return right.date.localeCompare(left.date);
    });

  const filteredRecordSummary = summarizeRecordDays(filteredRecordDays, dashboardScope);
  const recordPageSize = recordFilters.compact ? 10 : RECORDS_PAGE_SIZE;
  const totalRecordPages = filteredRecordDays.length ? Math.ceil(filteredRecordDays.length / recordPageSize) : 0;
  const safeRecordsPage = totalRecordPages ? Math.min(recordsPage, totalRecordPages - 1) : 0;
  const visibleRecordDays = filteredRecordDays.slice(safeRecordsPage * recordPageSize, (safeRecordsPage + 1) * recordPageSize);

  const sortedPositions = [...analysisSummary.positions].sort((left, right) => (right.quantity * right.avgPrice) - (left.quantity * left.avgPrice));
  const visiblePositions = isCompactScreen && !showAllPositions
    ? sortedPositions.slice(0, MOBILE_VISIBLE_LIMIT)
    : sortedPositions;
  const visibleRanking = isCompactScreen && !showAllRanking
    ? analysisSummary.ranking.slice(0, MOBILE_RANKING_LIMIT)
    : analysisSummary.ranking;
  const visibleDividendHistory = isCompactScreen && !showAllDividendHistory
    ? dividendSummary.dividendHistory.slice(0, MOBILE_VISIBLE_LIMIT)
    : dividendSummary.dividendHistory;
  const recentDays = snapshot.analytics.daysDesc
    .filter((day) => day.scopes[dashboardScope].tradeCount > 0)
    .slice(0, 5);
  const dividendMonthly = buildDividendMonthlySummary(dividendSummary.dividendHistory, dividendScope);

  if (!ready && !initialError) {
    return (
      <div className="loading-page">
        <div className="loading-card">
          <div className="loading-dot" />
          <h1>载入中</h1>
        </div>
      </div>
    );
  }

  if (initialError) {
    return (
      <div className="loading-page">
        <div className="loading-card error">
          <h1>启动失败</h1>
          <p>{initialError}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <input ref={csvInputRef} type="file" accept=".csv,text/csv" hidden onChange={handleCsvImport} />

      <div className="app-shell">
        {activeTab === 'home' ? (
          <HomeTab
            dashboardScope={dashboardScope}
            setDashboardScope={setDashboardScope}
            dashboardSummary={dashboardSummary}
            dashboardDiagnostics={dashboardDiagnostics}
            currentMonthProfit={currentMonthProfit}
            latestDay={latestDay}
            chartRange={chartRange}
            setChartRange={setChartRange}
            chartType={chartType}
            setChartType={setChartType}
            chartData={chartData}
            onAddRecord={openAddSheet}
            onImportCsv={() => csvInputRef.current?.click()}
            onOpenSync={() => {
              if (snapshot.firebase.isSignedIn) {
                handleCloudSync();
                return;
              }
              setActiveTab('settings');
            }}
            recentDays={recentDays}
            onOpenDay={openEditSheet}
          />
        ) : null}

        {activeTab === 'records' ? (
          <RecordsTab
            dashboardScope={dashboardScope}
            setDashboardScope={setDashboardScope}
            recordFilterBadges={recordFilterBadges}
            filteredRecordSummary={filteredRecordSummary}
            visibleRecordDays={visibleRecordDays}
            totalRecordPages={totalRecordPages}
            safeRecordsPage={safeRecordsPage}
            setRecordsPage={setRecordsPage}
            onOpenFilters={() => setRecordFilterSheetOpen(true)}
            onOpenDay={openEditSheet}
          />
        ) : null}

        {activeTab === 'analysis' ? (
          <AnalysisTab
            analysisScope={analysisScope}
            setAnalysisScope={setAnalysisScope}
            analysisSummary={analysisSummary}
            analysisDiagnostics={analysisDiagnostics}
            analysisExtremes={analysisExtremes}
            monthlyHighlights={monthlyHighlights}
            bestStock={bestStock}
            worstStock={worstStock}
            monthlyChartData={monthlyChartData}
            healthReport={healthReport}
            visiblePositions={visiblePositions}
            visibleRanking={visibleRanking}
            showAllPositions={showAllPositions}
            setShowAllPositions={setShowAllPositions}
            showAllRanking={showAllRanking}
            setShowAllRanking={setShowAllRanking}
            isCompactScreen={isCompactScreen}
          />
        ) : null}

        {activeTab === 'dividend' ? (
          <DividendTab
            dividendScope={dividendScope}
            setDividendScope={setDividendScope}
            dividendSummary={dividendSummary}
            latestDividendEntry={latestDividendEntry}
            dividendMonthly={dividendMonthly}
            visibleDividendHistory={visibleDividendHistory}
            totalDividendHistory={dividendSummary.dividendHistory.length}
            showAllDividendHistory={showAllDividendHistory}
            setShowAllDividendHistory={setShowAllDividendHistory}
            isCompactScreen={isCompactScreen}
            onEditRule={openRuleEditor}
            snapshot={snapshot}
          />
        ) : null}

        {activeTab === 'settings' ? (
          <SettingsTab
            snapshot={snapshot}
            currentAccountLabel={currentAccountLabel}
            configPreview={configPreview}
            firebaseDraft={firebaseDraft}
            setFirebaseDraft={setFirebaseDraft}
            onSaveConfig={handleFirebaseConfigSave}
            onLogin={handleCloudLogin}
            onLogout={handleCloudLogout}
            onSync={handleCloudSync}
            onOpenLocalClear={() => setConfirmState({ open: true, mode: 'local' })}
            onOpenCloudClear={() => setConfirmState({ open: true, mode: 'cloud' })}
            onAddRecord={openAddSheet}
            onImportCsv={() => csvInputRef.current?.click()}
          />
        ) : null}
      </div>

      <BottomNav activeTab={activeTab} onChange={setActiveTab} />

      <RecordFilterSheet
        open={recordFilterSheetOpen}
        recordFilters={recordFilters}
        setRecordFilters={setRecordFilters}
        dashboardScope={dashboardScope}
        setDashboardScope={setDashboardScope}
        monthOptions={monthOptions}
        onReset={() => {
          setRecordFilters(DEFAULT_RECORD_FILTERS);
          setRecordsPage(0);
        }}
        onClose={() => setRecordFilterSheetOpen(false)}
      />

      <ManualDaySheet
        state={manualSheet}
        snapshot={snapshot}
        onCancel={closeManualSheet}
        onChangeDate={(value) => setManualSheet((current) => ({ ...current, date: value }))}
        onUpdateTrade={handleManualTradeUpdate}
        onRemoveTrade={handleManualRemove}
        onMoveTrade={handleManualMove}
        onAddTrade={handleManualAdd}
        onDeleteDay={handleDeleteDay}
        onSave={handleManualSave}
      />

      <DividendRuleSheet
        state={ruleSheet}
        onCancel={() => setRuleSheet(createRuleState())}
        onChange={(field, value) => setRuleSheet((current) => ({ ...current, [field]: value }))}
        onSave={handleRuleSave}
      />

      <ConfirmSheet
        state={confirmState}
        onCancel={() => setConfirmState(createConfirmState())}
        onConfirm={handleDangerConfirm}
      />

      <Toast toast={toast} />
    </>
  );
}
