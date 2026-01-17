import Foundation

struct Trade: Hashable, Codable, Identifiable {
    var id: UUID
    var symbol: String
    var action: TradeAction
    var market: Market
    var quantity: Int
    var price: Money
    
    var totalAmount: Money {
        price * quantity
    }
    
    init(
        id: UUID = UUID(),
        symbol: String,
        action: TradeAction,
        market: Market,
        quantity: Int,
        price: Money
    ) {
        self.id = id
        self.symbol = symbol.uppercased()
        self.action = action
        self.market = market
        self.quantity = quantity
        self.price = price
    }
}

