import { DAYS_IN_YEAR, MARGIN_INTEREST_RATE } from './constants.js';
import { getStockDisplayName } from './company-data.js';
import {
  calculateInclusiveHoldingDays,
  roundMoney,
  safeNumber
} from './utils.js';

export function createPositionBooks() {
  return {
    cashPositions: new Map(),
    marginLongPositions: new Map(),
    marginShortPositions: new Map()
  };
}

function getTradeReportedClosePnl(trade) {
  if (!(trade.assetType === 'margin' && trade.positionEffect === 'close')) return null;
  return trade.settlementAmount === '' ? null : safeNumber(trade.settlementAmount);
}

function getTradeHoldingCostOverride(trade) {
  return trade.holdingCost === '' ? null : safeNumber(trade.holdingCost);
}

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
      openDate: openedDate,
      quantity,
      totalCost
    });
  }
}

function finalizeLongPosition(position) {
  if (!position) return;
  position.lots = Array.isArray(position.lots)
    ? position.lots.filter((lot) => (Number(lot.quantity) || 0) > 1e-8 && (Number(lot.totalCost) || 0) > 1e-8)
    : [];
  position.quantity = position.lots.reduce((sum, lot) => sum + (Number(lot.quantity) || 0), 0);
  position.totalCost = roundMoney(position.lots.reduce((sum, lot) => sum + (Number(lot.totalCost) || 0), 0));
}

function reduceLotsByFifo(position, closeQty, closeDate, options = {}) {
  const { applyHoldingCost = false } = options;
  if (!Array.isArray(position?.lots) || !position.lots.length) {
    return { costBasis: 0, estimatedHoldingCost: 0, weightedHoldingDays: 0 };
  }

  let remainingQuantity = closeQty;
  let costBasis = 0;
  let estimatedHoldingCost = 0;
  let weightedHoldingDays = 0;
  const nextLots = [];

  position.lots.forEach((lot) => {
    const lotQuantity = Number(lot.quantity) || 0;
    const lotTotalCost = Number(lot.totalCost) || 0;
    if (lotQuantity <= 0 || lotTotalCost <= 0) return;

    if (remainingQuantity <= 1e-8) {
      nextLots.push(lot);
      return;
    }

    const closedQuantity = Math.min(remainingQuantity, lotQuantity);
    const unitCost = lotTotalCost / lotQuantity;
    const closedCost = unitCost * closedQuantity;
    costBasis += closedCost;

    if (applyHoldingCost && closedCost > 0) {
      const holdingDays = calculateInclusiveHoldingDays(lot.openDate, closeDate);
      estimatedHoldingCost += (closedCost * MARGIN_INTEREST_RATE * holdingDays) / DAYS_IN_YEAR;
      weightedHoldingDays += closedQuantity * holdingDays;
    }

    const nextQuantity = lotQuantity - closedQuantity;
    if (nextQuantity > 1e-8) {
      nextLots.push({
        ...lot,
        quantity: nextQuantity,
        totalCost: roundMoney(unitCost * nextQuantity)
      });
    }

    remainingQuantity -= closedQuantity;
  });

  position.lots = nextLots;
  finalizeLongPosition(position);
  return {
    costBasis: roundMoney(costBasis),
    estimatedHoldingCost: roundMoney(estimatedHoldingCost),
    weightedHoldingDays
  };
}

function closeLongPosition(map, symbol, quantity, revenue, closeDate, options = {}) {
  const {
    applyHoldingCost = false,
    holdingCostOverride = null
  } = options;
  const position = map.get(symbol);
  if (!position || position.quantity <= 0) {
    return {
      closeQty: 0,
      costBasis: 0,
      grossProfit: 0,
      holdingCost: 0,
      estimatedHoldingCost: 0,
      holdingCostSource: 'none',
      derivedNetProfit: 0,
      averageHoldingDays: 0
    };
  }

  const closeQty = Math.min(quantity, position.quantity);
  if (closeQty <= 0) {
    return {
      closeQty: 0,
      costBasis: 0,
      grossProfit: 0,
      holdingCost: 0,
      estimatedHoldingCost: 0,
      holdingCostSource: 'none',
      derivedNetProfit: 0,
      averageHoldingDays: 0
    };
  }

  const lotResult = reduceLotsByFifo(position, closeQty, closeDate, { applyHoldingCost });
  const costBasis = lotResult.costBasis;
  const grossProfit = roundMoney(revenue - costBasis);
  const estimatedHoldingCost = applyHoldingCost ? lotResult.estimatedHoldingCost : 0;
  const holdingCost = holdingCostOverride != null
    ? roundMoney(holdingCostOverride)
    : estimatedHoldingCost;

  if (position.quantity <= 1e-8) {
    map.delete(symbol);
  }

  return {
    closeQty,
    costBasis,
    grossProfit,
    holdingCost,
    estimatedHoldingCost,
    holdingCostSource: holdingCostOverride != null ? 'manual' : applyHoldingCost ? 'estimated' : 'none',
    derivedNetProfit: roundMoney(grossProfit - holdingCost),
    averageHoldingDays: closeQty > 0 ? lotResult.weightedHoldingDays / closeQty : 0
  };
}

