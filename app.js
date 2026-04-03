// ===== 甜饼工坊 App v4.0 =====
// 聚焦 CSV 上传、云同步、现物/信用分开统计、分红快照规则

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames
            .filter((name) => name.startsWith('cookie-workshop-'))
            .map((name) => caches.delete(name))
        );
      }
    } catch {}
  });
}

// ===== Helpers =====
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const APP_VERSION = '4.0';
const SETTINGS_KEY = 'trade_diary_settings_v4';
const JSONBIN_BASE = 'https://api.jsonbin.io/v3/b';
const DIVIDEND_START_DATE = '2026-04-01';
const SCOPES = ['all', 'cash', 'margin'];
const MARGIN_INTEREST_RATE = 0.028;
const DAYS_IN_YEAR = 365;

const generateId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const deepClone = (value) => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

function trimText(value) {
  return String(value ?? '').replace(/^[\s\u3000]+|[\s\u3000]+$/g, '').replace(/\u00a0/g, ' ');
}

function compactText(value) {
  return trimText(value).replace(/[\s\u3000]+/g, '');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function todayStr(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(dateStr, diff) {
  const [year, month, day] = String(dateStr).split('-').map(Number);
  const date = new Date(year, month - 1, day + diff);
  return todayStr(date);
}

function normalizeAnyDate(value) {
  const raw = trimText(value);
  if (!raw) return '';

  let match = raw.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (match) {
    return match[1];
  }

  match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (match) {
    const [, year, month, day] = match;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  match = raw.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  if (match) {
    const [, year, month, day] = match;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return '';
}

function formatDateParts(dateStr) {
  const normalized = normalizeAnyDate(dateStr) || todayStr();
  const [year, month, day] = normalized.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return {
    normalized,
    year,
    month,
    day,
    label: `${month}月${day}日`,
    fullLabel: `${year}年${month}月${day}日`,
    weekday: date.toLocaleDateString('zh-CN', { weekday: 'short' })
  };
}

function formatMoney(value, options = {}) {
  const { signed = true } = options;
  const amount = Number(value) || 0;
  const abs = Math.abs(amount).toLocaleString('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });

  if (signed) {
    if (amount > 0) return `+¥${abs}`;
    if (amount < 0) return `-¥${abs}`;
  }

  return `${amount < 0 ? '-' : ''}¥${abs}`;
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(0)}%`;
}

function safeNumber(value) {
  if (value === '' || value == null) return null;
  const normalized = trimText(value).replace(/,/g, '');
  if (!normalized || normalized === '--') return null;
  const result = Number(normalized);
  return Number.isFinite(result) ? result : null;
}

function isTradeComplete(trade) {
  return Boolean(trimText(trade.symbol)) && (Number(trade.quantity) || 0) > 0 && (Number(trade.price) || 0) > 0;
}

function compareByDateAsc(a, b) {
  return a.date.localeCompare(b.date);
}

function compareTradeOrder(a, b) {
  const orderDelta = (Number(a.order) || 0) - (Number(b.order) || 0);
  if (orderDelta !== 0) return orderDelta;

  const timeA = new Date(a.createdAt || 0).getTime();
  const timeB = new Date(b.createdAt || 0).getTime();
  if (timeA !== timeB) return timeA - timeB;

  return String(a.id || '').localeCompare(String(b.id || ''));
}

function getScopeLabel(scope) {
  if (scope === 'cash') return '现物';
  if (scope === 'margin') return '信用';
  return '合计';
}

function getAccountBadgeClass(assetType) {
  return assetType === 'margin' ? 'badge badge-margin' : 'badge badge-cash';
}

function marketLabelFromKey(key) {
  if (key === 'pts') return 'PTS';
  if (key === 'other') return '其他';
  return '东证';
}

function normalizeMarketKey(value) {
  const raw = trimText(value).toUpperCase();
  if (!raw || raw === '--' || raw === 'TSE') return 'tse';
  if (raw === 'PTS' || raw.includes('PTS')) return 'pts';
  if (raw.includes('東証') || raw.includes('东证')) return 'tse';
  return 'other';
}

function getCurrentWeekMondayStr() {
  const now = new Date();
  const weekday = now.getDay();
  const diff = (weekday + 6) % 7;
  now.setHours(0, 0, 0, 0);
  now.setDate(now.getDate() - diff);
  return todayStr(now);
}

function toDateStartTimestamp(dateStr) {
  const normalized = normalizeAnyDate(dateStr);
  if (!normalized) return Number.NaN;
  const [year, month, day] = normalized.split('-').map(Number);
  return new Date(year, month - 1, day).getTime();
}

function calculateInclusiveHoldingDays(openDate, closeDate) {
  const openTime = toDateStartTimestamp(openDate);
  const closeTime = toDateStartTimestamp(closeDate);
  if (!Number.isFinite(openTime) || !Number.isFinite(closeTime)) return 1;
  const dayDiff = Math.floor((closeTime - openTime) / 86400000);
  return Math.max(1, dayDiff + 1);
}

function createScopeDayState() {
  return {
    grossProfit: 0,
    profit: 0,
    financingCost: 0,
    dividend: 0,
    tradeCount: 0,
    closeTradeCount: 0,
    buyCount: 0,
    sellCount: 0,
    positiveDividend: 0,
    lossShare: 0,
    symbols: new Set()
  };
}

function createScopeSummary() {
  return {
    grossProfit: 0,
    totalProfit: 0,
    financingCost: 0,
    activeDays: 0,
    winDays: 0,
    lossDays: 0,
    winRate: 0,
    tradeCount: 0,
    buyCount: 0,
    sellCount: 0,
    closeTradeCount: 0,
    symbolCount: 0,
    positionsCount: 0,
    positions: [],
    ranking: [],
    monthly: [],
    daySeries: [],
    dividendHistory: [],
    totalDividend: 0,
    totalLossShare: 0,
    netDividend: 0,
    today: { profit: 0, dividend: 0, tradeCount: 0, financingCost: 0 },
    week: { profit: 0, dividend: 0, tradeCount: 0, financingCost: 0 }
  };
}

function calculateDividendWithRule(profit, ruleSnapshot) {
  const amount = Number(profit) || 0;
  if (!amount || !ruleSnapshot) return 0;

  const numerator = Number(ruleSnapshot.numerator) || 1;
  const denominator = Number(ruleSnapshot.denominator) || 1;
  const ratio = numerator / denominator;

  if (amount >= 0) {
    return Math.ceil(amount * ratio * 0.8);
  }

  return Math.floor(amount * ratio);
}

// ===== Company Name Mapping =====
let companyMap = new Map();

async function loadCompanyData() {
  try {
    const response = await fetch('./companies_tse.json');
    if (!response.ok) return;

    const data = await response.json();
    if (Array.isArray(data.companies)) {
      data.companies.forEach((company) => {
        companyMap.set(String(company.code || '').toUpperCase(), {
          name: company.name,
          market: company.market
        });
      });
    }
  } catch (error) {
    console.warn('Could not load company data:', error);
  }
}

function getCompanyName(symbol) {
  if (!symbol) return '';
  const entry = companyMap.get(String(symbol).toUpperCase());
  return entry ? entry.name : '';
}

function getStockDisplayName(symbol, fallbackName = '') {
  return fallbackName || getCompanyName(symbol) || symbol || '';
}

// ===== IndexedDB =====
const DB_NAME = 'tradediary_db_local_v41';
const LEGACY_DB_NAMES = ['tradediary_db'];
const DB_VERSION = 1;
const STORE_NAME = 'days';
let legacyMigrationPromise = null;

function attachDbUpgradeHandler(request) {
  request.onupgradeneeded = (event) => {
    const db = event.target.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex('date', 'date', { unique: true });
      return;
    }

    const transaction = event.target.transaction;
    const store = transaction.objectStore(STORE_NAME);
    if (!store.indexNames.contains('date')) {
      store.createIndex('date', 'date', { unique: true });
    }
  };
}

function openNamedDB(dbName, version, needsUpgradeHandler = false) {
  return new Promise((resolve, reject) => {
    const request = typeof version === 'number'
      ? indexedDB.open(dbName, version)
      : indexedDB.open(dbName);
    if (needsUpgradeHandler) attachDbUpgradeHandler(request);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function dbHasRequiredSchema(db) {
  if (!db.objectStoreNames.contains(STORE_NAME)) return false;

  try {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    return store.indexNames.contains('date');
  } catch {
    return false;
  }
}

function deleteNamedDB(dbName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(dbName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(`数据库 ${dbName} 当前被占用，无法重建。`));
  });
}

async function openDB() {
  const recoverSchema = async (db) => {
    const nextVersion = Math.max(Number(db.version) || 1, DB_VERSION) + 1;
    db.close();

    const upgradedDb = await openNamedDB(DB_NAME, nextVersion, true);
    if (dbHasRequiredSchema(upgradedDb)) {
      return upgradedDb;
    }

    upgradedDb.close();
    await deleteNamedDB(DB_NAME);
    return openNamedDB(DB_NAME, DB_VERSION, true);
  };

  try {
    const db = await openNamedDB(DB_NAME, DB_VERSION, true);
    if (dbHasRequiredSchema(db)) {
      return db;
    }
    return recoverSchema(db);
  } catch (error) {
    if (error?.name !== 'VersionError') {
      throw error;
    }

    const existingDb = await openNamedDB(DB_NAME);
    if (dbHasRequiredSchema(existingDb)) {
      return existingDb;
    }
    return recoverSchema(existingDb);
  }
}

function readAllDaysFromDb(db) {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      resolve([]);
      return;
    }

    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const rows = [];

    let request;
    if (store.indexNames.contains('date')) {
      request = store.index('date').openCursor(null, 'prev');
    } else {
      request = store.openCursor();
    }

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        rows.push(cursor.value);
        cursor.continue();
      } else {
        resolve(rows);
      }
    };

    request.onerror = () => reject(request.error);
  });
}

function countDaysInDb(db) {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      resolve(0);
      return;
    }

    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).count();
    request.onsuccess = () => resolve(Number(request.result) || 0);
    request.onerror = () => reject(request.error);
  });
}

async function migrateLegacyDatabaseIfNeeded() {
  if (legacyMigrationPromise) return legacyMigrationPromise;

  legacyMigrationPromise = (async () => {
    try {
      const currentDb = await openDB();
      const currentCount = await countDaysInDb(currentDb);
      currentDb.close();
      if (currentCount > 0) return;
    } catch {}

    for (const legacyName of LEGACY_DB_NAMES) {
      try {
        const legacyDb = await openNamedDB(legacyName);
        const legacyRows = await readAllDaysFromDb(legacyDb);
        legacyDb.close();

        if (!legacyRows.length) continue;

        const normalizedRows = legacyRows.map(normalizeDay).sort(compareByDateAsc);
        await replaceAllDays(normalizedRows);
        return;
      } catch (error) {
        console.warn('Legacy DB migration skipped:', legacyName, error);
      }
    }
  })();

  return legacyMigrationPromise;
}

async function getAllDays() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('date');
    const request = index.openCursor(null, 'prev');
    const rows = [];

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        rows.push(cursor.value);
        cursor.continue();
      } else {
        resolve(rows);
      }
    };

    request.onerror = () => reject(request.error);
  });
}

async function getDayByDate(dateStr) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('date');
    const request = index.get(dateStr);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function saveDay(day) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(day);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteDay(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function clearAllDays() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function replaceAllDays(days) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    days.forEach((day) => store.put(day));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ===== Settings =====
function createDividendRule(assetType, numerator = 1, denominator = 3, updatedAt = new Date().toISOString()) {
  return {
    id: `${assetType}-${updatedAt}`,
    numerator,
    denominator,
    updatedAt
  };
}

function createDefaultSettings() {
  const now = new Date().toISOString();
  return {
    version: APP_VERSION,
    updatedAt: now,
    lastCsvImportAt: '',
    lastCsvImportSummary: null,
    dividendRules: {
      cash: createDividendRule('cash', 1, 3, now),
      margin: createDividendRule('margin', 1, 3, now)
    }
  };
}

function normalizeRuleSnapshot(ruleSnapshot, assetType) {
  const fallback = createDividendRule(assetType);
  const numerator = Math.max(1, Number(ruleSnapshot?.numerator) || Number(fallback.numerator) || 1);
  const denominator = Math.max(1, Number(ruleSnapshot?.denominator) || Number(fallback.denominator) || 1);
  return {
    ruleId: ruleSnapshot?.ruleId || ruleSnapshot?.id || fallback.id,
    numerator,
    denominator,
    updatedAt: ruleSnapshot?.updatedAt || fallback.updatedAt || new Date().toISOString()
  };
}

function normalizeSettings(raw) {
  const defaults = createDefaultSettings();
  const settings = raw && typeof raw === 'object' ? raw : {};
  return {
    version: APP_VERSION,
    updatedAt: settings.updatedAt || defaults.updatedAt,
    lastCsvImportAt: settings.lastCsvImportAt || '',
    lastCsvImportSummary: settings.lastCsvImportSummary || null,
    dividendRules: {
      cash: (() => {
        const rule = settings.dividendRules?.cash;
        const snapshot = normalizeRuleSnapshot(rule, 'cash');
        return { id: snapshot.ruleId, numerator: snapshot.numerator, denominator: snapshot.denominator, updatedAt: snapshot.updatedAt };
      })(),
      margin: (() => {
        const rule = settings.dividendRules?.margin;
        const snapshot = normalizeRuleSnapshot(rule, 'margin');
        return { id: snapshot.ruleId, numerator: snapshot.numerator, denominator: snapshot.denominator, updatedAt: snapshot.updatedAt };
      })()
    }
  };
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return createDefaultSettings();
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return createDefaultSettings();
  }
}

function persistSettings() {
  SETTINGS.updatedAt = new Date().toISOString();
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(SETTINGS));
}

function cloneActiveRuleSnapshot(assetType) {
  const rule = SETTINGS.dividendRules[assetType] || createDividendRule(assetType);
  return {
    ruleId: rule.id,
    numerator: rule.numerator,
    denominator: rule.denominator,
    updatedAt: rule.updatedAt
  };
}

// ===== Trade Model =====
const MANUAL_TYPE_MAP = {
  spot_buy: {
    assetType: 'cash',
    action: 'buy',
    positionEffect: 'open',
    positionSide: 'long',
    tradeTypeLabel: '株式現物買',
    label: '现物买'
  },
  spot_sell: {
    assetType: 'cash',
    action: 'sell',
    positionEffect: 'close',
    positionSide: 'long',
    tradeTypeLabel: '株式現物売',
    label: '现物卖'
  },
  margin_open_long: {
    assetType: 'margin',
    action: 'buy',
    positionEffect: 'open',
    positionSide: 'long',
    tradeTypeLabel: '信用新規買',
    label: '新规买'
  },
  margin_close_long: {
    assetType: 'margin',
    action: 'sell',
    positionEffect: 'close',
    positionSide: 'long',
    tradeTypeLabel: '信用返済売',
    label: '返済卖'
  },
  margin_open_short: {
    assetType: 'margin',
    action: 'sell',
    positionEffect: 'open',
    positionSide: 'short',
    tradeTypeLabel: '信用新規売',
    label: '新规卖'
  },
  margin_close_short: {
    assetType: 'margin',
    action: 'buy',
    positionEffect: 'close',
    positionSide: 'short',
    tradeTypeLabel: '信用返済買',
    label: '返済买'
  }
};

function inferManualTypeFromFields(assetType, action, positionEffect, positionSide) {
  return Object.keys(MANUAL_TYPE_MAP).find((key) => {
    const item = MANUAL_TYPE_MAP[key];
    return item.assetType === assetType
      && item.action === action
      && item.positionEffect === positionEffect
      && item.positionSide === positionSide;
  }) || (assetType === 'margin' ? 'margin_open_long' : 'spot_buy');
}

function getManualTypeOptions(assetType) {
  if (assetType === 'margin') {
    return ['margin_open_long', 'margin_close_long', 'margin_open_short', 'margin_close_short'];
  }
  return ['spot_buy', 'spot_sell'];
}

function describeTradeType(rawTradeType = '') {
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

function createManualTrade(preset = {}) {
  const manualType = preset.manualType || 'spot_buy';
  const config = MANUAL_TYPE_MAP[manualType];
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
    settlementDate: preset.settlementDate || '',
    settlementAmount: preset.settlementAmount ?? '',
    notes: preset.notes || '',
    assetType: config.assetType,
    action: config.action,
    positionEffect: config.positionEffect,
    positionSide: config.positionSide,
    tradeTypeLabel: config.tradeTypeLabel,
    ratioSnapshot: preset.ratioSnapshot || cloneActiveRuleSnapshot(config.assetType),
    order: preset.order ?? 0
  }, preset.date || todayStr(), Number(preset.order) || 0);
}

function normalizeTrade(trade, dayDate, index = 0) {
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

  return {
    id: raw.id || generateId(),
    source: raw.source || (raw.fingerprint ? 'csv' : 'manual'),
    createdAt: raw.createdAt || raw.updatedAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString(),
    order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : index,
    symbol,
    name: trimText(raw.name || getStockDisplayName(symbol)),
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
    settlementDate: normalizeAnyDate(raw.settlementDate) || '',
    settlementAmount: raw.settlementAmount === '' ? '' : (safeNumber(raw.settlementAmount) ?? ''),
    notes: trimText(raw.notes || ''),
    fingerprint: trimText(raw.fingerprint || ''),
    csvBaseSignature: trimText(raw.csvBaseSignature || ''),
    ratioSnapshot: normalizeRuleSnapshot(raw.ratioSnapshot, assetType)
  };
}

function normalizeDay(day) {
  const date = normalizeAnyDate(day?.date) || todayStr();
  const trades = Array.isArray(day?.trades)
    ? day.trades.map((trade, index) => normalizeTrade(trade, date, index)).sort(compareTradeOrder)
    : [];

  return {
    id: day?.id || generateId(),
    date,
    trades: trades.map((trade, index) => ({ ...trade, order: index })),
    updatedAt: day?.updatedAt || new Date().toISOString()
  };
}

function reindexTrades(trades, date) {
  return trades.map((trade, index) => normalizeTrade({ ...trade, order: index }, date, index));
}

function buildTradeSoftKey(date, trade) {
  const normalized = normalizeTrade(trade, date, Number(trade?.order) || 0);
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

function getTradeIdentityKeys(date, trade) {
  const normalized = normalizeTrade(trade, date, Number(trade?.order) || 0);
  const keys = [];
  if (normalized.id) keys.push(`id:${normalized.id}`);
  if (normalized.fingerprint) keys.push(`fp:${normalized.fingerprint}`);
  keys.push(`soft:${buildTradeSoftKey(date, normalized)}`);
  return keys;
}

function mergeTradeVersions(existingTrade, incomingTrade, date) {
  const existing = normalizeTrade(existingTrade, date, Number(existingTrade?.order) || 0);
  const incoming = normalizeTrade(incomingTrade, date, Number(incomingTrade?.order) || 0);
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
    ratioSnapshot: preferred.ratioSnapshot || secondary.ratioSnapshot || cloneActiveRuleSnapshot(preferred.assetType)
  }, date, Number(preferred.order) || 0);
}

// ===== CSV =====
function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const content = String(text || '').replace(/^\uFEFF/, '');

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (inQuotes) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char === '\r') {
      if (content[i + 1] === '\n') continue;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((cell) => trimText(cell)));
}

async function decodeCsvFile(file) {
  const buffer = await file.arrayBuffer();
  const tryDecode = (encoding) => {
    try {
      return new TextDecoder(encoding).decode(buffer);
    } catch {
      return '';
    }
  };

  const shiftJisText = tryDecode('shift-jis');
  if (shiftJisText.includes('約定日')) return shiftJisText;

  const utf8Text = tryDecode('utf-8');
  if (utf8Text.includes('約定日')) return utf8Text;

  return shiftJisText || utf8Text;
}

function buildCsvBaseSignature(record, normalizedDate) {
  const columns = [
    normalizedDate,
    compactText(record['銘柄'] || ''),
    compactText(record['銘柄コード'] || ''),
    compactText(record['市場'] || ''),
    compactText(record['取引'] || ''),
    compactText(record['期限'] || ''),
    compactText(record['預り'] || ''),
    compactText(record['課税'] || ''),
    compactText(record['約定数量'] || ''),
    compactText(record['約定単価'] || ''),
    compactText(record['手数料/諸経費等'] || ''),
    compactText(record['税額'] || ''),
    compactText(record['受渡日'] || ''),
    compactText(record['受渡金額/決済損益'] || '')
  ];
  return columns.join('|');
}

function parseBrokerCsv(text) {
  const rows = parseCsvRows(text);
  const headerIndex = rows.findIndex((cells) => trimText(cells[0]) === '約定日');
  if (headerIndex < 0) {
    throw new Error('CSV 中没有找到“約定日”表头，请确认导出的是约定履历 CSV。');
  }

  const headers = rows[headerIndex].map(trimText);
  const getCell = (row, header) => {
    const index = headers.indexOf(header);
    return index >= 0 ? trimText(row[index]) : '';
  };

  const dataRows = rows.slice(headerIndex + 1).filter((row) => row.some((cell) => trimText(cell)));
  const seen = new Map();
  const trades = [];
  const summary = {
    totalRows: dataRows.length,
    importedRows: 0,
    skippedInvestmentTrust: 0,
    skippedUnsupported: 0,
    skippedEmpty: 0
  };

  dataRows.forEach((row) => {
    const rawTradeType = getCell(row, '取引');
    const rawDate = getCell(row, '約定日');

    if (!rawDate || !rawTradeType) {
      summary.skippedEmpty += 1;
      return;
    }

    if (rawTradeType.includes('投信')) {
      summary.skippedInvestmentTrust += 1;
      return;
    }

    const descriptor = describeTradeType(rawTradeType);
    if (!descriptor.supported) {
      summary.skippedUnsupported += 1;
      return;
    }

    const date = normalizeAnyDate(rawDate);
    if (!date) {
      summary.skippedEmpty += 1;
      return;
    }

    const baseSignature = buildCsvBaseSignature({
      '銘柄': getCell(row, '銘柄'),
      '銘柄コード': getCell(row, '銘柄コード'),
      '市場': getCell(row, '市場'),
      '取引': rawTradeType,
      '期限': getCell(row, '期限'),
      '預り': getCell(row, '預り'),
      '課税': getCell(row, '課税'),
      '約定数量': getCell(row, '約定数量'),
      '約定単価': getCell(row, '約定単価'),
      '手数料/諸経費等': getCell(row, '手数料/諸経費等'),
      '税額': getCell(row, '税額'),
      '受渡日': getCell(row, '受渡日'),
      '受渡金額/決済損益': getCell(row, '受渡金額/決済損益')
    }, date);

    const ordinal = (seen.get(baseSignature) || 0) + 1;
    seen.set(baseSignature, ordinal);

    const manualType = descriptor.manualType;
    const config = MANUAL_TYPE_MAP[manualType];
    const market = normalizeMarketKey(getCell(row, '市場'));

    trades.push({
      date,
      trade: normalizeTrade({
        id: generateId(),
        source: 'csv',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        manualType,
        assetType: config.assetType,
        action: config.action,
        positionEffect: config.positionEffect,
        positionSide: config.positionSide,
        symbol: compactText(getCell(row, '銘柄コード')),
        name: trimText(getCell(row, '銘柄')),
        market,
        marketLabel: trimText(getCell(row, '市場') || marketLabelFromKey(market)),
        tradeTypeLabel: rawTradeType,
        term: trimText(getCell(row, '期限') || '--'),
        custody: trimText(getCell(row, '預り') || '特定'),
        taxCategory: trimText(getCell(row, '課税') || '--'),
        quantity: safeNumber(getCell(row, '約定数量')) ?? '',
        price: safeNumber(getCell(row, '約定単価')) ?? '',
        fee: safeNumber(getCell(row, '手数料/諸経費等')) ?? '',
        taxAmount: safeNumber(getCell(row, '税額')) ?? '',
        settlementDate: normalizeAnyDate(getCell(row, '受渡日')) || '',
        settlementAmount: safeNumber(getCell(row, '受渡金額/決済損益')) ?? '',
        notes: '',
        fingerprint: `${baseSignature}#${ordinal}`,
        csvBaseSignature: baseSignature,
        ratioSnapshot: cloneActiveRuleSnapshot(config.assetType)
      }, date, ordinal)
    });
  });

  summary.importedRows = trades.length;
  return { trades, summary };
}

