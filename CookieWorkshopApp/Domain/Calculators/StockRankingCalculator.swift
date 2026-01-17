import Foundation

struct StockRankingEntry: Identifiable, Hashable {
    var id: String { symbol }
    let symbol: String
    var profit: Money
    var buyCount: Int
    var sellCount: Int
}

struct StockRankingCalculator {
    
    private let holdingsCalculator = HoldingsCalculator()
    
    func calculateRanking(from days: [TradeDay]) -> [StockRankingEntry] {
        var stockMap: [String: StockRankingEntry] = [:]
        
        let sortedDays = days
            .filter { !$0.isDeleted }
            .sorted { $0.date < $1.date }
        
        for day in sortedDays {
            let previousDate = day.date.adding(days: -1)
            let holdingsBeforeDay = holdingsCalculator.calculateHoldings(
                from: days,
                upToDate: previousDate
            )
            
            var tempHoldings = holdingsBeforeDay
            
            for trade in day.buyTrades {
                let symbol = trade.symbol
                
                if stockMap[symbol] == nil {
                    stockMap[symbol] = StockRankingEntry(
                        symbol: symbol,
                        profit: .zero,
                        buyCount: 0,
                        sellCount: 0
                    )
                }
                stockMap[symbol]?.buyCount += 1
                
                processBuy(trade, holdings: &tempHoldings)
            }
            
            for trade in day.sellTrades {
                let symbol = trade.symbol
                
                if stockMap[symbol] == nil {
                    stockMap[symbol] = StockRankingEntry(
                        symbol: symbol,
                        profit: .zero,
                        buyCount: 0,
                        sellCount: 0
                    )
                }
                stockMap[symbol]?.sellCount += 1
                
                let profit = processSellForProfit(trade, holdings: &tempHoldings)
                stockMap[symbol]?.profit += profit
            }
        }
        
        return stockMap.values
            .filter { $0.sellCount > 0 }
            .sorted { $0.profit > $1.profit }
    }
    
    private func processBuy(_ trade: Trade, holdings: inout [String: Holding]) {
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

