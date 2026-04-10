import {
  DAYS_IN_YEAR,
  DIVIDEND_START_DATE,
  MARGIN_INTEREST_RATE,
  SCOPES
} from './constants.js';
import { getStockDisplayName } from './company-data.js';
import { normalizeDay, normalizeTrade } from './models.js';
import {
  calculateInclusiveHoldingDays,
  compareByDateAsc,
  compareTradeOrder,
  getCurrentWeekMondayStr,
  roundMoney,
  safeNumber,
  sumMoney,
  todayStr
} from './utils.js';

function createScopeDayState() {
  return {
    grossProfit: 0,
    profit: 0,
    holdingCost: 0,
    estimatedHoldingCost: 0,
    financingCost: 0,
    estimatedFinancingCost: 0,
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
    holdingCost: 0,
    estimatedHoldingCost: 0,
    financingCost: 0,
    estimatedFinancingCost: 0,
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
    today: {
      profit: 0,
      dividend: 0,
      tradeCount: 0,
      holdingCost: 0,
      estimatedHoldingCost: 0,
      financingCost: 0,
      estimatedFinancingCost: 0
    },
    week: {
      profit: 0,
      dividend: 0,
      tradeCount: 0,
      holdingCost: 0,
      estimatedHoldingCost: 0,
      financingCost: 0,
      estimatedFinancingCost: 0
    }
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

export function buildAnalytics(days) {
  const normalizedDays = days.map((day) => normalizeDay(day)).sort(compareByDateAsc);
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

  const dayMap = new Map(dayViews.map((day) => [day.date, day]));
  const cashPositions = new Map();
  const marginLongPositions = new Map();
  const marginShortPositions = new Map();
  const enrichedTrades = [];

  normalizedDays.forEach((day) => {
    const dayView = dayMap.get(day.date);
    const processingTrades = day.trades
      .map((trade, index) => normalizeTrade(trade, day.date, index))
      .sort(compareTradeOrder);

    processingTrades.forEach((trade) => {
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
          addLongPosition(cashPositions, trade, quantity, buyCost, day.date);
          closeValueAmount = buyCost;
        } else {
          const closeResult = closeLongPosition(cashPositions, trade.symbol, quantity, sellRevenue, day.date);
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
          addShortPosition(marginShortPositions, trade, quantity, roundMoney(grossAmount - fee - taxAmount), day.date);
          closeValueAmount = roundMoney(grossAmount - fee - taxAmount);
        } else {
          const closeResult = closeShortPosition(
            marginShortPositions,
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
        addLongPosition(marginLongPositions, trade, quantity, roundMoney(grossAmount + fee + taxAmount), day.date);
        closeValueAmount = roundMoney(grossAmount + fee + taxAmount);
      } else {
        const closeResult = closeLongPosition(
          marginLongPositions,
          trade.symbol,
          quantity,
          roundMoney(grossAmount - fee - taxAmount),
          day.date,
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

      const appliedHoldingCost = profitSource === 'reported' ? 0 : holdingCost;
      const carryingCostEstimate = estimatedHoldingCost;
      const dividendAmount = day.date >= DIVIDEND_START_DATE
        ? calculateDividendWithRule(realizedProfit, trade.ratioSnapshot)
        : 0;

      const enrichedTrade = {
        ...trade,
        realizedProfit,
        derivedNetProfit,
        grossRealizedProfit,
        holdingCost: appliedHoldingCost,
        estimatedHoldingCost: carryingCostEstimate,
        financingCost: appliedHoldingCost,
        estimatedFinancingCost: carryingCostEstimate,
        holdingCostSource,
        reportedClosePnl,
        profitSource,
        costBasisAmount,
        closeValueAmount,
        averageHoldingDays,
        dividendAmount,
        dayDate: day.date
      };

      dayView.trades.push(enrichedTrade);
      enrichedTrades.push(enrichedTrade);

      const targets = [dayView.scopes.all, dayView.scopes[trade.assetType]];
      targets.forEach((scopeState) => {
        scopeState.tradeCount += 1;
        scopeState.grossProfit = sumMoney(scopeState.grossProfit, grossRealizedProfit);
        scopeState.profit = sumMoney(scopeState.profit, realizedProfit);
        scopeState.holdingCost = sumMoney(scopeState.holdingCost, appliedHoldingCost);
        scopeState.estimatedHoldingCost = sumMoney(scopeState.estimatedHoldingCost, carryingCostEstimate);
        scopeState.financingCost = scopeState.holdingCost;
        scopeState.estimatedFinancingCost = scopeState.estimatedHoldingCost;
        scopeState.dividend = sumMoney(scopeState.dividend, dividendAmount);
        scopeState.symbols.add(trade.symbol || trade.name || '');

        if (trade.action === 'buy') scopeState.buyCount += 1;
        if (trade.action === 'sell') scopeState.sellCount += 1;
        if (trade.positionEffect === 'close' || (trade.assetType === 'cash' && trade.action === 'sell')) {
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

      summary.totalProfit = sumMoney(summary.totalProfit, scopeDay.profit);
      summary.grossProfit = sumMoney(summary.grossProfit, scopeDay.grossProfit);
      summary.holdingCost = sumMoney(summary.holdingCost, scopeDay.holdingCost);
      summary.estimatedHoldingCost = sumMoney(summary.estimatedHoldingCost, scopeDay.estimatedHoldingCost);
      summary.financingCost = summary.holdingCost;
      summary.estimatedFinancingCost = summary.estimatedHoldingCost;
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
          holdingCost: scopeDay.holdingCost,
          estimatedHoldingCost: scopeDay.estimatedHoldingCost,
          financingCost: scopeDay.holdingCost,
          estimatedFinancingCost: scopeDay.estimatedHoldingCost
        };
      }

      if (day.date >= monday && day.date <= today) {
        summary.week.profit = sumMoney(summary.week.profit, scopeDay.profit);
        summary.week.dividend = sumMoney(summary.week.dividend, scopeDay.dividend);
        summary.week.tradeCount += scopeDay.tradeCount;
        summary.week.holdingCost = sumMoney(summary.week.holdingCost, scopeDay.holdingCost);
        summary.week.estimatedHoldingCost = sumMoney(summary.week.estimatedHoldingCost, scopeDay.estimatedHoldingCost);
        summary.week.financingCost = summary.week.holdingCost;
        summary.week.estimatedFinancingCost = summary.week.estimatedHoldingCost;
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
      monthlyMap.set(monthKey, sumMoney(monthlyMap.get(monthKey) || 0, scopeDay.profit));
      scopeDay.symbols.forEach((symbol) => symbol && symbolSet.add(symbol));
      summary.totalDividend = sumMoney(summary.totalDividend, scopeDay.positiveDividend);
      summary.totalLossShare = sumMoney(summary.totalLossShare, scopeDay.lossShare);
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
      target.profit = sumMoney(target.profit, trade.realizedProfit);
      target.tradeCount += 1;
      if (trade.action === 'buy') target.buyCount += 1;
      if (trade.action === 'sell') target.sellCount += 1;
    });

    summary.netDividend = roundMoney(summary.totalDividend - summary.totalLossShare);
    summary.winRate = summary.activeDays ? Math.round((summary.winDays / summary.activeDays) * 100) : 0;
    summary.symbolCount = symbolSet.size;
    summary.positions = positions[scope];
    summary.positionsCount = positions[scope].length;
    summary.ranking = Array.from(rankingMap.values())
      .filter((item) => item.tradeCount > 0)
      .sort((left, right) => right.profit - left.profit);
    summary.monthly = Array.from(monthlyMap.entries())
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([month, profit]) => ({ month, profit }));
    summary.dividendHistory = dividendHistory.sort((left, right) => right.date.localeCompare(left.date));
  });

  return {
    daysAsc: dayViews,
    daysDesc: [...dayViews].sort((left, right) => right.date.localeCompare(left.date)),
    trades: enrichedTrades.sort((left, right) => {
      const dateDelta = right.dayDate.localeCompare(left.dayDate);
      if (dateDelta !== 0) return dateDelta;
      return (Number(left.order) || 0) - (Number(right.order) || 0);
    }),
    summaries,
    positions
  };
}