async function importCsvFile(file) {
  const text = await decodeCsvFile(file);
  const parsed = parseBrokerCsv(text);

  if (!parsed.trades.length) {
    throw new Error('CSV 里没有可导入的株式現物/信用交易。');
  }

  const now = new Date().toISOString();
  const workingDays = new Map(DAYS.map((day) => {
    const normalizedDay = normalizeDay(day);
    return [normalizedDay.date, normalizedDay];
  }));

  parsed.trades.forEach(({ date, trade }) => {
    const day = workingDays.get(date) || {
      id: generateId(),
      date,
      trades: [],
      updatedAt: now
    };

    const matchIndex = day.trades.findIndex((existingTrade) => {
      if (existingTrade.fingerprint && trade.fingerprint) {
        return existingTrade.fingerprint === trade.fingerprint;
      }
      if (!existingTrade.fingerprint) {
        return buildTradeSoftKey(date, existingTrade) === buildTradeSoftKey(date, trade);
      }
      return false;
    });

    if (matchIndex >= 0) {
      day.trades[matchIndex] = mergeTradeVersions(day.trades[matchIndex], {
        ...trade,
        updatedAt: now,
        ratioSnapshot: day.trades[matchIndex].ratioSnapshot || trade.ratioSnapshot
      }, date);
    } else {
      day.trades.push(normalizeTrade({
        ...trade,
        updatedAt: now,
        order: day.trades.length
      }, date, day.trades.length));
    }

    day.trades = reindexTrades(day.trades.sort(compareTradeOrder), date);
    day.updatedAt = now;
    workingDays.set(date, day);
  });

  const mergedDays = Array.from(workingDays.values())
    .filter((day) => day.trades.length > 0)
    .map((day) => normalizeDay(day))
    .sort(compareByDateAsc);

  await replaceAllDays(mergedDays);

  SETTINGS.lastCsvImportAt = now;
  SETTINGS.lastCsvImportSummary = parsed.summary;
  persistSettings();

  await refresh();
  return parsed.summary;
}

