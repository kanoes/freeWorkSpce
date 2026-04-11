import { APP_VERSION } from './constants.js';
import { buildAnalytics } from './analytics.js';
import { rebuildDaysFromCsvFiles } from './csv.js';
import {
  clearCloudTradeData as clearRemoteCloudData,
  consumePendingPostLoginSync,
  fetchCloudSnapshot,
  getFirebaseState,
  initCloudSyncStatus,
  markLocalClearComplete,
  markMergeSyncComplete,
  parseFirebaseConfigInput,
  restoreFirebaseSession,
  saveFirebaseConfig as saveCloudConfig,
  setCloudSyncing,
  signInWithGoogle as signInCloud,
  signOutFromFirebase as signOutCloud,
  updateCloudSyncStatus,
  writeCloudSnapshot
} from './firebase-sync.js';
import {
  createManualTrade,
  isTradeComplete,
  mergeDays,
  normalizeDay,
  normalizeTrade,
  reindexTrades
} from './models.js';
import {
  cloneActiveRuleSnapshot,
  createDefaultSettings,
  loadSettings,
  mergeSettings,
  persistSettings
} from './settings.js';
import {
  clearAllDays,
  deleteDay,
  getAllDays,
  getDayByDate,
  replaceAllDays,
  saveDay
} from './storage.js';
import { deepClone, normalizeAnyDate, todayStr, trimText } from './utils.js';

let settings = loadSettings();
let days = [];
let analytics = buildAnalytics([]);

async function refreshState() {
  days = (await getAllDays()).map((day) => normalizeDay(day, settings)).sort((left, right) => right.date.localeCompare(left.date));
  analytics = buildAnalytics(days);
}

export function getTradeAppSnapshot() {
  return {
    version: APP_VERSION,
    settings: deepClone(settings),
    days: deepClone(days),
    analytics: deepClone(analytics),
    firebase: getFirebaseState()
  };
}

export async function initializeTradeCore() {
  settings = loadSettings();
  await refreshState();
  await restoreFirebaseSession();

  if (consumePendingPostLoginSync() && getFirebaseState().isSignedIn) {
    try {
      await syncWithCloud({ silent: true });
    } catch {}
  }

  initCloudSyncStatus();
  return getTradeAppSnapshot();
}

export function parseFirebaseConfigPreview(rawText) {
  if (!trimText(rawText)) return null;
  try {
    const config = parseFirebaseConfigInput(rawText);
    return {
      projectId: config.projectId || '',
      authDomain: config.authDomain || '',
      appId: config.appId || ''
    };
  } catch {
    return null;
  }
}

export async function importCsvFile(file) {
  return importCsvFiles([file]);
}

export async function importCsvFiles(files) {
  const result = await rebuildDaysFromCsvFiles(files, days, settings);
  await replaceAllDays(result.days.map((day) => normalizeDay(day, settings)));

  settings = persistSettings({
    ...settings,
    lastCsvImportAt: new Date().toISOString(),
    lastCsvImportSummary: result.summary
  });

  await refreshState();
  return {
    summary: result.summary,
    snapshot: getTradeAppSnapshot()
  };
}

export function createDraftTrade(preset = {}) {
  return createManualTrade(settings, preset);
}

export async function upsertManualDay({ date, trades, dayId = '' }) {
  const normalizedDate = normalizeAnyDate(date);
  if (!normalizedDate) {
    throw new Error('请选择有效日期。');
  }

  const normalizedTrades = (Array.isArray(trades) ? trades : [])
    .filter((trade) => trade?.fingerprint || isTradeComplete(trade))
    .map((trade, index) => normalizeTrade({
      ...trade,
      updatedAt: new Date().toISOString()
    }, normalizedDate, index, settings));

  if (!normalizedTrades.length) {
    throw new Error('至少保留一笔有效交易再保存。');
  }

  const now = new Date().toISOString();
  if (trimText(dayId)) {
    const current = days.find((day) => day.id === dayId)
      || await getDayByDate(normalizedDate)
      || { id: dayId, date: normalizedDate, trades: [] };

    const nextDay = normalizeDay({
      ...current,
      date: normalizedDate,
      trades: reindexTrades(normalizedTrades, normalizedDate, settings),
      updatedAt: now
    }, settings);

    await saveDay(nextDay);
  } else {
    const existing = await getDayByDate(normalizedDate);
    if (existing) {
      const mergedTrades = [
        ...normalizeDay(existing, settings).trades,
        ...normalizedTrades.filter((trade) => !trade.fingerprint)
      ];

      await saveDay(normalizeDay({
        ...existing,
        trades: reindexTrades(mergedTrades, normalizedDate, settings),
        updatedAt: now
      }, settings));
    } else {
      await saveDay(normalizeDay({
        id: crypto.randomUUID(),
        date: normalizedDate,
        trades: reindexTrades(normalizedTrades, normalizedDate, settings),
        updatedAt: now
      }, settings));
    }
  }

  await refreshState();
  return getTradeAppSnapshot();
}

