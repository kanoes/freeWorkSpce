import Foundation

@MainActor
final class DividendViewModel: ObservableObject {
    
    let days: [TradeDay]
    
    @Published var numerator: Int = 1
    @Published var denominator: Int = 3
    
    private let profitCalculator = ProfitCalculator()
    
    init(days: [TradeDay]) {
        self.days = days
    }
    
    private var dividendCalculator: DividendCalculator {
        DividendCalculator(ratio: DividendRatio(numerator: numerator, denominator: denominator))
    }
    
    var todayDividend: DividendResult? {
        let today = LocalDate.today
        guard let todayDay = days.first(where: { $0.date == today && !$0.isDeleted }) else {
            return nil
        }
        
        let profit = profitCalculator.calculateDayProfit(for: todayDay, allDays: days)
        let dividend = dividendCalculator.calculateDividend(from: profit)
        
        return DividendResult(date: today, profit: profit, dividend: dividend)
    }
    
    var dividendHistory: [DividendResult] {
        dividendCalculator.calculateDividendHistory(from: days, profitCalculator: profitCalculator)
    }
    
    var summary: (totalDividend: Money, totalLossShare: Money, netDividend: Money) {
        dividendCalculator.calculateDividendSummary(from: days, profitCalculator: profitCalculator)
    }
}