// ===== Analytics =====
function addLongPosition(map, trade, quantity, totalCost, openedDate = '') {
  const symbol = trade.symbol;
  if (!map.has(symbol)) {
    map.set(symbol, {
      symbol,
      name: getStockDisplayName(symbol, trade.name),
      quantity: 0,
      totalCost: 0,
      market: trade.market,
      lots: []
    });
  }

  const position = map.get(symbol);
  position.name = trade.name || position.name || getStockDisplayName(symbol);
  position.market = trade.market || position.market || 'tse';
  position.quantity += quantity;
  position.totalCost += totalCost;

  if (quantity > 0 && totalCost > 0) {
    position.lots.push({
      openDate: normalizeAnyDate(openedDate) || '',
      quantity,
      totalCost
    });
  }
}

function reduceLongLots(position, closeQty, closeDate, applyFinancing = false) {
  if (!Array.isArray(position?.lots) || !position.lots.length) {
    return { financingCost: 0, weightedHoldingDays: 0 };
  }

  const totalQuantity = Number(position.quantity) || 0;
  if (totalQuantity <= 0 || closeQty <= 0) {
    return { financingCost: 0, weightedHoldingDays: 0 };
  }

  const closeRatio = Math.min(1, closeQty / totalQuantity);
  let financingCost = 0;
  let weightedHoldingDays = 0;

  position.lots = position.lots
    .map((lot) => {
      const lotQuantity = Number(lot.quantity) || 0;
      const lotTotalCost = Number(lot.totalCost) || 0;
      if (lotQuantity <= 0 || lotTotalCost <= 0) return null;

      const closedQuantity = lotQuantity * closeRatio;
      const closedCost = lotTotalCost * closeRatio;

      if (applyFinancing && closedCost > 0) {
        const holdingDays = calculateInclusiveHoldingDays(lot.openDate, closeDate);
        financingCost += (closedCost * MARGIN_INTEREST_RATE * holdingDays) / DAYS_IN_YEAR;
        weightedHoldingDays += closedQuantity * holdingDays;
      }

      const nextQuantity = lotQuantity - closedQuantity;
      const nextTotalCost = lotTotalCost - closedCost;

      if (nextQuantity <= 1e-8 || nextTotalCost <= 1e-8) return null;
      return {
        ...lot,
        quantity: nextQuantity,
        totalCost: nextTotalCost
      };
    })
    .filter(Boolean);

  return {
    financingCost,
    weightedHoldingDays
  };
}

function closeLongPosition(map, symbol, quantity, revenue, closeDate, options = {}) {
  const { applyFinancing = false } = options;
  const position = map.get(symbol);
  if (!position || position.quantity <= 0) {
    return {
      closeQty: 0,
      grossProfit: 0,
      financingCost: 0,
      netProfit: 0,
      averageHoldingDays: 0
    };
  }

  const closeQty = Math.min(quantity, position.quantity);
  if (closeQty <= 0) {
    return {
      closeQty: 0,
      grossProfit: 0,
      financingCost: 0,
      netProfit: 0,
      averageHoldingDays: 0
    };
  }

  const avgCost = position.totalCost / position.quantity;
  const costBasis = avgCost * closeQty;
  const grossProfit = revenue - costBasis;
  const lotResult = reduceLongLots(position, closeQty, closeDate, applyFinancing);
  const financingCost = applyFinancing ? lotResult.financingCost : 0;

  position.quantity -= closeQty;
  position.totalCost -= costBasis;

  if (position.quantity <= 0) {
    map.delete(symbol);
  }

  return {
    closeQty,
    grossProfit,
    financingCost,
    netProfit: grossProfit - financingCost,
    averageHoldingDays: closeQty > 0 ? lotResult.weightedHoldingDays / closeQty : 0
  };
}

function addShortPosition(map, trade, quantity, totalEntry) {
  const symbol = trade.symbol;
  if (!map.has(symbol)) {
    map.set(symbol, {
      symbol,
      name: getStockDisplayName(symbol, trade.name),
      quantity: 0,
      totalEntry: 0,
      market: trade.market
    });
  }

  const position = map.get(symbol);
  position.name = trade.name || position.name || getStockDisplayName(symbol);
  position.market = trade.market || position.market || 'tse';
  position.quantity += quantity;
  position.totalEntry += totalEntry;
}

function closeShortPosition(map, symbol, quantity, costToClose) {
  const position = map.get(symbol);
  if (!position || position.quantity <= 0) return 0;

  const closeQty = Math.min(quantity, position.quantity);
  const avgEntry = position.totalEntry / position.quantity;
  const entryValue = avgEntry * closeQty;
  position.quantity -= closeQty;
  position.totalEntry -= entryValue;

  if (position.quantity <= 0) {
    map.delete(symbol);
  }

  return entryValue - costToClose;
}

