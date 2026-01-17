import Foundation

struct DividendResult: Hashable {
    let date: LocalDate
    let profit: Money
    let dividend: Money
}

struct DividendCalculator {
    
    let ratio: DividendRatio
    
    init(ratio: DividendRatio = .defaultRatio) {
        self.ratio = ratio
    }
    
    func calculateDividend(from profit: Money) -> Money {
        let ratioDecimal = ratio.decimalValue
        
        if profit.isPositive || profit.isZero {
            let rawDividend = profit.amount * ratioDecimal * Decimal(0.8)
            let ceiledValue = ceilDecimal(rawDividend)
            return Money(amount: ceiledValue)
        } else {
            let rawDividend = profit.amount * ratioDecimal
            let flooredValue = floorDecimal(rawDividend)
            return Money(amount: flooredValue)
        }
    }
    
    func calculateDividendHistory(
        from days: [TradeDay],
        profitCalculator: ProfitCalculator
    ) -> [DividendResult] {
        days
            .filter { !$0.isDeleted }
            .map { day in
                let profit = profitCalculator.calculateDayProfit(for: day, allDays: days)
                let dividend = calculateDividend(from: profit)
                return DividendResult(date: day.date, profit: profit, dividend: dividend)
            }
            .filter { !$0.profit.isZero }
            .sorted { $0.date > $1.date }
    }
    
    func calculateDividendSummary(
        from days: [TradeDay],
        profitCalculator: ProfitCalculator
    ) -> (totalDividend: Money, totalLossShare: Money, netDividend: Money) {
        var totalDividend = Money.zero
        var totalLossShare = Money.zero
        
        for day in days where !day.isDeleted {
            let profit = profitCalculator.calculateDayProfit(for: day, allDays: days)
            let dividend = calculateDividend(from: profit)
            
            if dividend.isPositive || dividend.isZero {
                totalDividend += dividend
            } else {
                totalLossShare += dividend.absoluteValue
            }
        }
        
        let netDividend = totalDividend - totalLossShare
        
        return (totalDividend, totalLossShare, netDividend)
    }
    
    private func ceilDecimal(_ value: Decimal) -> Decimal {
        var result = Decimal()
        var mutableValue = value
        NSDecimalRound(&result, &mutableValue, 0, .up)
        return result
    }
    
    private func floorDecimal(_ value: Decimal) -> Decimal {
        var result = Decimal()
        var mutableValue = value
        NSDecimalRound(&result, &mutableValue, 0, .down)
        return result
    }
}

