import Foundation

struct TradeDayDTO: Codable {
    let id: String
    let userId: String
    let date: String
    let payload: TradeDayPayloadDTO
    let updatedAt: String
    let deletedAt: String?
    
    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case date
        case payload
        case updatedAt = "updated_at"
        case deletedAt = "deleted_at"
    }
}

struct TradeDayPayloadDTO: Codable {
    let status: String
    let trades: [TradeDTO]
}

struct TradeDTO: Codable {
    let symbol: String
    let action: String
    let market: String
    let quantity: Int
    let price: Double
}

extension TradeDayDTO {
    
    init(from tradeDay: TradeDay, userId: String) {
        self.id = tradeDay.id.uuidString
        self.userId = userId
        self.date = tradeDay.date.isoString
        self.payload = TradeDayPayloadDTO(
            status: "open",
            trades: tradeDay.trades.map { TradeDTO(from: $0) }
        )
        self.updatedAt = ISO8601DateFormatter().string(from: tradeDay.updatedAt)
        self.deletedAt = tradeDay.deletedAt.map { ISO8601DateFormatter().string(from: $0) }
    }
    
    func toTradeDay() -> TradeDay? {
        guard let uuid = UUID(uuidString: id),
              let localDate = LocalDate(from: date) else {
            return nil
        }
        
        let formatter = ISO8601DateFormatter()
        guard let updatedDate = formatter.date(from: updatedAt) else {
            return nil
        }
        
        let deletedDate = deletedAt.flatMap { formatter.date(from: $0) }
        
        let trades = payload.trades.compactMap { $0.toTrade() }
        
        return TradeDay(
            id: uuid,
            date: localDate,
            trades: trades,
            updatedAt: updatedDate,
            deletedAt: deletedDate
        )
    }
}

extension TradeDTO {
    
    init(from trade: Trade) {
        self.symbol = trade.symbol
        self.action = trade.action.rawValue
        self.market = trade.market.rawValue
        self.quantity = trade.quantity
        self.price = NSDecimalNumber(decimal: trade.price.amount).doubleValue
    }
    
    func toTrade() -> Trade? {
        guard let action = TradeAction(rawValue: action),
              let market = Market(rawValue: market) else {
            return nil
        }
        
        return Trade(
            symbol: symbol,
            action: action,
            market: market,
            quantity: quantity,
            price: Money(price)
        )
    }
}

