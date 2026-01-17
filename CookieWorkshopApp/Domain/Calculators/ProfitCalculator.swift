import Foundation

struct ProfitCalculator {
    
    private let holdingsCalculator = HoldingsCalculator()
    
    func calculateDayProfit(for day: TradeDay, allDays: [TradeDay]) -> Money {
        guard !day.isDeleted else { return .zero }
        
        let previousDate = day.date.adding(days: -1)
        let holdingsBeforeDay = holdingsCalculator.calculateHoldings(
            from: allDays,
            upToDate: previousDate
        )
        
        var tempHoldings = holdingsBeforeDay
        
        for trade in day.buyTrades {
            processBuyForProfit(trade, holdings: &tempHoldings)
        }
        
        var dayProfit = Money.zero
        
        for trade in day.sellTrades {
            let profit = processSellForProfit(trade, holdings: &tempHoldings)
            dayProfit += profit
        }
        
        return dayProfit
    }
    
    func calculateTotalProfit(from days: [TradeDay]) -> Money {
        var totalProfit = Money.zero
        
        for day in days where !day.isDeleted {
            let profit = calculateDayProfit(for: day, allDays: days)
            totalProfit += profit
        }
        
        return totalProfit
    }
    
    func calculateMonthlyProfit(from days: [TradeDay]) -> [String: Money] {
        var monthlyProfits: [String: Money] = [:]
        
        for day in days where !day.isDeleted {
            let profit = calculateDayProfit(for: day, allDays: days)
            let monthKey = day.date.monthKey
            
            if monthlyProfits[monthKey] == nil {
                monthlyProfits[monthKey] = .zero
            }
            monthlyProfits[monthKey]? += profit
        }
        
        return monthlyProfits
    }
    
    private func processBuyForProfit(_ trade: Trade, holdings: inout [String: Holding]) {
        guard trade.quantity > 0, trade.price.amount > 0 else { return }
        
        let symbol = trade.symbol
        
        if holdings[symbol] == nil {
            holdings[symbol] = Holding(symbol: symbol, market: trade.market)
        }
        
        holdings[symbol]?.addBuy(
            quantity: trade.quantity,
            price: trade.price,
            market: trade.market
        )
    }
    
    private func processSellForProfit(_ trade: Trade, holdings: inout [String: Holding]) -> Money {
        guard trade.quantity > 0, trade.price.amount > 0 else { return .zero }
        
        let symbol = trade.symbol
        guard var holding = holdings[symbol], !holding.isEmpty else { return .zero }
        
        let sellQuantity = min(trade.quantity, holding.quantity)
        let costBasis = holding.processSell(quantity: sellQuantity)
        let revenue = trade.price * sellQuantity
        
        holdings[symbol] = holding
        
        if holding.isEmpty {
            holdings[symbol] = nil
        }
        
        return revenue - costBasis
    }
}

