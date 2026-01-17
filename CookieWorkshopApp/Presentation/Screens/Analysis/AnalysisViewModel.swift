import Foundation

struct MonthlyProfitData: Identifiable {
    let id = UUID()
    let month: String
    let profit: Money
}

@MainActor
final class AnalysisViewModel: ObservableObject {
    
    let days: [TradeDay]
    
    private let profitCalculator = ProfitCalculator()
    private let holdingsCalculator = HoldingsCalculator()
    private let statsCalculator = TradingStatsCalculator()
    private let stockRankingCalculator = StockRankingCalculator()
    private let bestWorstCalculator = BestWorstDayCalculator()
    
    init(days: [TradeDay]) {
        self.days = days
    }
    
    var totalProfit: Money {
        profitCalculator.calculateTotalProfit(from: days)
    }
    
    var stats: TradingStats {
        statsCalculator.calculate(from: days)
    }
    
    var holdings: [Holding] {
        Array(holdingsCalculator.calculateHoldings(from: days).values)
            .sorted { $0.marketValue > $1.marketValue }
    }
    
    var stockRanking: [StockRankingEntry] {
        stockRankingCalculator.calculateRanking(from: days)
    }
    
    var monthlyData: [MonthlyProfitData] {
        let monthlyProfits = profitCalculator.calculateMonthlyProfit(from: days)
        
        return monthlyProfits
            .sorted { $0.key < $1.key }
            .map { key, profit in
                let parts = key.split(separator: "-")
                let displayMonth = parts.count == 2 ? "\(parts[0])/\(parts[1])" : key
                return MonthlyProfitData(month: displayMonth, profit: profit)
            }
    }
    
    var bestDay: DayWithProfit? {
        bestWorstCalculator.calculate(from: days).best
    }
    
    var worstDay: DayWithProfit? {
        bestWorstCalculator.calculate(from: days).worst
    }
}

