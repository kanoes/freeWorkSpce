import { MANUAL_TYPE_MAP } from './constants.js';
import { cloneActiveRuleSnapshot, createDefaultSettings, normalizeRuleSnapshot } from './settings.js';
import {
  compactText,
  compareByDateAsc,
  compareTradeOrder,
  generateId,
  marketLabelFromKey,
  normalizeAnyDate,
  normalizeMarketKey,
  safeNumber,
  todayStr,
  trimText
} from './utils.js';

function resolveSettings(settings) {
  return settings || createDefaultSettings();
}

function normalizeOptionalNumber(value) {
  return value === '' ? '' : (safeNumber(value) ?? '');
}

function normalizeMarginSettlement(rawDetail) {
  if (!rawDetail || typeof rawDetail !== 'object') return null;

  const detail = {
    source: trimText(rawDetail.source || ''),
    settlementDate: normalizeAnyDate(rawDetail.settlementDate) || '',
    closeMarket: trimText(rawDetail.closeMarket || ''),
    openMarket: trimText(rawDetail.openMarket || ''),
    openDate: normalizeAnyDate(rawDetail.openDate) || '',
    openSide: trimText(rawDetail.openSide || ''),
    openPrice: normalizeOptionalNumber(rawDetail.openPrice),
    closePrice: normalizeOptionalNumber(rawDetail.closePrice),
    openAmount: normalizeOptionalNumber(rawDetail.openAmount),
    closeAmount: normalizeOptionalNumber(rawDetail.closeAmount),
    openFee: normalizeOptionalNumber(rawDetail.openFee),
    closeFee: normalizeOptionalNumber(rawDetail.closeFee),
    managementFee: normalizeOptionalNumber(rawDetail.managementFee),
    lendingFee: normalizeOptionalNumber(rawDetail.lendingFee),
    interestAmount: normalizeOptionalNumber(rawDetail.interestAmount),
    holdingDays: normalizeOptionalNumber(rawDetail.holdingDays),
    reverseDailyFee: normalizeOptionalNumber(rawDetail.reverseDailyFee),
    consumptionTax: normalizeOptionalNumber(rawDetail.consumptionTax),
    rewritingFee: normalizeOptionalNumber(rawDetail.rewritingFee),
    totalExpenses: normalizeOptionalNumber(rawDetail.totalExpenses)
  };

  return Object.values(detail).some((value) => value !== '' && value != null) ? detail : null;
}

export function inferManualTypeFromFields(assetType, action, positionEffect, positionSide) {
  return Object.keys(MANUAL_TYPE_MAP).find((key) => {
    const item = MANUAL_TYPE_MAP[key];
    return item.assetType === assetType
      && item.action === action
      && item.positionEffect === positionEffect
      && item.positionSide === positionSide;
  }) || (assetType === 'margin' ? 'margin_open_long' : 'spot_buy');
}

export function getManualTypeOptions(assetType) {
  if (assetType === 'margin') {
    return ['margin_open_long', 'margin_close_long', 'margin_open_short', 'margin_close_short'];
  }
  return ['spot_buy', 'spot_sell'];
}

export function describeTradeType(rawTradeType = '') {
  const value = trimText(rawTradeType);
  if (!value) return { supported: false };

  if (value === '株式現物買') return { supported: true, manualType: 'spot_buy' };
  if (value === '株式現物売') return { supported: true, manualType: 'spot_sell' };
  if (value === '信用新規買') return { supported: true, manualType: 'margin_open_long' };
  if (value === '信用返済売') return { supported: true, manualType: 'margin_close_long' };
  if (value === '信用新規売') return { supported: true, manualType: 'margin_open_short' };
  if (value === '信用返済買') return { supported: true, manualType: 'margin_close_short' };

  if (value.includes('株式現物') && value.includes('買')) return { supported: true, manualType: 'spot_buy' };
  if (value.includes('株式現物') && value.includes('売')) return { supported: true, manualType: 'spot_sell' };
  if (value.includes('信用') && value.includes('新規') && value.includes('買')) return { supported: true, manualType: 'margin_open_long' };
  if (value.includes('信用') && value.includes('返済') && value.includes('売')) return { supported: true, manualType: 'margin_close_long' };
  if (value.includes('信用') && value.includes('新規') && value.includes('売')) return { supported: true, manualType: 'margin_open_short' };
  if (value.includes('信用') && value.includes('返済') && value.includes('買')) return { supported: true, manualType: 'margin_close_short' };

  return { supported: false };
}

export function isTradeComplete(trade) {
  return Boolean(trimText(trade?.symbol)) && (Number(trade?.quantity) || 0) > 0 && (Number(trade?.price) || 0) > 0;
}

