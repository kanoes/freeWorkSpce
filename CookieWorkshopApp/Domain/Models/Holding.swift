import Foundation

struct Holding: Identifiable, Hashable {
    var id: String { symbol }
    let symbol: String
    var quantity: Int
    var totalCost: Money
    var market: Market
    
    var averagePrice: Money {
        guard quantity > 0 else { return .zero }
        return totalCost / quantity
    }
    
    var marketValue: Money {
        averagePrice * quantity
    }
    
    init(symbol: String, quantity: Int = 0, totalCost: Money = .zero, market: Market = .tse) {
        self.symbol = symbol.uppercased()
        self.quantity = quantity
        self.totalCost = totalCost
        self.market = market
    }
    
    mutating func addBuy(quantity: Int, price: Money, market: Market) {
        let cost = price * quantity
        self.totalCost += cost
        self.quantity += quantity
        self.market = market
    }
    
    mutating func processSell(quantity sellQuantity: Int) -> Money {
        guard self.quantity > 0 else { return .zero }
        
        let actualSellQuantity = min(sellQuantity, self.quantity)
        let costBasis = averagePrice * actualSellQuantity
        
        self.totalCost -= costBasis
        self.quantity -= actualSellQuantity
        
        if self.quantity <= 0 {
            self.quantity = 0
            self.totalCost = .zero
        }
        
        return costBasis
    }
    
    var isEmpty: Bool {
        quantity <= 0
    }
}

