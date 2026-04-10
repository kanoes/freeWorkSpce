import { APP_VERSION, SETTINGS_KEY } from './constants.js';
import { trimText } from './utils.js';

export function createDividendRule(assetType, numerator = 1, denominator = 3, updatedAt = new Date().toISOString()) {
  return {
    id: `${assetType}-${updatedAt}`,
    numerator,
    denominator,
    updatedAt
  };
}

export function createDefaultSettings() {
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

export function normalizeRuleSnapshot(ruleSnapshot, assetType) {
  const fallback = createDividendRule(assetType);
  return {
    ruleId: ruleSnapshot?.ruleId || ruleSnapshot?.id || fallback.id,
    numerator: Math.max(1, Number(ruleSnapshot?.numerator) || 1),
    denominator: Math.max(1, Number(ruleSnapshot?.denominator) || 1),
    updatedAt: trimText(ruleSnapshot?.updatedAt) || fallback.updatedAt
  };
}

export function normalizeSettings(raw) {
  const defaults = createDefaultSettings();
  const settings = raw && typeof raw === 'object' ? raw : {};

  const cashRule = normalizeRuleSnapshot(settings.dividendRules?.cash, 'cash');
  const marginRule = normalizeRuleSnapshot(settings.dividendRules?.margin, 'margin');

  return {
    version: APP_VERSION,
    updatedAt: trimText(settings.updatedAt) || defaults.updatedAt,
    lastCsvImportAt: trimText(settings.lastCsvImportAt) || '',
    lastCsvImportSummary: settings.lastCsvImportSummary || null,
    dividendRules: {
      cash: {
        id: cashRule.ruleId,
        numerator: cashRule.numerator,
        denominator: cashRule.denominator,
        updatedAt: cashRule.updatedAt
      },
      margin: {
        id: marginRule.ruleId,
        numerator: marginRule.numerator,
        denominator: marginRule.denominator,
        updatedAt: marginRule.updatedAt
      }
    }
  };
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return createDefaultSettings();
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return createDefaultSettings();
  }
}

export function persistSettings(settings) {
  const nextSettings = normalizeSettings({
    ...settings,
    updatedAt: new Date().toISOString()
  });
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(nextSettings));
  return nextSettings;
}

export function cloneActiveRuleSnapshot(settings, assetType) {
  const normalizedSettings = normalizeSettings(settings);
  const rule = normalizedSettings.dividendRules[assetType] || createDividendRule(assetType);
  return {
    ruleId: rule.id,
    numerator: rule.numerator,
    denominator: rule.denominator,
    updatedAt: rule.updatedAt
  };
}

function pickLatestRule(leftRule, rightRule, assetType) {
  const left = normalizeRuleSnapshot(leftRule, assetType);
  const right = normalizeRuleSnapshot(rightRule, assetType);
  return new Date(right.updatedAt || 0).getTime() >= new Date(left.updatedAt || 0).getTime()
    ? {
        id: right.ruleId,
        numerator: right.numerator,
        denominator: right.denominator,
        updatedAt: right.updatedAt
      }
    : {
        id: left.ruleId,
        numerator: left.numerator,
        denominator: left.denominator,
        updatedAt: left.updatedAt
      };
}

export function mergeSettings(localSettings, remoteSettings) {
  const local = normalizeSettings(localSettings);
  if (!remoteSettings) return local;

  const remote = normalizeSettings(remoteSettings);
  const localImportAt = new Date(local.lastCsvImportAt || 0).getTime();
  const remoteImportAt = new Date(remote.lastCsvImportAt || 0).getTime();
  const useRemoteImport = remoteImportAt >= localImportAt;

  return normalizeSettings({
    version: APP_VERSION,
    updatedAt: new Date(Math.max(
      new Date(local.updatedAt || 0).getTime(),
      new Date(remote.updatedAt || 0).getTime(),
      Date.now()
    )).toISOString(),
    lastCsvImportAt: useRemoteImport ? remote.lastCsvImportAt : local.lastCsvImportAt,
    lastCsvImportSummary: useRemoteImport
      ? (remote.lastCsvImportSummary || local.lastCsvImportSummary)
      : (local.lastCsvImportSummary || remote.lastCsvImportSummary),
    dividendRules: {
      cash: pickLatestRule(local.dividendRules.cash, remote.dividendRules.cash, 'cash'),
      margin: pickLatestRule(local.dividendRules.margin, remote.dividendRules.margin, 'margin')
    }
  });
}
