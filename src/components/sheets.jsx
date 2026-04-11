import {
  buildAnalytics,
  getManualTypeOptions,
  MANUAL_TYPE_MAP,
  normalizeAnyDate,
  normalizeDay,
  todayStr,
  trimText
} from '../lib/trade/index.js';
import { formatMoney } from '../lib/trade/utils.js';
import { buildHealthReport, getHoldingCostMeta, getValueTone } from '../lib/view-models.js';
import { EmptyState, ScopeToggle, StatusBadge } from './common.jsx';

function Sheet({ open, onClose, title, actions, children, tall = false }) {
  if (!open) return null;

  return (
    <div className="sheet" aria-hidden="false">
      <div className="sheet-backdrop" onClick={onClose} />
      <div className={`sheet-panel ${tall ? 'tall' : ''}`}>
        <div className="sheet-header">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">✕</button>
        </div>
        <div className="sheet-content">{children}</div>
        {actions ? <div className="sheet-actions">{actions}</div> : null}
      </div>
    </div>
  );
}

function getSettlementFieldConfig(trade) {
  if (trade.assetType === 'cash') {
    return {
      label: '受渡金额',
      placeholder: trade.action === 'buy' ? '可留空' : '可留空',
      hint: '留空时按数量、价格、手续费和税额自动计算。'
    };
  }

  if (trade.positionEffect === 'close') {
    return {
      label: '券商净损益',
      placeholder: '只填净损益，不填成交总额',
      hint: '留空时按 FIFO 自动算平仓盈亏；填写后会直接覆盖模型结果。'
    };
  }

  return {
    label: '参考金额',
    placeholder: '非必填',
    hint: '通常可以留空。'
  };
}