export function createManualTrade(settings, preset = {}) {
  const nextSettings = resolveSettings(settings);
  const manualType = preset.manualType || 'spot_buy';
  const config = MANUAL_TYPE_MAP[manualType] || MANUAL_TYPE_MAP.spot_buy;
  const now = new Date().toISOString();

  return normalizeTrade({
    id: preset.id || generateId(),
    source: 'manual',
    createdAt: preset.createdAt || now,
    updatedAt: preset.updatedAt || now,
    manualType,
    symbol: preset.symbol || '',
    name: preset.name || '',
    market: preset.market || 'tse',
    marketLabel: preset.marketLabel || marketLabelFromKey(preset.market || 'tse'),
    term: preset.term || '--',
    custody: preset.custody || '特定',
    taxCategory: preset.taxCategory || '--',
    quantity: preset.quantity ?? '',
    price: preset.price ?? '',
    fee: preset.fee ?? '',
    taxAmount: preset.taxAmount ?? '',
    holdingCost: preset.holdingCost ?? '',
    settlementDate: preset.settlementDate || '',
    settlementAmount: preset.settlementAmount ?? '',
    notes: preset.notes || '',
    assetType: config.assetType,
    action: config.action,
    positionEffect: config.positionEffect,
    positionSide: config.positionSide,
    tradeTypeLabel: config.tradeTypeLabel,
    ratioSnapshot: preset.ratioSnapshot || cloneActiveRuleSnapshot(nextSettings, config.assetType),
    order: preset.order ?? 0
  }, preset.date || todayStr(), Number(preset.order) || 0, nextSettings);
}

export function normalizeTrade(trade, dayDate, index = 0, settings = createDefaultSettings()) {
  const raw = trade && typeof trade === 'object' ? trade : {};
  const fallbackManualType = raw.manualType
    || describeTradeType(raw.tradeTypeLabel || raw.tradeType || '').manualType
    || inferManualTypeFromFields(
      raw.assetType || 'cash',
      raw.action || 'buy',
      raw.positionEffect || 'open',
      raw.positionSide || 'long'
    );
  const config = MANUAL_TYPE_MAP[fallbackManualType] || MANUAL_TYPE_MAP.spot_buy;
  const symbol = compactText(raw.symbol || raw.code || '');
  const assetType = raw.assetType || config.assetType;
  const nextSettings = resolveSettings(settings);

  return {
    id: raw.id || generateId(),
    source: raw.source || (raw.fingerprint ? 'csv' : 'manual'),
    createdAt: raw.createdAt || raw.updatedAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString(),
    order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : index,
    symbol,
    name: trimText(raw.name || ''),
    manualType: fallbackManualType,
    assetType,
    action: raw.action || config.action,
    positionEffect: raw.positionEffect || config.positionEffect,
    positionSide: raw.positionSide || config.positionSide,
    market: normalizeMarketKey(raw.market || raw.marketLabel),
    marketLabel: trimText(raw.marketLabel || marketLabelFromKey(normalizeMarketKey(raw.market || raw.marketLabel))),
    tradeTypeLabel: trimText(raw.tradeTypeLabel || config.tradeTypeLabel),
    term: trimText(raw.term || '--'),
    custody: trimText(raw.custody || '特定'),
    taxCategory: trimText(raw.taxCategory || '--'),
    quantity: raw.quantity === '' ? '' : (safeNumber(raw.quantity) ?? ''),
    price: raw.price === '' ? '' : (safeNumber(raw.price) ?? ''),
    fee: raw.fee === '' ? '' : (safeNumber(raw.fee) ?? ''),
    taxAmount: raw.taxAmount === '' ? '' : (safeNumber(raw.taxAmount) ?? ''),
    holdingCost: raw.holdingCost === '' ? '' : (safeNumber(raw.holdingCost) ?? ''),
    settlementDate: normalizeAnyDate(raw.settlementDate) || '',
    settlementAmount: raw.settlementAmount === '' ? '' : (safeNumber(raw.settlementAmount) ?? ''),
    notes: trimText(raw.notes || ''),
    fingerprint: trimText(raw.fingerprint || ''),
    csvBaseSignature: trimText(raw.csvBaseSignature || ''),
    marginSettlement: normalizeMarginSettlement(raw.marginSettlement),
    ratioSnapshot: normalizeRuleSnapshot(raw.ratioSnapshot || cloneActiveRuleSnapshot(nextSettings, assetType), assetType)
  };
}

export function normalizeDay(day, settings = createDefaultSettings()) {
  const date = normalizeAnyDate(day?.date) || todayStr();
  const trades = Array.isArray(day?.trades)
    ? day.trades.map((trade, index) => normalizeTrade(trade, date, index, settings)).sort(compareTradeOrder)
    : [];

  return {
    id: day?.id || generateId(),
    date,
    trades: trades.map((trade, index) => ({ ...trade, order: index })),
    updatedAt: day?.updatedAt || new Date().toISOString()
  };
}

export function reindexTrades(trades, date, settings = createDefaultSettings()) {
  return trades.map((trade, index) => normalizeTrade({ ...trade, order: index }, date, index, settings));
}

export function buildTradeSoftKey(date, trade, settings = createDefaultSettings()) {
  const normalized = normalizeTrade(trade, date, Number(trade?.order) || 0, settings);
  return [
    date,
    normalized.symbol,
    normalized.assetType,
    normalized.action,
    normalized.positionEffect,
    normalized.positionSide,
    normalized.market,
    normalized.quantity,
    normalized.price,
    normalized.settlementDate || ''
  ].join('|');
}

