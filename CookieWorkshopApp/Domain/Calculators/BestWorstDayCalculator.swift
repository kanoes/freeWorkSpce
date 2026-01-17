import Foundation

struct DayWithProfit: Hashable {
    let day: TradeDay
    let profit: Money
}

struct BestWorstDayCalculator {
    
    private let profitCalculator = ProfitCalculator()
    
    func calculate(from days: [TradeDay]) -> (best: DayWithProfit?, worst: DayWithProfit?) {
        let activeDays = days.filter { !$0.isDeleted }
        
        let daysWithProfit = activeDays.map { day in
            let profit = profitCalculator.calculateDayProfit(for: day, allDays: days)
            return DayWithProfit(day: day, profit: profit)
        }
        
        let sorted = daysWithProfit.sorted { $0.profit > $1.profit }
        
        let best = sorted.first.flatMap { $0.profit.isPositive ? $0 : nil }
        let worst = sorted.last.flatMap { $0.profit.isNegative ? $0 : nil }
        
        return (best, worst)
    }
}

