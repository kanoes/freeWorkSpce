import { useState } from 'react';

import {
  buildNextTradeFromType,
  findCompanyNameBySymbol,
  normalizeTrade,
  removeDayById,
  todayStr,
  trimText,
  upsertManualDay
} from '../lib/trade/index.js';

const REVERSE_MANUAL_TYPE_MAP = {
  spot_buy: 'spot_sell',
  spot_sell: 'spot_buy',
  margin_open_long: 'margin_close_long',
  margin_close_long: 'margin_open_long',
  margin_open_short: 'margin_close_short',
  margin_close_short: 'margin_open_short'
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

function shouldTreatAsAutoFilledName(name, symbol) {
  const normalizedName = trimText(name).toUpperCase();
  const normalizedSymbol = trimText(symbol).toUpperCase();
  if (!normalizedName) return true;
  if (!normalizedSymbol) return false;
  if (normalizedName === normalizedSymbol) return true;
  return normalizedName.length < normalizedSymbol.length
    && /^[A-Z0-9]+$/.test(normalizedName)
    && normalizedSymbol.startsWith(normalizedName);
}

export function useManualDayEditor({ runTask, onSaved }) {
  const [manualSheet, setManualSheet] = useState(createEmptySheetState());

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

  function setManualDate(value) {
    setManualSheet((current) => ({ ...current, date: value }));
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
          if (
            !target
            || trimText(target.symbol) !== trimText(value)
            || !shouldTreatAsAutoFilledName(target.name, target.symbol)
          ) return current;
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
        trades: nextTrades.length
          ? nextTrades
          : [normalizeTrade(buildNextTradeFromType({}, 'spot_buy', current.date || todayStr()), current.date || todayStr(), 0)]
      };
    });
  }

  function insertManualTradeAfter(index, mode = 'duplicate') {
    setManualSheet((current) => {
      const sourceTrade = current.trades[index];
      if (!sourceTrade) return current;

      const date = current.date || todayStr();
      const now = new Date().toISOString();
      const nextManualType = mode === 'reverse'
        ? (REVERSE_MANUAL_TYPE_MAP[sourceTrade.manualType] || sourceTrade.manualType)
        : sourceTrade.manualType;
      const insertedBase = {
        ...sourceTrade,
        id: crypto.randomUUID(),
        source: 'manual',
        createdAt: now,
        updatedAt: now,
        manualType: nextManualType,
        fee: mode === 'reverse' ? '' : sourceTrade.fee,
        taxAmount: mode === 'reverse' ? '' : sourceTrade.taxAmount,
        holdingCost: '',
        settlementDate: mode === 'reverse' ? '' : sourceTrade.settlementDate,
        settlementAmount: '',
        notes: mode === 'reverse' ? '' : sourceTrade.notes,
        price: mode === 'reverse' ? '' : sourceTrade.price,
        fingerprint: '',
        csvBaseSignature: ''
      };

      const insertedTrade = normalizeTrade(
        buildNextTradeFromType(insertedBase, nextManualType, date),
        date,
        index + 1
      );
      const nextTrades = [...current.trades];
      nextTrades.splice(index + 1, 0, insertedTrade);

      return {
        ...current,
        trades: nextTrades.map((trade, tradeIndex) => normalizeTrade({
          ...trade,
          order: tradeIndex
        }, date, tradeIndex))
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
    setManualSheet((current) => {
      const date = current.date || todayStr();
      const lastTrade = current.trades[current.trades.length - 1] || null;
      const now = new Date().toISOString();
      const preset = lastTrade ? {
        id: crypto.randomUUID(),
        source: 'manual',
        createdAt: now,
        updatedAt: now,
        manualType: lastTrade.manualType,
        symbol: lastTrade.symbol,
        name: lastTrade.name,
        market: lastTrade.market,
        marketLabel: lastTrade.marketLabel,
        term: lastTrade.term,
        custody: lastTrade.custody,
        taxCategory: lastTrade.taxCategory,
        quantity: '',
        price: '',
        fee: '',
        taxAmount: '',
        holdingCost: '',
        settlementDate: '',
        settlementAmount: '',
        notes: ''
      } : {};

      return {
        ...current,
        trades: [
          ...current.trades,
          normalizeTrade(
            buildNextTradeFromType(preset, preset.manualType || 'spot_buy', date),
            date,
            current.trades.length
          )
        ]
      };
    });
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
    onSaved?.();
  }

  async function handleDeleteDay() {
    if (!manualSheet.dayId) return;
    await runTask(() => removeDayById(manualSheet.dayId), { successText: '已删除交易日。' });
    closeManualSheet();
  }

  return {
    manualSheet,
    setManualDate,
    openAddSheet,
    openEditSheet,
    closeManualSheet,
    handleManualTradeUpdate,
    handleManualRemove,
    handleManualMove,
    handleManualAdd,
    handleManualDuplicate: (index) => insertManualTradeAfter(index, 'duplicate'),
    handleManualReverse: (index) => insertManualTradeAfter(index, 'reverse'),
    handleManualSave,
    handleDeleteDay
  };
}