function addShortPosition(map, trade, quantity, totalEntry, openedDate = '') {
  const symbol = trade.symbol;
  if (!map.has(symbol)) {
    map.set(symbol, {
      symbol,
      name: getStockDisplayName(symbol, trade.name),
      quantity: 0,
      totalEntry: 0,
      market: trade.market,
      lots: []
    });
  }

  const position = map.get(symbol);
  position.name = trade.name || position.name || getStockDisplayName(symbol);
  position.market = trade.market || position.market || 'tse';
  position.quantity += quantity;
  position.totalEntry = roundMoney(position.totalEntry + totalEntry);

  if (quantity > 0 && totalEntry > 0) {
    position.lots.push({
      openDate: openedDate,
      quantity,
      totalEntry
    });
  }
}

function finalizeShortPosition(position) {
  if (!position) return;
  position.lots = Array.isArray(position.lots)
    ? position.lots.filter((lot) => (Number(lot.quantity) || 0) > 1e-8 && (Number(lot.totalEntry) || 0) > 1e-8)
    : [];
  position.quantity = position.lots.reduce((sum, lot) => sum + (Number(lot.quantity) || 0), 0);
  position.totalEntry = roundMoney(position.lots.reduce((sum, lot) => sum + (Number(lot.totalEntry) || 0), 0));
}

function reduceShortLotsByFifo(position, closeQty) {
  if (!Array.isArray(position?.lots) || !position.lots.length) {
    return { entryValue: 0 };
  }

  let remainingQuantity = closeQty;
  let entryValue = 0;
  const nextLots = [];

  position.lots.forEach((lot) => {
    const lotQuantity = Number(lot.quantity) || 0;
    const lotTotalEntry = Number(lot.totalEntry) || 0;
    if (lotQuantity <= 0 || lotTotalEntry <= 0) return;

    if (remainingQuantity <= 1e-8) {
      nextLots.push(lot);
      return;
    }

    const closedQuantity = Math.min(remainingQuantity, lotQuantity);
    const unitEntry = lotTotalEntry / lotQuantity;
    const closedEntry = unitEntry * closedQuantity;
    entryValue += closedEntry;

    const nextQuantity = lotQuantity - closedQuantity;
    if (nextQuantity > 1e-8) {
      nextLots.push({
        ...lot,
        quantity: nextQuantity,
        totalEntry: roundMoney(unitEntry * nextQuantity)
      });
    }

    remainingQuantity -= closedQuantity;
  });

  position.lots = nextLots;
  finalizeShortPosition(position);
  return { entryValue: roundMoney(entryValue) };
}

function closeShortPosition(map, symbol, quantity, costToClose, options = {}) {
  const { holdingCostOverride = null } = options;
  const position = map.get(symbol);
  if (!position || position.quantity <= 0) {
    return {
      closeQty: 0,
      entryValue: 0,
      grossProfit: 0,
      holdingCost: 0,
      estimatedHoldingCost: 0,
      holdingCostSource: 'none',
      derivedNetProfit: 0
    };
  }

  const closeQty = Math.min(quantity, position.quantity);
  const lotResult = reduceShortLotsByFifo(position, closeQty);
  const entryValue = lotResult.entryValue;
  const grossProfit = roundMoney(entryValue - costToClose);
  const holdingCost = holdingCostOverride != null ? roundMoney(holdingCostOverride) : 0;

  if (position.quantity <= 1e-8) {
    map.delete(symbol);
  }

  return {
    closeQty,
    entryValue,
    grossProfit,
    holdingCost,
    estimatedHoldingCost: 0,
    holdingCostSource: holdingCostOverride != null ? 'manual' : 'none',
    derivedNetProfit: roundMoney(grossProfit - holdingCost)
  };
}