function buildAnalytics(days) {
  const normalizedDays = days.map(normalizeDay).sort(compareByDateAsc);
  const dayViews = normalizedDays.map((day) => ({
    id: day.id,
    date: day.date,
    updatedAt: day.updatedAt,
    importedCount: day.trades.filter((trade) => trade.fingerprint).length,
    manualCount: day.trades.filter((trade) => !trade.fingerprint).length,
    trades: [],
    scopes: {
      all: createScopeDayState(),
      cash: createScopeDayState(),
      margin: createScopeDayState()
    }
  }));

  const dayMap = new Map(dayViews.map((dayView) => [dayView.date, dayView]));
  const cashPositions = new Map();
  const marginLongPositions = new Map();
  const marginShortPositions = new Map();
  const enrichedTrades = [];

  normalizedDays.forEach((day) => {
    const dayView = dayMap.get(day.date);

    day.trades.forEach((trade, index) => {
      const normalizedTrade = normalizeTrade(trade, day.date, index);
      const quantity = Number(normalizedTrade.quantity) || 0;
      const price = Number(normalizedTrade.price) || 0;
      const fee = Number(normalizedTrade.fee) || 0;
      const taxAmount = Number(normalizedTrade.taxAmount) || 0;
      const settlementAmount = safeNumber(normalizedTrade.settlementAmount);
      const grossAmount = quantity * price;
      const buyCost = normalizedTrade.assetType === 'cash' && settlementAmount != null && normalizedTrade.action === 'buy'
        ? settlementAmount
        : grossAmount + fee + taxAmount;
      const sellRevenue = normalizedTrade.assetType === 'cash' && settlementAmount != null && normalizedTrade.action === 'sell'
        ? settlementAmount
        : grossAmount - fee - taxAmount;

      let realizedProfit = 0;
      let grossRealizedProfit = 0;
      let financingCost = 0;
      let averageHoldingDays = 0;

      if (normalizedTrade.assetType === 'cash') {
        if (normalizedTrade.action === 'buy') {
          addLongPosition(cashPositions, normalizedTrade, quantity, buyCost, day.date);
        } else {
          const closeResult = closeLongPosition(cashPositions, normalizedTrade.symbol, quantity, sellRevenue, day.date);
          realizedProfit = closeResult.netProfit;
          grossRealizedProfit = closeResult.grossProfit;
        }
      } else if (normalizedTrade.positionSide === 'short') {
        if (normalizedTrade.positionEffect === 'open') {
          addShortPosition(marginShortPositions, normalizedTrade, quantity, grossAmount - fee - taxAmount);
        } else {
          realizedProfit = closeShortPosition(marginShortPositions, normalizedTrade.symbol, quantity, grossAmount + fee + taxAmount);
          grossRealizedProfit = realizedProfit;
        }
      } else {
        if (normalizedTrade.positionEffect === 'open') {
          addLongPosition(marginLongPositions, normalizedTrade, quantity, grossAmount + fee + taxAmount, day.date);
        } else {
          const closeResult = closeLongPosition(
            marginLongPositions,
            normalizedTrade.symbol,
            quantity,
            grossAmount - fee - taxAmount,
            day.date,
            { applyFinancing: true }
          );
          realizedProfit = closeResult.netProfit;
          grossRealizedProfit = closeResult.grossProfit;
          financingCost = closeResult.financingCost;
          averageHoldingDays = closeResult.averageHoldingDays;
        }
      }

      const dividendAmount = day.date >= DIVIDEND_START_DATE
        ? calculateDividendWithRule(realizedProfit, normalizedTrade.ratioSnapshot)
        : 0;

      const enrichedTrade = {
        ...normalizedTrade,
        realizedProfit,
        grossRealizedProfit,
        financingCost,
        averageHoldingDays,
        dividendAmount,
        dayDate: day.date
      };

      dayView.trades.push(enrichedTrade);
      enrichedTrades.push(enrichedTrade);

      const targets = [dayView.scopes.all, dayView.scopes[normalizedTrade.assetType]];
      targets.forEach((scopeState) => {
        scopeState.tradeCount += 1;
        scopeState.grossProfit += grossRealizedProfit;
        scopeState.profit += realizedProfit;
        scopeState.financingCost += financingCost;
        scopeState.dividend += dividendAmount;
        scopeState.symbols.add(normalizedTrade.symbol || normalizedTrade.name || '');

        if (normalizedTrade.action === 'buy') scopeState.buyCount += 1;
        if (normalizedTrade.action === 'sell') scopeState.sellCount += 1;
        if (normalizedTrade.positionEffect === 'close' || (normalizedTrade.assetType === 'cash' && normalizedTrade.action === 'sell')) {
          scopeState.closeTradeCount += 1;
        }
        if (dividendAmount > 0) scopeState.positiveDividend += dividendAmount;
        if (dividendAmount < 0) scopeState.lossShare += Math.abs(dividendAmount);
      });
    });
  });

  const positions = {
    cash: Array.from(cashPositions.values()).map((position) => ({
      assetType: 'cash',
      positionSide: 'long',
      symbol: position.symbol,
      name: position.name,
      quantity: position.quantity,
      avgPrice: position.quantity > 0 ? position.totalCost / position.quantity : 0,
      market: position.market
    })),
    margin: [
      ...Array.from(marginLongPositions.values()).map((position) => ({
        assetType: 'margin',
        positionSide: 'long',
        symbol: position.symbol,
        name: position.name,
        quantity: position.quantity,
        avgPrice: position.quantity > 0 ? position.totalCost / position.quantity : 0,
        market: position.market
      })),
      ...Array.from(marginShortPositions.values()).map((position) => ({
        assetType: 'margin',
        positionSide: 'short',
        symbol: position.symbol,
        name: position.name,
        quantity: position.quantity,
        avgPrice: position.quantity > 0 ? position.totalEntry / position.quantity : 0,
        market: position.market
      }))
    ]
  };
  positions.all = [...positions.cash, ...positions.margin];

  const summaries = {
    all: createScopeSummary(),
    cash: createScopeSummary(),
    margin: createScopeSummary()
  };

  const today = todayStr();
  const monday = getCurrentWeekMondayStr();

  SCOPES.forEach((scope) => {
    const summary = summaries[scope];
    const rankingMap = new Map();
    const monthlyMap = new Map();
    const dividendHistory = [];
    const symbolSet = new Set();

    dayViews.forEach((day) => {
      const scopeDay = day.scopes[scope];
      if (!scopeDay.tradeCount) return;

      summary.totalProfit += scopeDay.profit;
      summary.grossProfit += scopeDay.grossProfit;
      summary.financingCost += scopeDay.financingCost;
      summary.activeDays += 1;
      summary.tradeCount += scopeDay.tradeCount;
      summary.buyCount += scopeDay.buyCount;
      summary.sellCount += scopeDay.sellCount;
      summary.closeTradeCount += scopeDay.closeTradeCount;
      summary.daySeries.push({ date: day.date, value: scopeDay.profit });

      if (scopeDay.profit > 0) summary.winDays += 1;
      if (scopeDay.profit < 0) summary.lossDays += 1;

      if (day.date === today) {
        summary.today = {
          profit: scopeDay.profit,
          dividend: scopeDay.dividend,
          tradeCount: scopeDay.tradeCount,
          financingCost: scopeDay.financingCost
        };
      }

      if (day.date >= monday && day.date <= today) {
        summary.week.profit += scopeDay.profit;
        summary.week.dividend += scopeDay.dividend;
        summary.week.tradeCount += scopeDay.tradeCount;
        summary.week.financingCost += scopeDay.financingCost;
      }

      if (day.date >= DIVIDEND_START_DATE && scopeDay.dividend !== 0) {
        dividendHistory.push({
          date: day.date,
          profit: scopeDay.profit,
          dividend: scopeDay.dividend,
          cashDividend: day.scopes.cash.dividend,
          marginDividend: day.scopes.margin.dividend
        });
      }

      const monthKey = day.date.slice(0, 7);
      monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + scopeDay.profit);
      scopeDay.symbols.forEach((symbol) => symbol && symbolSet.add(symbol));
      summary.totalDividend += scopeDay.positiveDividend;
      summary.totalLossShare += scopeDay.lossShare;
    });

    enrichedTrades.forEach((trade) => {
      if (scope !== 'all' && trade.assetType !== scope) return;
      if (trade.symbol) symbolSet.add(trade.symbol);

      if (!rankingMap.has(trade.symbol)) {
        rankingMap.set(trade.symbol, {
          symbol: trade.symbol,
          name: getStockDisplayName(trade.symbol, trade.name),
          profit: 0,
          buyCount: 0,
          sellCount: 0,
          tradeCount: 0
        });
      }

      const target = rankingMap.get(trade.symbol);
      target.profit += trade.realizedProfit;
      target.tradeCount += 1;
      if (trade.action === 'buy') target.buyCount += 1;
      if (trade.action === 'sell') target.sellCount += 1;
    });

    summary.netDividend = summary.totalDividend - summary.totalLossShare;
    summary.winRate = summary.activeDays ? Math.round((summary.winDays / summary.activeDays) * 100) : 0;
    summary.symbolCount = symbolSet.size;
    summary.positions = positions[scope];
    summary.positionsCount = positions[scope].length;
    summary.ranking = Array.from(rankingMap.values())
      .filter((item) => item.tradeCount > 0)
      .sort((a, b) => b.profit - a.profit);
    summary.monthly = Array.from(monthlyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, profit]) => ({ month, profit }));
    summary.dividendHistory = dividendHistory.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);
  });

  return {
    daysAsc: dayViews,
    daysDesc: [...dayViews].sort((a, b) => b.date.localeCompare(a.date)),
    trades: enrichedTrades.sort((a, b) => {
      const dateDelta = b.dayDate.localeCompare(a.dayDate);
      if (dateDelta !== 0) return dateDelta;
      return (Number(a.order) || 0) - (Number(b.order) || 0);
    }),
    summaries,
    positions
  };
}

// ===== App State =====
let SETTINGS = loadSettings();
let DAYS = [];
let ANALYTICS = buildAnalytics([]);
let dashboardScope = 'all';
let analysisScope = 'all';
let dividendScope = 'all';
let currentMonthFilter = 'all';
let chartRange = 'week';
let chartType = 'cumulative';
let profitChart = null;
let monthlyChart = null;
let editingMode = 'add';
let editingDay = null;
let editingTrades = [];
let ratioEditTarget = '';
let isJsonbinSyncing = false;

let jsonbinApiKey = localStorage.getItem('jsonbin_api_key') || '';
let jsonbinBinId = localStorage.getItem('jsonbin_bin_id') || '';

// ===== Charts =====
function getScopeAccent(scope) {
  if (scope === 'cash') {
    return { line: '#5ca9ff', fill: 'rgba(92, 169, 255, 0.16)' };
  }
  if (scope === 'margin') {
    return { line: '#ff9f4d', fill: 'rgba(255, 159, 77, 0.18)' };
  }
  return { line: '#4ecdc4', fill: 'rgba(78, 205, 196, 0.16)' };
}

function createMainChart() {
  const canvas = $('#profitChart');
  if (!canvas) return;

  profitChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        data: [],
        borderColor: '#4ecdc4',
        backgroundColor: 'rgba(78, 205, 196, 0.16)',
        borderWidth: 3,
        fill: true,
        tension: 0.32,
        pointRadius: 0,
        pointHoverRadius: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          callbacks: {
            label: (item) => formatMoney(item.raw)
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: 'rgba(236,245,255,0.65)', maxRotation: 0 }
        },
        y: {
          grid: { color: 'rgba(236,245,255,0.08)' },
          ticks: {
            color: 'rgba(236,245,255,0.65)',
            callback: (value) => `¥${value}`
          }
        }
      }
    }
  });
}

function updateMainChart() {
  if (!profitChart) return;

  const summary = ANALYTICS.summaries[dashboardScope];
  let series = [...summary.daySeries];
  const today = todayStr();

  if (chartRange === 'week') {
    const start = addDays(today, -6);
    series = series.filter((item) => item.date >= start);
  } else if (chartRange === 'month') {
    const start = addDays(today, -29);
    series = series.filter((item) => item.date >= start);
  }

  const labels = series.map((item) => {
    const parts = formatDateParts(item.date);
    return `${parts.month}/${parts.day}`;
  });

  let values = series.map((item) => item.value);
  if (chartType === 'cumulative') {
    let running = 0;
    values = values.map((value) => {
      running += value;
      return running;
    });
  }

  const accent = getScopeAccent(dashboardScope);
  profitChart.data.labels = labels;
  profitChart.data.datasets[0].data = values;
  profitChart.data.datasets[0].borderColor = accent.line;
  profitChart.data.datasets[0].backgroundColor = accent.fill;
  profitChart.options.plugins.tooltip.callbacks.label = (item) => {
    return chartType === 'daily'
      ? `当日收益 ${formatMoney(item.raw)}`
      : `累计收益 ${formatMoney(item.raw)}`;
  };
  profitChart.update();
}

