import Foundation

struct TradingStats: Hashable {
    let totalBuyCount: Int
    let totalSellCount: Int
    let tradingDays: Int
    let winDays: Int
    let lossDays: Int
    let tradedSymbolCount: Int
    
    var averageDailyTrades: Double {
        guard tradingDays > 0 else { return 0 }
        return Double(totalBuyCount + totalSellCount) / Double(tradingDays)
    }
    
    var winRate: Double {
        guard tradingDays > 0 else { return 0 }
        return Double(winDays) / Double(tradingDays)
    }
    
    var winRatePercentage: Int {
        Int((winRate * 100).rounded())
    }
}

struct TradingStatsCalculator {
    
    private let profitCalculator = ProfitCalculator()
    
    func calculate(from days: [TradeDay]) -> TradingStats {
        let activeDays = days.filter { !$0.isDeleted }
        
        var totalBuyCount = 0
        var totalSellCount = 0
        var tradingDays = 0
        var winDays = 0
        var lossDays = 0
        var allSymbols: Set<String> = []
        
        for day in activeDays {
            let hasTrades = !day.trades.isEmpty
            if hasTrades {
                tradingDays += 1
            }
            
            for trade in day.trades {
                allSymbols.insert(trade.symbol)
                
                switch trade.action {
                case .buy:
                    totalBuyCount += 1
                case .sell:
                    totalSellCount += 1
                }
            }
            
            let profit = profitCalculator.calculateDayProfit(for: day, allDays: days)
            if profit.isPositive {
                winDays += 1
            } else if profit.isNegative {
                lossDays += 1
            }
        }
        
        return TradingStats(
            totalBuyCount: totalBuyCount,
            totalSellCount: totalSellCount,
            tradingDays: tradingDays,
            winDays: winDays,
            lossDays: lossDays,
            tradedSymbolCount: allSymbols.count
        )
    }
}