function TradeEditorCard({
  trade,
  index,
  totalCount,
  onUpdateTrade,
  onMoveTrade,
  onRemoveTrade,
  onDuplicateTrade,
  onReverseTrade
}) {
  const typeOptions = getManualTypeOptions(trade.assetType);
  const settlementField = getSettlementFieldConfig(trade);

  return (
    <article className="trade-editor-card">
      <div className="trade-editor-head">
        <div className="trade-editor-label">
          <strong>{trade.name || trade.symbol || `交易 ${index + 1}`}</strong>
          <span>{MANUAL_TYPE_MAP[trade.manualType]?.label || '交易'}</span>
        </div>
        <div className="trade-editor-tools">
          <button type="button" className="ghost-btn small" onClick={() => onDuplicateTrade(index)}>复制</button>
          <button type="button" className="ghost-btn small" onClick={() => onReverseTrade(index)}>反向</button>
          <button type="button" className="ghost-btn small" disabled={index === 0} onClick={() => onMoveTrade(index, -1)}>上移</button>
          <button type="button" className="ghost-btn small" disabled={index === totalCount - 1} onClick={() => onMoveTrade(index, 1)}>下移</button>
          <button type="button" className="danger-btn small" onClick={() => onRemoveTrade(index)}>删除</button>
        </div>
      </div>

      <div className="field-group">
        <span className="form-label">账户</span>
        <ScopeToggle
          value={trade.assetType === 'margin' ? 'margin' : 'cash'}
          onChange={(value) => onUpdateTrade(index, 'assetType', value)}
          className="scope-toggle compact-two"
        />
      </div>

      <label className="field-group">
        <span className="form-label">类型</span>
        <select
          className="form-input"
          value={trade.manualType}
          onChange={(event) => onUpdateTrade(index, 'manualType', event.target.value)}
        >
          {typeOptions.map((optionKey) => (
            <option key={optionKey} value={optionKey}>{MANUAL_TYPE_MAP[optionKey].label}</option>
          ))}
        </select>
      </label>

      <div className="form-grid two">
        <label className="field-group">
          <span className="form-label">代码</span>
          <input
            type="text"
            className="form-input"
            value={trade.symbol}
            onChange={(event) => onUpdateTrade(index, 'symbol', event.target.value)}
          />
        </label>
        <label className="field-group">
          <span className="form-label">名称</span>
          <input
            type="text"
            className="form-input"
            value={trade.name}
            onChange={(event) => onUpdateTrade(index, 'name', event.target.value)}
          />
        </label>
      </div>

      <div className="form-grid three">
        <label className="field-group">
          <span className="form-label">数量</span>
          <input
            type="number"
            min="0"
            step="1"
            className="form-input"
            value={trade.quantity}
            onChange={(event) => onUpdateTrade(index, 'quantity', event.target.value)}
          />
        </label>
        <label className="field-group">
          <span className="form-label">价格</span>
          <input
            type="number"
            min="0"
            step="0.01"
            className="form-input"
            value={trade.price}
            onChange={(event) => onUpdateTrade(index, 'price', event.target.value)}
          />
        </label>
        <label className="field-group">
          <span className="form-label">市场</span>
          <select
            className="form-input"
            value={trade.market}
            onChange={(event) => onUpdateTrade(index, 'market', event.target.value)}
          >
            <option value="tse">东证</option>
            <option value="pts">PTS</option>
            <option value="other">其他</option>
          </select>
        </label>
      </div>

      <div className="form-grid two">
        <label className="field-group">
          <span className="form-label">手续费</span>
          <input
            type="number"
            min="0"
            step="0.01"
            className="form-input"
            value={trade.fee}
            onChange={(event) => onUpdateTrade(index, 'fee', event.target.value)}
          />
        </label>
        <label className="field-group">
          <span className="form-label">税额</span>
          <input
            type="number"
            min="0"
            step="0.01"
            className="form-input"
            value={trade.taxAmount}
            onChange={(event) => onUpdateTrade(index, 'taxAmount', event.target.value)}
          />
        </label>
      </div>

      <div className="form-grid two">
        <label className="field-group">
          <span className="form-label">受渡日</span>
          <input
            type="date"
            className="form-input"
            value={trade.settlementDate}
            onChange={(event) => onUpdateTrade(index, 'settlementDate', event.target.value)}
          />
        </label>
        <label className="field-group">
          <span className="form-label">{settlementField.label}</span>
          <input
            type="number"
            step="0.01"
            className="form-input"
            placeholder={settlementField.placeholder}
            value={trade.settlementAmount}
            onChange={(event) => onUpdateTrade(index, 'settlementAmount', event.target.value)}
          />
          <span className="field-note">{settlementField.hint}</span>
        </label>
      </div>

      {trade.assetType === 'margin' && trade.positionEffect === 'close' ? (
        <label className="field-group">
          <span className="form-label">持有成本覆盖</span>
          <input
            type="number"
            step="0.01"
            className="form-input"
            value={trade.holdingCost}
            onChange={(event) => onUpdateTrade(index, 'holdingCost', event.target.value)}
          />
        </label>
      ) : null}

      <label className="field-group">
        <span className="form-label">备注</span>
        <textarea
          className="form-input"
          rows="3"
          value={trade.notes}
          onChange={(event) => onUpdateTrade(index, 'notes', event.target.value)}
        />
      </label>
    </article>
  );
}