function updateMonthlyChart() {
  const canvas = $('#monthlyChart');
  if (!canvas) return;

  const summary = ANALYTICS.summaries[analysisScope];
  const labels = summary.monthly.map((item) => item.month.replace('-', '/'));
  const data = summary.monthly.map((item) => item.profit);
  const colors = data.map((value) => value >= 0 ? '#34d399' : '#fb7185');

  if (monthlyChart) {
    monthlyChart.destroy();
  }

  monthlyChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderRadius: 10,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          callbacks: {
            label: (item) => formatMoney(item.raw)
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: 'rgba(236,245,255,0.65)' }
        },
        y: {
          grid: { color: 'rgba(236,245,255,0.08)' },
          ticks: {
            color: 'rgba(236,245,255,0.65)',
            callback: (value) => `¥${value}`
          }
        }
      }
    }
  });
}

// ===== Rendering =====
function updateScopeButtons(owner, activeScope) {
  $$(`.scope-btn[data-owner="${owner}"]`).forEach((button) => {
    button.classList.toggle('active', button.dataset.scope === activeScope);
  });
}

function updateChartButtons() {
  $$('#chartRangeToggle .mini-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.range === chartRange);
  });
  $$('#chartTypeToggle .mini-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.type === chartType);
  });
}

function updateMonthFilter() {
  const select = $('#monthFilter');
  const months = Array.from(new Set(DAYS.map((day) => day.date.slice(0, 7)))).sort().reverse();

  select.innerHTML = '<option value="all">全部</option>';
  months.forEach((month) => {
    const [year, mon] = month.split('-');
    const option = document.createElement('option');
    option.value = month;
    option.textContent = `${year}年${Number(mon)}月`;
    select.appendChild(option);
  });

  if (currentMonthFilter !== 'all' && !months.includes(currentMonthFilter)) {
    currentMonthFilter = 'all';
  }
  select.value = currentMonthFilter;
}

function getFilteredRecordDays() {
  return ANALYTICS.daysDesc.filter((day) => {
    if (currentMonthFilter !== 'all' && day.date.slice(0, 7) !== currentMonthFilter) return false;
    return day.scopes[dashboardScope].tradeCount > 0;
  });
}

function renderDashboardSummary() {
  const summary = ANALYTICS.summaries[dashboardScope];
  $('#dashboardScopeCaption').textContent = `当前查看${getScopeLabel(dashboardScope)}数据`;
  $('#summaryProfit').textContent = formatMoney(summary.totalProfit, { signed: false });
  $('#summaryProfit').className = `summary-value ${summary.totalProfit > 0 ? 'positive' : summary.totalProfit < 0 ? 'negative' : 'neutral'}`;
  $('#summaryTradeDays').textContent = summary.activeDays;
  $('#summaryWinRate').textContent = formatPercent(summary.winRate);
  $('#summaryOpenPositions').textContent = summary.positionsCount;
  $('#summaryProfitNote').textContent = summary.financingCost > 0
    ? `${summary.closeTradeCount} 笔已实现平仓/卖出 · 已扣融资成本 ${formatMoney(summary.financingCost, { signed: false })}`
    : `${summary.closeTradeCount} 笔已实现平仓/卖出`;
  updateScopeButtons('dashboard', dashboardScope);
}

function renderRecords() {
  const container = $('#recordsList');
  const days = getFilteredRecordDays();

  if (!days.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🍪</div>
        <div class="empty-title">这个范围还没有记录</div>
        <div class="empty-desc">切换到其他视角，或者先录入 / 上传交易。</div>
      </div>
    `;
    return;
  }

  container.innerHTML = days.map((day) => {
    const parts = formatDateParts(day.date);
    const scopeDay = day.scopes[dashboardScope];
    const badgeHtml = [];

    if (day.scopes.cash.tradeCount) badgeHtml.push(`<span class="badge badge-cash">现物 ${day.scopes.cash.tradeCount}</span>`);
    if (day.scopes.margin.tradeCount) badgeHtml.push(`<span class="badge badge-margin">信用 ${day.scopes.margin.tradeCount}</span>`);
    if (day.importedCount) badgeHtml.push(`<span class="badge badge-imported">CSV ${day.importedCount}</span>`);
    if (day.manualCount) badgeHtml.push(`<span class="badge badge-manual">手动 ${day.manualCount}</span>`);

    const symbols = Array.from(scopeDay.symbols).filter(Boolean).slice(0, 4).map((symbol) => {
      const matchTrade = day.trades.find((trade) => trade.symbol === symbol);
      return getStockDisplayName(symbol, matchTrade?.name);
    });

    return `
      <article class="record-card" data-date="${day.date}">
        <div class="record-head">
          <div class="record-date">
            <strong>${parts.month}月${parts.day}日</strong>
            <span>${parts.weekday}</span>
          </div>
          <div class="record-profit ${scopeDay.profit > 0 ? 'positive' : scopeDay.profit < 0 ? 'negative' : 'neutral'}">${formatMoney(scopeDay.profit)}</div>
        </div>
        <div class="record-tags">${badgeHtml.join('')}</div>
        <div class="record-meta">${escapeHtml(symbols.join('、') || '暂无标的')}</div>
        <div class="record-meta">分红 ${formatMoney(scopeDay.dividend)}${scopeDay.financingCost > 0 ? ` · 融资成本 ${formatMoney(scopeDay.financingCost, { signed: false })}` : ''} · 交易 ${scopeDay.tradeCount} 笔</div>
      </article>
    `;
  }).join('');

  $$('.record-card').forEach((card) => {
    card.addEventListener('click', () => {
      const target = DAYS.find((day) => day.date === card.dataset.date);
      if (target) openDaySheet('edit', target);
    });
  });
}

function renderAnalysisPage() {
  const summary = ANALYTICS.summaries[analysisScope];
  $('#analysisScopeCaption').textContent = `当前查看${getScopeLabel(analysisScope)}数据`;
  $('#analysisTotalProfit').textContent = formatMoney(summary.totalProfit, { signed: false });
  $('#analysisTotalProfit').className = `summary-value ${summary.totalProfit > 0 ? 'positive' : summary.totalProfit < 0 ? 'negative' : 'neutral'}`;
  $('#analysisWinDays').textContent = summary.winDays;
  $('#analysisLossDays').textContent = summary.lossDays;
  $('#analysisSymbolCount').textContent = summary.symbolCount;
  $('#analysisTradeCount').textContent = summary.tradeCount;
  $('#analysisBuyCount').textContent = summary.buyCount;
  $('#analysisSellCount').textContent = summary.sellCount;
  $('#analysisAvgTrades').textContent = summary.activeDays ? (summary.tradeCount / summary.activeDays).toFixed(1) : '0';
  $('#analysisFinancingCost').textContent = formatMoney(summary.financingCost, { signed: false });

  const positionsList = $('#positionsList');
  if (!summary.positions.length) {
    positionsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📦</div>
        <div class="empty-title">当前没有在仓标的</div>
      </div>
    `;
  } else {
    positionsList.innerHTML = summary.positions
      .sort((a, b) => (b.quantity * b.avgPrice) - (a.quantity * a.avgPrice))
      .map((position) => `
        <article class="position-card">
          <div class="position-head">
            <div>
              <div class="badge-row">
                <span class="${getAccountBadgeClass(position.assetType)}">${position.assetType === 'margin' ? '信用' : '现物'}</span>
                ${position.positionSide === 'short' ? '<span class="badge">空头</span>' : ''}
              </div>
              <div class="position-main">${escapeHtml(getStockDisplayName(position.symbol, position.name))}</div>
              <div class="position-sub">${escapeHtml(position.symbol)} · ${escapeHtml(marketLabelFromKey(position.market))}</div>
            </div>
            <div class="position-values">
              <strong>${formatMoney(position.quantity * position.avgPrice, { signed: false })}</strong>
              <span class="position-sub">${position.quantity} 股 · 均价 ${formatMoney(position.avgPrice, { signed: false })}</span>
            </div>
          </div>
        </article>
      `).join('');
  }

  const rankingList = $('#stockRankingList');
  if (!summary.ranking.length) {
    rankingList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🏅</div>
        <div class="empty-title">还没有已实现盈亏</div>
      </div>
    `;
  } else {
    rankingList.innerHTML = summary.ranking.slice(0, 20).map((item, index) => `
      <article class="rank-card">
        <div class="rank-head">
          <div>
            <div class="rank-main">#${index + 1} ${escapeHtml(getStockDisplayName(item.symbol, item.name))}</div>
            <div class="rank-sub">${escapeHtml(item.symbol)} · 买 ${item.buyCount} / 卖 ${item.sellCount}</div>
          </div>
          <div class="rank-values">
            <strong class="${item.profit > 0 ? 'positive' : item.profit < 0 ? 'negative' : 'neutral'}">${formatMoney(item.profit)}</strong>
            <span class="rank-sub">共 ${item.tradeCount} 笔</span>
          </div>
        </div>
      </article>
    `).join('');
  }

  updateScopeButtons('analysis', analysisScope);
  updateMonthlyChart();
}

function renderDividendPage() {
  const summary = ANALYTICS.summaries[dividendScope];
  $('#dividendScopeCaption').textContent = `当前查看${getScopeLabel(dividendScope)}数据`;

  const cashRule = SETTINGS.dividendRules.cash;
  const marginRule = SETTINGS.dividendRules.margin;
  $('#cashRatioDisplay').textContent = `${cashRule.numerator} / ${cashRule.denominator}`;
  $('#marginRatioDisplay').textContent = `${marginRule.numerator} / ${marginRule.denominator}`;
  $('#cashRatioMeta').textContent = `现物新交易会套用这个比例 · ${formatDateParts(cashRule.updatedAt || todayStr()).fullLabel}`;
  $('#marginRatioMeta').textContent = `信用新交易会套用这个比例 · ${formatDateParts(marginRule.updatedAt || todayStr()).fullLabel}`;

  $('#todayDividendAmount').textContent = formatMoney(summary.today.dividend, { signed: false });
  $('#todayDividendAmount').className = `summary-value ${summary.today.dividend > 0 ? 'positive' : summary.today.dividend < 0 ? 'negative' : 'neutral'}`;
  $('#todayDividendNote').textContent = summary.today.tradeCount
    ? `今日收益 ${formatMoney(summary.today.profit)}`
    : '今天暂无分红数据';

  $('#weekDividendAmount').textContent = formatMoney(summary.week.dividend, { signed: false });
  $('#weekDividendAmount').className = `summary-value ${summary.week.dividend > 0 ? 'positive' : summary.week.dividend < 0 ? 'negative' : 'neutral'}`;
  $('#weekDividendNote').textContent = summary.week.tradeCount
    ? `本周收益 ${formatMoney(summary.week.profit)}`
    : '本周暂无分红数据';

  $('#totalDividend').textContent = formatMoney(summary.totalDividend, { signed: false });
  $('#totalLossShare').textContent = formatMoney(summary.totalLossShare, { signed: false });
  $('#netDividend').textContent = formatMoney(summary.netDividend);
  $('#netDividend').className = summary.netDividend > 0 ? 'positive' : summary.netDividend < 0 ? 'negative' : 'neutral';

  const historyContainer = $('#dividendHistory');
  if (!summary.dividendHistory.length) {
    historyContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎀</div>
        <div class="empty-title">还没有分红历史</div>
      </div>
    `;
  } else {
    historyContainer.innerHTML = summary.dividendHistory.map((item) => `
      <article class="history-card">
        <div class="history-head">
          <div>
            <div class="trade-title">${escapeHtml(formatDateParts(item.date).fullLabel)}</div>
            <div class="trade-subline">当日收益 ${formatMoney(item.profit)}</div>
          </div>
          <div class="dividend-amount ${item.dividend > 0 ? 'positive' : item.dividend < 0 ? 'negative' : 'neutral'}">${formatMoney(item.dividend)}</div>
        </div>
        ${dividendScope === 'all' ? `
          <div class="meta-chips">
            <span class="chip">现物 ${formatMoney(item.cashDividend)}</span>
            <span class="chip">信用 ${formatMoney(item.marginDividend)}</span>
          </div>
        ` : ''}
      </article>
    `).join('');
  }

  updateScopeButtons('dividend', dividendScope);
}