export function processPositionTrade(books, trade, dayDate) {
  const quantity = Number(trade.quantity) || 0;
  const price = Number(trade.price) || 0;
  const fee = Number(trade.fee) || 0;
  const taxAmount = Number(trade.taxAmount) || 0;
  const settlementAmount = safeNumber(trade.settlementAmount);
  const holdingCostOverride = getTradeHoldingCostOverride(trade);
  const reportedClosePnl = getTradeReportedClosePnl(trade);
  const grossAmount = roundMoney(quantity * price);
  const buyCost = trade.assetType === 'cash' && settlementAmount != null && trade.action === 'buy'
    ? settlementAmount
    : roundMoney(grossAmount + fee + taxAmount);
  const sellRevenue = trade.assetType === 'cash' && settlementAmount != null && trade.action === 'sell'
    ? settlementAmount
    : roundMoney(grossAmount - fee - taxAmount);

  let realizedProfit = 0;
  let derivedNetProfit = 0;
  let grossRealizedProfit = 0;
  let holdingCost = 0;
  let estimatedHoldingCost = 0;
  let holdingCostSource = 'none';
  let profitSource = 'open';
  let averageHoldingDays = 0;
  let costBasisAmount = 0;
  let closeValueAmount = 0;

  if (trade.assetType === 'cash') {
    if (trade.action === 'buy') {
      addLongPosition(books.cashPositions, trade, quantity, buyCost, dayDate);
      closeValueAmount = buyCost;
    } else {
      const closeResult = closeLongPosition(books.cashPositions, trade.symbol, quantity, sellRevenue, dayDate);
      derivedNetProfit = closeResult.derivedNetProfit;
      realizedProfit = derivedNetProfit;
      grossRealizedProfit = closeResult.grossProfit;
      holdingCost = closeResult.holdingCost;
      estimatedHoldingCost = closeResult.estimatedHoldingCost;
      holdingCostSource = closeResult.holdingCostSource;
      costBasisAmount = closeResult.costBasis;
      closeValueAmount = sellRevenue;
      profitSource = 'model';
    }
  } else if (trade.positionSide === 'short') {
    if (trade.positionEffect === 'open') {
      addShortPosition(books.marginShortPositions, trade, quantity, roundMoney(grossAmount - fee - taxAmount), dayDate);
      closeValueAmount = roundMoney(grossAmount - fee - taxAmount);
    } else {
      const closeResult = closeShortPosition(
        books.marginShortPositions,
        trade.symbol,
        quantity,
        roundMoney(grossAmount + fee + taxAmount),
        { holdingCostOverride }
      );
      derivedNetProfit = closeResult.derivedNetProfit;
      realizedProfit = reportedClosePnl != null ? reportedClosePnl : derivedNetProfit;
      grossRealizedProfit = closeResult.grossProfit;
      holdingCost = closeResult.holdingCost;
      estimatedHoldingCost = closeResult.estimatedHoldingCost;
      holdingCostSource = closeResult.holdingCostSource;
      costBasisAmount = closeResult.entryValue;
      closeValueAmount = roundMoney(grossAmount + fee + taxAmount);
      profitSource = reportedClosePnl != null
        ? 'reported'
        : holdingCostSource === 'manual'
          ? 'manual'
          : 'model';
    }
  } else if (trade.positionEffect === 'open') {
    addLongPosition(books.marginLongPositions, trade, quantity, roundMoney(grossAmount + fee + taxAmount), dayDate);
    closeValueAmount = roundMoney(grossAmount + fee + taxAmount);
  } else {
    const closeResult = closeLongPosition(
      books.marginLongPositions,
      trade.symbol,
      quantity,
      roundMoney(grossAmount - fee - taxAmount),
      dayDate,
      {
        applyHoldingCost: true,
        holdingCostOverride
      }
    );
    derivedNetProfit = closeResult.derivedNetProfit;
    realizedProfit = reportedClosePnl != null ? reportedClosePnl : derivedNetProfit;
    grossRealizedProfit = closeResult.grossProfit;
    holdingCost = closeResult.holdingCost;
    estimatedHoldingCost = closeResult.estimatedHoldingCost;
    holdingCostSource = closeResult.holdingCostSource;
    averageHoldingDays = closeResult.averageHoldingDays;
    costBasisAmount = closeResult.costBasis;
    closeValueAmount = roundMoney(grossAmount - fee - taxAmount);
    profitSource = reportedClosePnl != null
      ? 'reported'
      : holdingCostSource === 'manual'
        ? 'manual'
        : 'model';
  }

  realizedProfit = roundMoney(realizedProfit);
  derivedNetProfit = roundMoney(derivedNetProfit);
  grossRealizedProfit = roundMoney(grossRealizedProfit);
  holdingCost = roundMoney(holdingCost);
  estimatedHoldingCost = roundMoney(estimatedHoldingCost);

  return {
    realizedProfit,
    derivedNetProfit,
    grossRealizedProfit,
    holdingCost: profitSource === 'reported' ? 0 : holdingCost,
    estimatedHoldingCost,
    financingCost: profitSource === 'reported' ? 0 : holdingCost,
    estimatedFinancingCost: estimatedHoldingCost,
    holdingCostSource,
    reportedClosePnl,
    profitSource,
    costBasisAmount,
    closeValueAmount,
    averageHoldingDays
  };
}

export function buildPositionViews(books) {
  const positions = {
    cash: Array.from(books.cashPositions.values()).map((position) => ({
      assetType: 'cash',
      positionSide: 'long',
      symbol: position.symbol,
      name: position.name,
      quantity: position.quantity,
      avgPrice: position.quantity > 0 ? position.totalCost / position.quantity : 0,
      market: position.market
    })),
    margin: [
      ...Array.from(books.marginLongPositions.values()).map((position) => ({
        assetType: 'margin',
        positionSide: 'long',
        symbol: position.symbol,
        name: position.name,
        quantity: position.quantity,
        avgPrice: position.quantity > 0 ? position.totalCost / position.quantity : 0,
        market: position.market
      })),
      ...Array.from(books.marginShortPositions.values()).map((position) => ({
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
  return positions;
}
