import { MANUAL_TYPE_MAP } from './constants.js';
import { collectManualDaysForCsvRebuild, describeTradeType, mergeTradeVersions, normalizeTrade, reindexTrades } from './models.js';
import { cloneActiveRuleSnapshot } from './settings.js';
import {
  compactText,
  compareTradeOrder,
  generateId,
  marketLabelFromKey,
  normalizeAnyDate,
  normalizeMarketKey,
  safeNumber,
  trimText
} from './utils.js';

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const content = String(text || '').replace(/^\uFEFF/, '');

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];

    if (inQuotes) {
      if (char === '"') {
        if (content[index + 1] === '"') {
          field += '"';
          index += 1;
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
      if (content[index + 1] === '\n') continue;
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

function parseBrokerCsv(text, settings) {
  const rows = parseCsvRows(text);
  const headerIndex = rows.findIndex((cells) => trimText(cells[0]) === '約定日');
  if (headerIndex < 0) {
    throw new Error('没有找到“約定日”表头，请确认导出的是券商约定履历 CSV。');
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
        ratioSnapshot: cloneActiveRuleSnapshot(settings, config.assetType)
      }, date, ordinal, settings)
    });
  });

  summary.importedRows = trades.length;
  return { trades, summary };
}

export async function rebuildDaysFromCsv(file, currentDays, settings) {
  const text = await decodeCsvFile(file);
  const parsed = parseBrokerCsv(text, settings);

  if (!parsed.trades.length) {
    throw new Error('CSV 里没有可导入的现物或信用交易。');
  }

  const now = new Date().toISOString();
  const workingDays = collectManualDaysForCsvRebuild(currentDays, settings);

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
        return existingTrade.csvBaseSignature
          ? existingTrade.csvBaseSignature === trade.csvBaseSignature
          : false;
      }
      return false;
    });

    if (matchIndex >= 0) {
      day.trades[matchIndex] = mergeTradeVersions(day.trades[matchIndex], {
        ...trade,
        updatedAt: now,
        ratioSnapshot: day.trades[matchIndex].ratioSnapshot || trade.ratioSnapshot
      }, date, settings);
    } else {
      day.trades.push(normalizeTrade({
        ...trade,
        updatedAt: now,
        order: day.trades.length
      }, date, day.trades.length, settings));
    }

    day.trades = reindexTrades(day.trades.sort(compareTradeOrder), date, settings);
    day.updatedAt = now;
    workingDays.set(date, day);
  });

  const days = Array.from(workingDays.values())
    .filter((day) => day.trades.length > 0)
    .sort((left, right) => left.date.localeCompare(right.date));

  return {
    days,
    summary: parsed.summary
  };
}