function updateCsvStatus() {
  const summary = SETTINGS.lastCsvImportSummary;
  const label = SETTINGS.lastCsvImportAt
    ? `最近 CSV 导入：${formatDateParts(SETTINGS.lastCsvImportAt).fullLabel}`
    : '还没有导入 CSV';

  $('#csvImportStatus').textContent = label;
  $('#csvSettingsHint').textContent = summary
    ? `最近一次共读取 ${summary.totalRows} 行，导入 ${summary.importedRows} 行，忽略投信 ${summary.skippedInvestmentTrust} 行。`
    : '支持券商约定履历 CSV；只导入株式現物和信用数据。';
}

function updateJsonbinSyncStatus(text) {
  const label = text || '从未同步';
  $('#jsonbinSyncStatus').textContent = label;
  $('#syncMiniStatus').textContent = label;
}

function initJsonbinSyncStatus() {
  try {
    const raw = localStorage.getItem('jsonbin_last_sync');
    if (!raw) {
      updateJsonbinSyncStatus('云端尚未同步');
      return;
    }

    const data = JSON.parse(raw);
    const direction = data.dir === 'push' ? '上传' : '拉取';
    updateJsonbinSyncStatus(`最近同步：${data.at}（${direction}）`);
  } catch {
    updateJsonbinSyncStatus('云端尚未同步');
  }
}

function refreshVisiblePages() {
  updateMonthFilter();
  renderDashboardSummary();
  renderRecords();
  renderAnalysisPage();
  renderDividendPage();
  updateMainChart();
  updateCsvStatus();
  initJsonbinSyncStatus();
}

// ===== Day Sheet =====
function getDaySheetRenderableTrades() {
  return editingTrades;
}

function applyManualType(index, manualType) {
  const current = editingTrades[index];
  if (!current) return;
  const config = MANUAL_TYPE_MAP[manualType];
  const nextAssetType = config.assetType;

  editingTrades[index] = normalizeTrade({
    ...current,
    manualType,
    assetType: config.assetType,
    action: config.action,
    positionEffect: config.positionEffect,
    positionSide: config.positionSide,
    tradeTypeLabel: config.tradeTypeLabel,
    ratioSnapshot: cloneActiveRuleSnapshot(nextAssetType),
    updatedAt: new Date().toISOString()
  }, $('#fDate').value || editingDay?.date || todayStr(), index);

  renderDaySheetTrades();
}

function renderDaySheetTrades() {
  const container = $('#tradeEditorList');
  const date = $('#fDate').value || editingDay?.date || todayStr();
  const trades = getDaySheetRenderableTrades();

  container.innerHTML = trades.map((trade, index) => {
    const displayName = getStockDisplayName(trade.symbol, trade.name);
    const gross = (Number(trade.quantity) || 0) * (Number(trade.price) || 0);
    const rule = normalizeRuleSnapshot(trade.ratioSnapshot, trade.assetType);

    if (trade.fingerprint) {
      return `
        <article class="trade-display-card locked" data-index="${index}">
          <div class="editor-card-top">
            <div>
              <h3 class="trade-title">${escapeHtml(displayName || 'CSV 交易')}</h3>
              <p class="trade-subtitle">${escapeHtml(trade.symbol || '')} · ${escapeHtml(trade.tradeTypeLabel)}</p>
            </div>
            <div class="badge-row">
              <span class="${getAccountBadgeClass(trade.assetType)}">${trade.assetType === 'margin' ? '信用' : '现物'}</span>
              <span class="badge badge-imported">CSV</span>
            </div>
          </div>
          <div class="trade-meta">
            <span class="chip">${escapeHtml(marketLabelFromKey(trade.market))}</span>
            <span class="chip">${escapeHtml(trade.custody || '--')}</span>
            <span class="chip">${escapeHtml(trade.taxCategory || '--')}</span>
            ${trade.settlementDate ? `<span class="chip">受渡 ${escapeHtml(trade.settlementDate)}</span>` : ''}
          </div>
          <div class="trade-readout">
            <span class="meta-label">${trade.positionSide === 'short' ? '参考建仓金额' : '成交金额'}</span>
            <strong>${formatMoney(gross, { signed: false })}</strong>
            <span class="trade-subline">数量 ${Number(trade.quantity) || 0} 股 · 单价 ${formatMoney(trade.price, { signed: false })} · 快照比例 ${rule.numerator} / ${rule.denominator}</span>
          </div>
        </article>
      `;
    }

    const typeOptions = getManualTypeOptions(trade.assetType);
    return `
      <article class="trade-editor-card" data-index="${index}">
        <div class="editor-card-top">
          <div>
            <h3 class="trade-title">${escapeHtml(displayName || '新交易')}</h3>
            <p class="trade-subtitle">${escapeHtml(trade.symbol || '输入代码后会自动匹配日股名称')}</p>
          </div>
          <button type="button" class="remove-trade-btn" data-action="remove-trade" data-index="${index}">×</button>
        </div>

        <div class="editor-row two">
          <label class="field-group">
            <span class="form-label">股票代码</span>
            <input type="text" class="form-input" data-field="symbol" data-index="${index}" value="${escapeHtml(trade.symbol || '')}" placeholder="例如 8306" inputmode="text" />
          </label>
          <label class="field-group">
            <span class="form-label">名称</span>
            <input type="text" class="form-input" data-field="name" data-index="${index}" value="${escapeHtml(trade.name || '')}" placeholder="可手动补充名称" />
          </label>
        </div>

        <div class="editor-row">
          <span class="form-label">账户类型</span>
          <div class="editor-segment">
            <button type="button" class="editor-chip ${trade.assetType === 'cash' ? 'active' : ''}" data-action="asset-type" data-index="${index}" data-value="cash">现物</button>
            <button type="button" class="editor-chip ${trade.assetType === 'margin' ? 'active' : ''}" data-action="asset-type" data-index="${index}" data-value="margin">信用</button>
          </div>
        </div>

        <div class="editor-row">
          <span class="form-label">交易类型</span>
          <div class="editor-segment">
            ${typeOptions.map((optionKey) => {
              const option = MANUAL_TYPE_MAP[optionKey];
              return `
                <button
                  type="button"
                  class="editor-chip ${trade.manualType === optionKey ? 'active' : ''}"
                  data-action="manual-type"
                  data-index="${index}"
                  data-value="${optionKey}"
                >${escapeHtml(option.label)}</button>
              `;
            }).join('')}
          </div>
        </div>

        <div class="editor-row">
          <span class="form-label">市场</span>
          <div class="editor-segment">
            <button type="button" class="editor-chip ${trade.market === 'tse' ? 'active' : ''}" data-action="market" data-index="${index}" data-value="tse">东证</button>
            <button type="button" class="editor-chip ${trade.market === 'pts' ? 'active' : ''}" data-action="market" data-index="${index}" data-value="pts">PTS</button>
            <button type="button" class="editor-chip ${trade.market === 'other' ? 'active' : ''}" data-action="market" data-index="${index}" data-value="other">其他</button>
          </div>
        </div>

        <div class="editor-row two">
          <label class="field-group">
            <span class="form-label">数量</span>
            <input type="number" class="form-input" data-field="quantity" data-index="${index}" value="${trade.quantity ?? ''}" min="1" step="1" inputmode="numeric" placeholder="100" />
          </label>
          <label class="field-group">
            <span class="form-label">单价</span>
            <input type="number" class="form-input" data-field="price" data-index="${index}" value="${trade.price ?? ''}" min="0" step="0.01" inputmode="decimal" placeholder="1234.5" />
          </label>
        </div>

        <div class="trade-readout">
          <span class="meta-label">估算成交金额</span>
          <strong>${formatMoney(gross, { signed: false })}</strong>
          <span class="trade-subline">${trade.assetType === 'margin' ? '信用' : '现物'}快照比例 ${rule.numerator} / ${rule.denominator}</span>
        </div>

        <details class="trade-advanced">
          <summary>更多字段</summary>
          <div class="trade-advanced-body">
            <div class="editor-row two">
              <label class="field-group">
                <span class="form-label">期限</span>
                <input type="text" class="form-input" data-field="term" data-index="${index}" value="${escapeHtml(trade.term || '')}" placeholder="-- / 6ヶ月" />
              </label>
              <label class="field-group">
                <span class="form-label">预り</span>
                <input type="text" class="form-input" data-field="custody" data-index="${index}" value="${escapeHtml(trade.custody || '')}" placeholder="特定 / NISA(成)" />
              </label>
            </div>
            <div class="editor-row two">
              <label class="field-group">
                <span class="form-label">课税</span>
                <input type="text" class="form-input" data-field="taxCategory" data-index="${index}" value="${escapeHtml(trade.taxCategory || '')}" placeholder="-- / 非課税" />
              </label>
              <label class="field-group">
                <span class="form-label">受渡日</span>
                <input type="date" class="form-input" data-field="settlementDate" data-index="${index}" value="${escapeHtml(trade.settlementDate || '')}" />
              </label>
            </div>
            <div class="editor-row two">
              <label class="field-group">
                <span class="form-label">手续费</span>
                <input type="number" class="form-input" data-field="fee" data-index="${index}" value="${trade.fee ?? ''}" min="0" step="0.01" inputmode="decimal" />
              </label>
              <label class="field-group">
                <span class="form-label">税额</span>
                <input type="number" class="form-input" data-field="taxAmount" data-index="${index}" value="${trade.taxAmount ?? ''}" min="0" step="0.01" inputmode="decimal" />
              </label>
            </div>
            <label class="field-group">
              <span class="form-label">受渡金额 / 决済损益</span>
              <input type="number" class="form-input" data-field="settlementAmount" data-index="${index}" value="${trade.settlementAmount ?? ''}" step="0.01" inputmode="decimal" placeholder="可留空让系统按数量×单价估算" />
            </label>
            <label class="field-group">
              <span class="form-label">备注</span>
              <textarea class="form-input" data-field="notes" data-index="${index}" rows="3" placeholder="可选备注">${escapeHtml(trade.notes || '')}</textarea>
            </label>
          </div>
        </details>
      </article>
    `;
  }).join('');

  updateDaySheetHint();
  updateDaySheetSummary();
}