export function RecordFilterSheet({
  open,
  recordFilters,
  setRecordFilters,
  dashboardScope,
  setDashboardScope,
  monthOptions,
  onReset,
  onClose
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="筛选记录"
      actions={(
        <>
          <button type="button" className="ghost-btn" onClick={onReset}>重置</button>
          <button type="button" className="primary-btn" onClick={onClose}>完成</button>
        </>
      )}
    >
      <div className="form-stack">
        <div className="field-group">
          <span className="form-label">账户</span>
          <ScopeToggle value={dashboardScope} onChange={setDashboardScope} />
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
              <option key={month} value={month}>{month}</option>
            ))}
          </select>
        </label>
        <label className="field-group">
          <span className="form-label">搜索</span>
          <input
            type="text"
            className="form-input"
            placeholder="代码、名称、备注"
            value={recordFilters.search}
            onChange={(event) => setRecordFilters((current) => ({ ...current, search: event.target.value }))}
          />
        </label>
        <div className="field-group">
          <span className="form-label">来源</span>
          <div className="inline-options">
            {[
              ['all', '全部'],
              ['csv', 'CSV'],
              ['manual', '手动']
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`filter-chip ${recordFilters.source === value ? 'active' : ''}`}
                onClick={() => setRecordFilters((current) => ({ ...current, source: value }))}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="field-group">
          <span className="form-label">结果</span>
          <div className="inline-options">
            {[
              ['all', '全部'],
              ['win', '盈利'],
              ['loss', '亏损'],
              ['flat', '平盘']
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`filter-chip ${recordFilters.outcome === value ? 'active' : ''}`}
                onClick={() => setRecordFilters((current) => ({ ...current, outcome: value }))}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="field-group">
          <span className="form-label">排序</span>
          <div className="inline-options">
            {[
              ['desc', '最新'],
              ['oldest', '最早'],
              ['profit', '波动大']
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`filter-chip ${recordFilters.sort === value ? 'active' : ''}`}
                onClick={() => setRecordFilters((current) => ({ ...current, sort: value }))}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <label className="toggle-line">
          <input
            type="checkbox"
            checked={recordFilters.compact}
            onChange={(event) => setRecordFilters((current) => ({ ...current, compact: event.target.checked }))}
          />
          <span>紧凑模式</span>
        </label>
      </div>
    </Sheet>
  );
}

export function ManualDaySheet({
  state,
  snapshot,
  onCancel,
  onChangeDate,
  onUpdateTrade,
  onRemoveTrade,
  onMoveTrade,
  onDuplicateTrade,
  onReverseTrade,
  onAddTrade,
  onDeleteDay,
  onSave
}) {
  if (!state.open) return null;

  const previewDate = normalizeAnyDate(state.date);
  const existingSameDate = snapshot.days.find((day) => day.date === previewDate && day.id !== state.dayId);
  const validTrades = state.trades.filter((trade) => trade.fingerprint || (trimText(trade.symbol) && (Number(trade.quantity) || 0) > 0 && (Number(trade.price) || 0) > 0));
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
  const previewHoldingCost = getHoldingCostMeta(previewDay?.scopes.all);
  const previewProfit = previewDay?.scopes.all.profit || 0;
  const previewHealth = buildHealthReport(previewDays);
  const currentDate = previewDate || todayStr();
  const previewDuplicateExamples = previewHealth.duplicateExamples.filter((item) => item.date === currentDate);
  const previewOrphanExamples = previewHealth.orphanExamples.filter((item) => item.date === currentDate);
  const previewCloseTrades = (previewDay?.trades || []).filter((trade) => {
    const isCashClose = trade.assetType === 'cash' && trade.action === 'sell';
    return isCashClose || trade.positionEffect === 'close';
  });

  return (
    <Sheet
      open={state.open}
      onClose={onCancel}
      title={state.mode === 'edit' ? '编辑交易日' : '新增交易日'}
      tall
      actions={(
        <>
          {state.mode === 'edit' ? (
            <button type="button" className="danger-btn" onClick={onDeleteDay}>删除整天</button>
          ) : null}
          <div className="sheet-actions-spacer" />
          <button type="button" className="ghost-btn" onClick={onCancel}>取消</button>
          <button type="button" className="primary-btn" onClick={onSave}>保存</button>
        </>
      )}
    >
      <div className="form-stack">
        <label className="field-group">
          <span className="form-label">日期</span>
          <input type="date" className="form-input" value={state.date} onChange={(event) => onChangeDate(event.target.value)} />
        </label>

        <div className="preview-strip">
          <StatusBadge tone={getValueTone(previewProfit)}>{formatMoney(previewProfit)}</StatusBadge>
          <span>{previewHoldingCost.label} {formatMoney(previewHoldingCost.value, { signed: false })}</span>
        </div>

        {existingSameDate ? (
          <div className="inline-note">
            这一天已经有 {normalizeDay(existingSameDate).trades.length} 笔记录，保存后会合并到同一天。
          </div>
        ) : null}

        {tradeNeedsReview(previewDuplicateExamples, previewOrphanExamples) ? (
          <div className="notice-stack">
            {previewDuplicateExamples.map((item, itemIndex) => (
              <article className="notice-card" key={`dup-${item.date}-${item.symbol}-${item.tradeTypeLabel}-${itemIndex}`}>
                <div className="list-card-head">
                  <strong>检测到重复记录</strong>
                  <StatusBadge tone="warning">{item.date}</StatusBadge>
                </div>
                <div className="list-card-meta">
                  <span>{item.symbol || item.name || '无代码'} · {item.tradeTypeLabel}</span>
                  <span>重复会直接叠加当日盈亏和交易笔数。</span>
                </div>
              </article>
            ))}
            {previewOrphanExamples.map((item, itemIndex) => (
              <article className="notice-card" key={`orphan-${item.date}-${item.symbol}-${item.tradeTypeLabel}-${itemIndex}`}>
                <div className="list-card-head">
                  <strong>检测到未匹配平仓</strong>
                  <StatusBadge tone="danger">{item.date}</StatusBadge>
                </div>
                <div className="list-card-meta">
                  <span>{item.symbol || item.name || '无代码'} · {item.tradeTypeLabel}</span>
                  <span>缺少约 {Number(item.missingQuantity) || 0} 股对应开仓。</span>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {previewCloseTrades.length ? (
          <section className="stack-list compact-gap">
            <div className="preview-section-head">
              <strong>平仓预览</strong>
              <span>这里显示这一天每笔平仓实际会贡献多少盈亏。</span>
            </div>
            {previewCloseTrades.map((trade) => (
              <article className="list-card" key={`${trade.id}-preview`}>
                <div className="list-card-head">
                  <div>
                    <strong>{trade.name || trade.symbol || '未命名交易'}</strong>
                    <span>{trade.tradeTypeLabel}</span>
                  </div>
                  <strong className={getValueTone(trade.realizedProfit)}>{formatMoney(trade.realizedProfit)}</strong>
                </div>
                <div className="list-card-meta">
                  <span>{trade.symbol || '无代码'}</span>
                  <span>{Number(trade.quantity) || 0} 股</span>
                  <span>@ {formatMoney(trade.price, { signed: false })}</span>
                  {trade.profitSource === 'reported' ? <span>按券商净损益</span> : <span>按 FIFO 口径</span>}
                </div>
              </article>
            ))}
          </section>
        ) : null}

        {state.trades.map((trade, index) => (
          <TradeEditorCard
            key={trade.id}
            trade={trade}
            index={index}
            totalCount={state.trades.length}
            onUpdateTrade={onUpdateTrade}
            onMoveTrade={onMoveTrade}
            onRemoveTrade={onRemoveTrade}
            onDuplicateTrade={onDuplicateTrade}
            onReverseTrade={onReverseTrade}
          />
        ))}

        <button type="button" className="secondary-btn wide-btn" onClick={onAddTrade}>新增一笔（沿用上一笔代码/类型）</button>
      </div>
    </Sheet>
  );
}

function tradeNeedsReview(duplicates, orphans) {
  return duplicates.length > 0 || orphans.length > 0;
}

export function DividendRuleSheet({ state, onCancel, onChange, onSave }) {
  return (
    <Sheet
      open={state.open}
      onClose={onCancel}
      title={state.target === 'margin' ? '修改信用分红比例' : '修改现物分红比例'}
      actions={(
        <>
          <button type="button" className="ghost-btn" onClick={onCancel}>取消</button>
          <button type="button" className="primary-btn" onClick={onSave}>保存</button>
        </>
      )}
    >
      <div className="form-grid two ratio-grid">
        <label className="field-group">
          <span className="form-label">分子</span>
          <input type="number" min="1" step="1" className="form-input" value={state.numerator} onChange={(event) => onChange('numerator', event.target.value)} />
        </label>
        <label className="field-group">
          <span className="form-label">分母</span>
          <input type="number" min="1" step="1" className="form-input" value={state.denominator} onChange={(event) => onChange('denominator', event.target.value)} />
        </label>
      </div>
    </Sheet>
  );
}

export function ConfirmSheet({ state, onCancel, onConfirm }) {
  const mode = state.mode === 'cloud' ? 'cloud' : 'local';

  return (
    <Sheet
      open={state.open}
      onClose={onCancel}
      title={mode === 'cloud' ? '清空云端数据' : '清空本地数据'}
      actions={(
        <>
          <button type="button" className="ghost-btn" onClick={onCancel}>取消</button>
          <button type="button" className="danger-btn" onClick={onConfirm}>确认清空</button>
        </>
      )}
    >
      <div className="confirm-copy">
        {mode === 'cloud'
          ? '云端交易和云端设置会被清空，本地不受影响。'
          : '本机交易和本机设置会被清空，云端不受影响。'}
      </div>
    </Sheet>
  );
}