export async function removeDayById(dayId) {
  await deleteDay(dayId);
  await refreshState();
  return getTradeAppSnapshot();
}

export function updateDividendRule(assetType, numerator, denominator) {
  const target = assetType === 'margin' ? 'margin' : 'cash';
  const nextRule = {
    id: `${target}-${new Date().toISOString()}`,
    numerator: Math.max(1, parseInt(numerator, 10) || 1),
    denominator: Math.max(1, parseInt(denominator, 10) || 1),
    updatedAt: new Date().toISOString()
  };

  settings = persistSettings({
    ...settings,
    dividendRules: {
      ...settings.dividendRules,
      [target]: nextRule
    }
  });

  return getTradeAppSnapshot();
}

export async function saveFirebaseConfig(rawText) {
  await saveCloudConfig(rawText);
  await restoreFirebaseSession();
  return getTradeAppSnapshot();
}

export async function signInWithGoogle(rawText) {
  const result = await signInCloud(rawText);
  if (result.redirected) {
    return getTradeAppSnapshot();
  }

  return syncWithCloud({ silent: false });
}

export async function signOutFromFirebase() {
  await signOutCloud();
  await restoreFirebaseSession();
  return getTradeAppSnapshot();
}

export async function syncWithCloud(options = {}) {
  const { silent = false } = options;
  if (getFirebaseState().isSyncing) return getTradeAppSnapshot();

  setCloudSyncing(true, '正在安全合并云端数据…');

  try {
    const remoteSnapshot = await fetchCloudSnapshot();
    const mergedSettings = mergeSettings(settings, remoteSnapshot.settings);
    const mergedDays = mergeDays(days, remoteSnapshot.days || [], mergedSettings);

    settings = persistSettings(mergedSettings);
    await replaceAllDays(mergedDays.map((day) => normalizeDay(day, settings)));
    await refreshState();
    await writeCloudSnapshot(days.map((day) => normalizeDay(day, settings)), settings);
    markMergeSyncComplete();

    return getTradeAppSnapshot();
  } catch (error) {
    updateCloudSyncStatus(silent ? '后台同步失败' : '同步失败');
    throw error;
  } finally {
    setCloudSyncing(false);
    initCloudSyncStatus();
  }
}

export async function clearCloudTradeData() {
  setCloudSyncing(true, '正在清空云端数据…');

  try {
    await clearRemoteCloudData();
    return getTradeAppSnapshot();
  } finally {
    setCloudSyncing(false);
    initCloudSyncStatus();
  }
}

export async function clearLocalTradeData() {
  setCloudSyncing(true, '正在清空本地数据…');

  try {
    await clearAllDays();
    settings = persistSettings(createDefaultSettings());
    markLocalClearComplete();
    await refreshState();
    return getTradeAppSnapshot();
  } finally {
    setCloudSyncing(false);
    initCloudSyncStatus();
  }
}

export function buildNextTradeFromType(trade, manualType, date = todayStr()) {
  const assetType = manualType.startsWith('margin') ? 'margin' : 'cash';
  return normalizeTrade({
    ...trade,
    manualType,
    ratioSnapshot: cloneActiveRuleSnapshot(settings, assetType),
    updatedAt: new Date().toISOString()
  }, date, Number(trade?.order) || 0, settings);
}