function updateDaySheetHint() {
  const date = $('#fDate').value || todayStr();
  const existing = DAYS.find((day) => day.date === date);
  const total = editingTrades.length;

  if (editingMode === 'edit' && editingDay?.date === date) {
    $('#dayExistingHint').textContent = `当前日期共 ${total} 笔记录，其中 CSV ${editingTrades.filter((trade) => trade.fingerprint).length} 笔。`;
    return;
  }

  if (existing) {
    $('#dayExistingHint').textContent = `该日期已有 ${existing.trades.length} 笔记录；保存时会把新手动交易合并进去。`;
  } else {
    $('#dayExistingHint').textContent = '保存后会作为新的交易日写入。';
  }
}

function updateDaySheetSummary() {
  const date = $('#fDate').value || todayStr();
  const validDrafts = editingTrades.filter((trade) => trade.fingerprint || isTradeComplete(trade));
  const otherDays = DAYS.filter((day) => !(editingMode === 'edit' && editingDay && day.id === editingDay.id) && day.date !== date);
  const existingForDate = editingMode === 'edit' && editingDay?.date === date
    ? null
    : DAYS.find((day) => day.date === date);

  const previewTrades = existingForDate
    ? [...normalizeDay(existingForDate).trades, ...validDrafts.map((trade, index) => normalizeTrade(trade, date, index + existingForDate.trades.length))]
    : validDrafts.map((trade, index) => normalizeTrade(trade, date, index));

  const previewDays = [
    ...otherDays.map(normalizeDay),
    { id: 'preview', date, trades: reindexTrades(previewTrades, date), updatedAt: new Date().toISOString() }
  ];

  const preview = buildAnalytics(previewDays);
  const previewDay = preview.daysDesc.find((day) => day.date === date);
  const profit = previewDay ? previewDay.scopes.all.profit : 0;
  const financingCost = previewDay ? previewDay.scopes.all.financingCost : 0;
  const className = profit > 0 ? 'positive' : profit < 0 ? 'negative' : 'neutral';
  const summaryEl = $('#daySheetSummary');
  summaryEl.textContent = financingCost > 0
    ? `当日已实现损益：${formatMoney(profit)}（已扣融资成本 ${formatMoney(financingCost, { signed: false })}）`
    : `当日已实现损益：${formatMoney(profit)}`;
  summaryEl.className = `day-sheet-summary ${className}`;
}

function openDaySheet(mode, day = null) {
  editingMode = mode;
  editingDay = day ? normalizeDay(day) : null;

  if (mode === 'edit' && editingDay) {
    editingTrades = editingDay.trades.map((trade) => deepClone(trade));
    $('#daySheetTitle').textContent = '查看 / 追加手动交易';
    $('#daySheetSubtitle').textContent = 'CSV 导入的交易会锁定显示，手动交易可以继续追加。';
    $('#btnDeleteDay').hidden = false;
    $('#fDate').value = editingDay.date;
    $('#fDate').disabled = true;
  } else {
    editingTrades = [createManualTrade({ order: 0 })];
    $('#daySheetTitle').textContent = '手动录入';
    $('#daySheetSubtitle').textContent = '录入时会自动套用当前对应账户的分红比例。';
    $('#btnDeleteDay').hidden = true;
    $('#fDate').value = todayStr();
    $('#fDate').disabled = false;
  }

  $('#daySheet').setAttribute('aria-hidden', 'false');
  renderDaySheetTrades();
}

function closeDaySheet() {
  $('#daySheet').setAttribute('aria-hidden', 'true');
  editingDay = null;
  editingTrades = [];
  editingMode = 'add';
}

function addManualTradeToSheet() {
  editingTrades.push(createManualTrade({ order: editingTrades.length, date: $('#fDate').value || todayStr() }));
  renderDaySheetTrades();
}

function updateEditingTradeField(index, field, value) {
  const trade = editingTrades[index];
  if (!trade) return;

  const next = { ...trade, [field]: value, updatedAt: new Date().toISOString() };
  if (field === 'symbol') {
    const companyName = getCompanyName(value);
    if (companyName && (!trimText(next.name) || trimText(next.name) === trimText(trade.name))) {
      next.name = companyName;
    }
  }

  if (field === 'market') {
    next.marketLabel = marketLabelFromKey(value);
  }

  editingTrades[index] = normalizeTrade(next, $('#fDate').value || todayStr(), index);
  renderDaySheetTrades();
}

async function saveDaySheet(event) {
  event.preventDefault();
  const date = normalizeAnyDate($('#fDate').value);
  if (!date) {
    alert('请选择日期');
    return;
  }

  const normalizedTrades = editingTrades
    .filter((trade) => trade.fingerprint || isTradeComplete(trade))
    .map((trade, index) => normalizeTrade({
      ...trade,
      updatedAt: new Date().toISOString()
    }, date, index));

  if (!normalizedTrades.length) {
    alert('至少保留一笔有效交易再保存。');
    return;
  }

  const now = new Date().toISOString();

  if (editingMode === 'edit' && editingDay) {
    const nextDay = normalizeDay({
      ...editingDay,
      trades: reindexTrades(normalizedTrades, date),
      updatedAt: now
    });
    await saveDay(nextDay);
  } else {
    const existing = await getDayByDate(date);
    if (existing) {
      const mergedTrades = [
        ...normalizeDay(existing).trades,
        ...normalizedTrades.filter((trade) => !trade.fingerprint)
      ];
      const nextDay = normalizeDay({
        ...existing,
        trades: reindexTrades(mergedTrades, date),
        updatedAt: now
      });
      await saveDay(nextDay);
    } else {
      const nextDay = normalizeDay({
        id: generateId(),
        date,
        trades: reindexTrades(normalizedTrades, date),
        updatedAt: now
      });
      await saveDay(nextDay);
    }
  }

  closeDaySheet();
  await refresh();
}

// ===== Ratio Editor =====
function openRatioEditor(target) {
  const label = target === 'margin' ? '信用' : '现物';
  const rule = SETTINGS.dividendRules[target];
  ratioEditTarget = target;
  $('#ratioEditorTitle').textContent = `修改${label}分红比例`;
  $('#ratioEditorHint').textContent = '保存后仅影响后续新增交易，历史分红不会重算。';
  $('#ratioNumeratorInput').value = rule.numerator;
  $('#ratioDenominatorInput').value = rule.denominator;
  $('#ratioEditor').hidden = false;
}

function closeRatioEditor() {
  ratioEditTarget = '';
  $('#ratioEditor').hidden = true;
}

function saveRatioEditor() {
  if (!ratioEditTarget) return;

  const numerator = Math.max(1, parseInt($('#ratioNumeratorInput').value, 10) || 1);
  const denominator = Math.max(1, parseInt($('#ratioDenominatorInput').value, 10) || 1);
  const now = new Date().toISOString();

  SETTINGS.dividendRules[ratioEditTarget] = createDividendRule(ratioEditTarget, numerator, denominator, now);
  persistSettings();
  closeRatioEditor();
  renderDividendPage();
}

// ===== Settings Sheet =====
function openSettings() {
  $('#settingsSheet').setAttribute('aria-hidden', 'false');
  $('#jsonbinApiKey').value = jsonbinApiKey;
  $('#jsonbinBinId').value = jsonbinBinId;
  updateCsvStatus();
  initJsonbinSyncStatus();
}

function closeSettings() {
  $('#settingsSheet').setAttribute('aria-hidden', 'true');
}

// ===== Pages =====
function openAnalysisPage() {
  $('#mainPage').hidden = true;
  $('#analysisPage').hidden = false;
  renderAnalysisPage();
}

function closeAnalysisPage() {
  $('#analysisPage').hidden = true;
  $('#mainPage').hidden = false;
}

function openDividendPage() {
  $('#mainPage').hidden = true;
  $('#dividendPage').hidden = false;
  renderDividendPage();
}

function closeDividendPage() {
  $('#dividendPage').hidden = true;
  $('#mainPage').hidden = false;
}