export function isCsvImportedTrade(trade) {
  const source = trimText(trade?.source || '');
  return source === 'csv' || Boolean(trimText(trade?.fingerprint || trade?.csvBaseSignature || ''));
}

export function collectManualDaysForCsvRebuild(days, settings = createDefaultSettings()) {
  const manualDays = new Map();

  days.map((day) => normalizeDay(day, settings)).forEach((day) => {
    const manualTrades = day.trades
      .filter((trade) => !isCsvImportedTrade(trade) && trimText(trade.source) === 'manual')
      .map((trade, index) => normalizeTrade({ ...trade, order: index }, day.date, index, settings));

    if (!manualTrades.length) return;

    manualDays.set(day.date, {
      id: day.id || generateId(),
      date: day.date,
      trades: reindexTrades(manualTrades, day.date, settings),
      updatedAt: day.updatedAt || new Date().toISOString()
    });
  });

  return manualDays;
}

function getTradeIdentityKeys(date, trade, settings) {
  const normalized = normalizeTrade(trade, date, Number(trade?.order) || 0, settings);
  const keys = [];
  if (normalized.id) keys.push(`id:${normalized.id}`);
  if (normalized.fingerprint) keys.push(`fp:${normalized.fingerprint}`);
  keys.push(`soft:${buildTradeSoftKey(date, normalized, settings)}`);
  return keys;
}

export function mergeTradeVersions(existingTrade, incomingTrade, date, settings = createDefaultSettings()) {
  const existing = normalizeTrade(existingTrade, date, Number(existingTrade?.order) || 0, settings);
  const incoming = normalizeTrade(incomingTrade, date, Number(incomingTrade?.order) || 0, settings);
  const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
  const incomingTime = new Date(incoming.updatedAt || incoming.createdAt || 0).getTime();

  const preferred = incomingTime >= existingTime ? incoming : existing;
  const secondary = incomingTime >= existingTime ? existing : incoming;

  return normalizeTrade({
    ...secondary,
    ...preferred,
    id: existing.id || incoming.id,
    createdAt: existing.createdAt || incoming.createdAt,
    updatedAt: preferred.updatedAt || secondary.updatedAt || new Date().toISOString(),
    notes: preferred.notes || secondary.notes,
    fingerprint: preferred.fingerprint || secondary.fingerprint,
    csvBaseSignature: preferred.csvBaseSignature || secondary.csvBaseSignature,
    marginSettlement: preferred.marginSettlement || secondary.marginSettlement || null,
    ratioSnapshot: preferred.ratioSnapshot || secondary.ratioSnapshot || cloneActiveRuleSnapshot(settings, preferred.assetType)
  }, date, Number(preferred.order) || 0, settings);
}

export function mergeTradeLists(date, localTrades, remoteTrades, settings = createDefaultSettings()) {
  const merged = [];
  const keyMap = new Map();

  const registerTrade = (trade) => {
    const normalized = normalizeTrade(trade, date, merged.length, settings);
    const keys = getTradeIdentityKeys(date, normalized, settings);
    const matchedIndex = keys.map((key) => keyMap.get(key)).find((value) => value != null);

    if (matchedIndex == null) {
      const index = merged.push(normalized) - 1;
      keys.forEach((key) => keyMap.set(key, index));
      return;
    }

    const next = mergeTradeVersions(merged[matchedIndex], normalized, date, settings);
    merged[matchedIndex] = next;
    getTradeIdentityKeys(date, next, settings).forEach((key) => keyMap.set(key, matchedIndex));
  };

  localTrades.forEach(registerTrade);
  remoteTrades.forEach(registerTrade);

  return reindexTrades(merged.sort(compareTradeOrder), date, settings);
}

export function mergeDays(localDays, cloudDays, settings = createDefaultSettings()) {
  const byDate = new Map();
  const localMap = new Map(localDays.map((day) => {
    const normalized = normalizeDay(day, settings);
    return [normalized.date, normalized];
  }));
  const cloudMap = new Map(cloudDays.map((day) => {
    const normalized = normalizeDay(day, settings);
    return [normalized.date, normalized];
  }));
  const allDates = new Set([...localMap.keys(), ...cloudMap.keys()]);

  allDates.forEach((date) => {
    const local = localMap.get(date);
    const remote = cloudMap.get(date);

    if (!local) {
      byDate.set(date, normalizeDay(remote, settings));
      return;
    }

    if (!remote) {
      byDate.set(date, normalizeDay(local, settings));
      return;
    }

    const mergedTrades = mergeTradeLists(date, local.trades, remote.trades, settings);
    const mergedDay = normalizeDay({
      id: local.id || remote.id || generateId(),
      date,
      trades: mergedTrades,
      updatedAt: new Date(Math.max(
        new Date(local.updatedAt || 0).getTime(),
        new Date(remote.updatedAt || 0).getTime()
      )).toISOString()
    }, settings);

    byDate.set(date, mergedDay);
  });

  return Array.from(byDate.values()).sort(compareByDateAsc);
}
