import Foundation

struct HoldingsCalculator {
    
    func calculateHoldings(from days: [TradeDay], upToDate: LocalDate? = nil) -> [String: Holding] {
        var holdings: [String: Holding] = [:]
        
        let sortedDays = days
            .filter { !$0.isDeleted }
            .sorted { $0.date < $1.date }
        
        for day in sortedDays {
            if let upTo = upToDate, day.date > upTo {
                break
            }
            
            processDay(day, holdings: &holdings)
        }
        
        return holdings.filter { !$0.value.isEmpty }
    }
    
    private func processDay(_ day: TradeDay, holdings: inout [String: Holding]) {
        let buys = day.buyTrades
        let sells = day.sellTrades
        
        for trade in buys {
            processBuy(trade, holdings: &holdings)
        }
        
        for trade in sells {
            processSell(trade, holdings: &holdings)
        }
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
    
    private func processSell(_ trade: Trade, holdings: inout [String: Holding]) {
        guard trade.quantity > 0, trade.price.amount > 0 else { return }
        
        let symbol = trade.symbol
        guard holdings[symbol] != nil else { return }
        
        _ = holdings[symbol]?.processSell(quantity: trade.quantity)
        
        if holdings[symbol]?.isEmpty == true {
            holdings[symbol] = nil
        }
    }
}