// ===== JSONBin Sync =====
function jsonbinXhr(method, url, body, headers) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.setRequestHeader('Content-Type', 'application/json');
    Object.keys(headers || {}).forEach((key) => xhr.setRequestHeader(key, headers[key]));

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const text = xhr.responseText || '';
        if (!text.trim()) return resolve(null);
        try {
          resolve(JSON.parse(text));
        } catch (error) {
          reject(new Error(`响应解析失败：${error.message || error}`));
        }
        return;
      }

      try {
        const parsed = JSON.parse(xhr.responseText || '{}');
        reject(new Error(parsed.message || `请求失败 (${xhr.status})`));
      } catch {
        reject(new Error(`请求失败 (${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error('网络请求失败，请检查网络。'));
    xhr.ontimeout = () => reject(new Error('请求超时。'));
    xhr.timeout = 30000;
    xhr.send(body == null ? null : body);
  });
}

function getCloudPayload() {
  return {
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: SETTINGS,
    days: DAYS
  };
}

function mergeSettings(localSettings, remoteSettings) {
  if (!remoteSettings) return localSettings;
  const local = normalizeSettings(localSettings);
  const remote = normalizeSettings(remoteSettings);
  const localTime = new Date(local.updatedAt || 0).getTime();
  const remoteTime = new Date(remote.updatedAt || 0).getTime();
  return remoteTime >= localTime ? remote : local;
}

function mergeTradeLists(date, localTrades, remoteTrades) {
  const merged = [];
  const keyMap = new Map();

  const registerTrade = (trade) => {
    const normalized = normalizeTrade(trade, date, merged.length);
    const keys = getTradeIdentityKeys(date, normalized);
    const matchedIndex = keys.map((key) => keyMap.get(key)).find((value) => value != null);

    if (matchedIndex == null) {
      const index = merged.push(normalized) - 1;
      keys.forEach((key) => keyMap.set(key, index));
      return;
    }

    const next = mergeTradeVersions(merged[matchedIndex], normalized, date);
    merged[matchedIndex] = next;
    getTradeIdentityKeys(date, next).forEach((key) => keyMap.set(key, matchedIndex));
  };

  localTrades.forEach(registerTrade);
  remoteTrades.forEach(registerTrade);

  return reindexTrades(merged.sort(compareTradeOrder), date);
}

function mergeDays(localDays, cloudDays) {
  const byDate = new Map();
  const localMap = new Map(localDays.map((day) => [normalizeDay(day).date, normalizeDay(day)]));
  const cloudMap = new Map(cloudDays.map((day) => [normalizeDay(day).date, normalizeDay(day)]));
  const allDates = new Set([...localMap.keys(), ...cloudMap.keys()]);

  allDates.forEach((date) => {
    const local = localMap.get(date);
    const remote = cloudMap.get(date);

    if (!local) {
      byDate.set(date, normalizeDay(remote));
      return;
    }

    if (!remote) {
      byDate.set(date, normalizeDay(local));
      return;
    }

    const mergedTrades = mergeTradeLists(date, local.trades, remote.trades);
    const mergedDay = normalizeDay({
      id: local.id || remote.id || generateId(),
      date,
      trades: mergedTrades,
      updatedAt: new Date(Math.max(
        new Date(local.updatedAt || 0).getTime(),
        new Date(remote.updatedAt || 0).getTime()
      )).toISOString()
    });

    byDate.set(date, mergedDay);
  });

  return Array.from(byDate.values()).sort(compareByDateAsc);
}

async function pushToJsonBin() {
  const apiKey = trimText($('#jsonbinApiKey').value || jsonbinApiKey);
  const binId = trimText($('#jsonbinBinId').value || jsonbinBinId);

  if (!apiKey) {
    alert('请先填写 JSONBin API Key。');
    return;
  }

  if (isJsonbinSyncing) return;
  isJsonbinSyncing = true;
  updateJsonbinSyncStatus('正在上传到云端…');
  $('#btnJsonbinPush').disabled = true;
  $('#btnJsonbinPull').disabled = true;

  try {
    const body = JSON.stringify(getCloudPayload());
    if (binId) {
      await jsonbinXhr('PUT', `${JSONBIN_BASE}/${binId}`, body, { 'X-Master-Key': apiKey });
    } else {
      const data = await jsonbinXhr('POST', JSONBIN_BASE, body, {
        'X-Master-Key': apiKey,
        'X-Bin-Name': 'CookieWorkshop-TradeSync'
      });
      const createdId = String(data?.metadata?.id || data?.id || '');
      if (createdId) {
        jsonbinBinId = createdId;
        localStorage.setItem('jsonbin_bin_id', createdId);
        $('#jsonbinBinId').value = createdId;
      }
    }

    jsonbinApiKey = apiKey;
    localStorage.setItem('jsonbin_api_key', apiKey);
    const at = new Date().toLocaleString('zh-CN');
    localStorage.setItem('jsonbin_last_sync', JSON.stringify({ at, dir: 'push' }));
    initJsonbinSyncStatus();
    alert('已上传到云端。下一次上传会用本地数据整体覆盖云端。');
  } catch (error) {
    updateJsonbinSyncStatus('');
    alert(`上传失败：${error.message || error}`);
  } finally {
    isJsonbinSyncing = false;
    $('#btnJsonbinPush').disabled = false;
    $('#btnJsonbinPull').disabled = false;
  }
}

async function pullFromJsonBin() {
  const apiKey = trimText($('#jsonbinApiKey').value || jsonbinApiKey);
  const binId = trimText($('#jsonbinBinId').value || jsonbinBinId);

  if (!apiKey) {
    alert('请先填写 JSONBin API Key。');
    return;
  }
  if (!binId) {
    alert('请先填写 Bin ID。');
    return;
  }

  if (isJsonbinSyncing) return;
  isJsonbinSyncing = true;
  updateJsonbinSyncStatus('正在从云端拉取…');
  $('#btnJsonbinPush').disabled = true;
  $('#btnJsonbinPull').disabled = true;

  try {
    const data = await jsonbinXhr('GET', `${JSONBIN_BASE}/${binId}?meta=false`, null, { 'X-Master-Key': apiKey });
    const cloudDays = Array.isArray(data?.days) ? data.days : [];
    const mergedDays = mergeDays(DAYS, cloudDays);
    SETTINGS = mergeSettings(SETTINGS, data?.settings);
    persistSettings();
    await replaceAllDays(mergedDays);

    jsonbinApiKey = apiKey;
    jsonbinBinId = binId;
    localStorage.setItem('jsonbin_api_key', apiKey);
    localStorage.setItem('jsonbin_bin_id', binId);

    const at = new Date().toLocaleString('zh-CN');
    localStorage.setItem('jsonbin_last_sync', JSON.stringify({ at, dir: 'pull' }));
    await refresh();
    alert('已从云端拉取并合并。');
  } catch (error) {
    updateJsonbinSyncStatus('');
    alert(`拉取失败：${error.message || error}`);
  } finally {
    isJsonbinSyncing = false;
    $('#btnJsonbinPush').disabled = false;
    $('#btnJsonbinPull').disabled = false;
  }
}

// ===== Refresh =====
async function refresh() {
  DAYS = (await getAllDays()).map(normalizeDay).sort((a, b) => b.date.localeCompare(a.date));
  ANALYTICS = buildAnalytics(DAYS);
  refreshVisiblePages();
}

// ===== Event Bindings =====
function bindEvents() {
  $('#btnSettings').addEventListener('click', openSettings);
  $('#btnCloseSettings').addEventListener('click', closeSettings);
  $('#settingsBackdrop').addEventListener('click', closeSettings);

  $('#btnAnalysis').addEventListener('click', openAnalysisPage);
  $('#btnBackFromAnalysis').addEventListener('click', closeAnalysisPage);

  $('#btnDividend').addEventListener('click', openDividendPage);
  $('#btnBackFromDividend').addEventListener('click', closeDividendPage);

  $('#btnUploadCsv').addEventListener('click', () => $('#csvFileInput').click());
  $('#btnUploadCsvFromSettings').addEventListener('click', () => $('#csvFileInput').click());
  $('#csvFileInput').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const summary = await importCsvFile(file);
      closeSettings();
      alert(`CSV 导入完成：导入 ${summary.importedRows} 行，忽略投信 ${summary.skippedInvestmentTrust} 行。`);
    } catch (error) {
      alert(`CSV 导入失败：${error.message || error}`);
    } finally {
      event.target.value = '';
    }
  });

  $$('.scope-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const scope = button.dataset.scope;
      const owner = button.dataset.owner;
      if (!SCOPES.includes(scope)) return;

      if (owner === 'dashboard') {
        dashboardScope = scope;
        renderDashboardSummary();
        renderRecords();
        updateMainChart();
      } else if (owner === 'analysis') {
        analysisScope = scope;
        renderAnalysisPage();
      } else if (owner === 'dividend') {
        dividendScope = scope;
        renderDividendPage();
      }
    });
  });

  $$('#chartRangeToggle .mini-btn').forEach((button) => {
    button.addEventListener('click', () => {
      chartRange = button.dataset.range || 'week';
      updateChartButtons();
      updateMainChart();
    });
  });
  $$('#chartTypeToggle .mini-btn').forEach((button) => {
    button.addEventListener('click', () => {
      chartType = button.dataset.type || 'cumulative';
      updateChartButtons();
      updateMainChart();
    });
  });

  $('#monthFilter').addEventListener('change', (event) => {
    currentMonthFilter = event.target.value;
    renderRecords();
  });

  $('#btnAddDay').addEventListener('click', () => openDaySheet('add'));
  $('#btnCloseDaySheet').addEventListener('click', closeDaySheet);
  $('#btnCancelDaySheet').addEventListener('click', closeDaySheet);
  $('#daySheetBackdrop').addEventListener('click', closeDaySheet);
  $('#btnAddManualTrade').addEventListener('click', addManualTradeToSheet);
  $('#fDate').addEventListener('change', () => {
    renderDaySheetTrades();
  });
  $('#dayForm').addEventListener('submit', saveDaySheet);

  $('#btnDeleteDay').addEventListener('click', async () => {
    if (!editingDay) return;
    if (!confirm('确定要删除这一天的全部记录吗？')) return;

    await deleteDay(editingDay.id);
    closeDaySheet();
    await refresh();
  });

  $('#tradeEditorList').addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;

    const index = Number(target.dataset.index);
    const action = target.dataset.action;
    const value = target.dataset.value;

    if (action === 'remove-trade') {
      editingTrades.splice(index, 1);
      if (!editingTrades.length) editingTrades.push(createManualTrade({ order: 0, date: $('#fDate').value || todayStr() }));
      renderDaySheetTrades();
      return;
    }

    if (action === 'asset-type') {
      const fallbackType = value === 'margin' ? 'margin_open_long' : 'spot_buy';
      applyManualType(index, fallbackType);
      return;
    }

    if (action === 'manual-type') {
      applyManualType(index, value);
      return;
    }

    if (action === 'market') {
      updateEditingTradeField(index, 'market', value);
    }
  });

  $('#tradeEditorList').addEventListener('input', (event) => {
    const target = event.target;
    const index = Number(target.dataset.index);
    const field = target.dataset.field;
    if (!field || Number.isNaN(index)) return;
    updateEditingTradeField(index, field, target.value);
  });

  $$('#btnEditCashRatio, #btnEditMarginRatio').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.ratioTarget;
      if (!confirm('注意！修改前分红将不受新比例影响！')) return;
      openRatioEditor(target);
    });
  });
  $('#btnCancelRatioEdit').addEventListener('click', closeRatioEditor);
  $('#btnSaveRatioEdit').addEventListener('click', saveRatioEditor);

  $('#jsonbinApiKey').addEventListener('input', (event) => {
    jsonbinApiKey = trimText(event.target.value);
    localStorage.setItem('jsonbin_api_key', jsonbinApiKey);
  });
  $('#jsonbinBinId').addEventListener('input', (event) => {
    jsonbinBinId = trimText(event.target.value);
    localStorage.setItem('jsonbin_bin_id', jsonbinBinId);
  });
  $('#btnJsonbinPush').addEventListener('click', pushToJsonBin);
  $('#btnJsonbinPull').addEventListener('click', pullFromJsonBin);

  $('#btnClearAll').addEventListener('click', async () => {
    if (!confirm('确定要清空所有本地交易数据吗？这一步不可撤销。')) return;
    await clearAllDays();
    SETTINGS = createDefaultSettings();
    persistSettings();
    localStorage.removeItem('jsonbin_last_sync');
    closeSettings();
    await refresh();
  });
}

// ===== Initialize =====
async function init() {
  await migrateLegacyDatabaseIfNeeded();
  await loadCompanyData();
  createMainChart();
  bindEvents();
  $('#jsonbinApiKey').value = jsonbinApiKey;
  $('#jsonbinBinId').value = jsonbinBinId;
  updateChartButtons();
  await refresh();
}

init();
