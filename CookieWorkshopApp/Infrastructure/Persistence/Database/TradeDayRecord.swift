import Foundation
import GRDB

struct TradeDayRecord: Codable, FetchableRecord, PersistableRecord {
    
    static let databaseTableName = "trade_days_local"
    
    var id: String
    var date: String
    var payload: String
    var updatedAt: Int64
    var deletedAt: Int64?
    var syncState: Int
    var lastSyncedAt: Int64?
    
    enum Columns {
        static let id = Column(CodingKeys.id)
        static let date = Column(CodingKeys.date)
        static let payload = Column(CodingKeys.payload)
        static let updatedAt = Column(CodingKeys.updatedAt)
        static let deletedAt = Column(CodingKeys.deletedAt)
        static let syncState = Column(CodingKeys.syncState)
        static let lastSyncedAt = Column(CodingKeys.lastSyncedAt)
    }
}

extension TradeDayRecord {
    
    init(from tradeDay: TradeDay, syncState: SyncState) {
        self.id = tradeDay.id.uuidString
        self.date = tradeDay.date.isoString
        self.payload = Self.encodePayload(trades: tradeDay.trades)
        self.updatedAt = Int64(tradeDay.updatedAt.timeIntervalSince1970 * 1000)
        self.deletedAt = tradeDay.deletedAt.map { Int64($0.timeIntervalSince1970 * 1000) }
        self.syncState = syncState.rawValue
        self.lastSyncedAt = nil
    }
    
    func toTradeDay() -> TradeDay? {
        guard let uuid = UUID(uuidString: id),
              let localDate = LocalDate(from: date) else {
            return nil
        }
        
        let trades = Self.decodePayload(payload)
        let updated = Date(timeIntervalSince1970: Double(updatedAt) / 1000)
        let deleted = deletedAt.map { Date(timeIntervalSince1970: Double($0) / 1000) }
        
        return TradeDay(
            id: uuid,
            date: localDate,
            trades: trades,
            updatedAt: updated,
            deletedAt: deleted
        )
    }
    
    private static func encodePayload(trades: [Trade]) -> String {
        let payload = TradeDayPayload(trades: trades.map(TradePayload.init))
        let encoder = JSONEncoder()
        guard let data = try? encoder.encode(payload),
              let string = String(data: data, encoding: .utf8) else {
            return "{\"trades\":[]}"
        }
        return string
    }
    
    private static func decodePayload(_ payloadString: String) -> [Trade] {
        guard let data = payloadString.data(using: .utf8) else { return [] }
        let decoder = JSONDecoder()
        guard let payload = try? decoder.decode(TradeDayPayload.self, from: data) else { return [] }
        return payload.trades.compactMap { $0.toTrade() }
    }
}

struct TradeDayPayload: Codable {
    let trades: [TradePayload]
}

struct TradePayload: Codable {
    let symbol: String
    let action: String
    let market: String
    let quantity: Int
    let price: String
    
    init(from trade: Trade) {
        self.symbol = trade.symbol
        self.action = trade.action.rawValue
        self.market = trade.market.rawValue
        self.quantity = trade.quantity
        self.price = "\(trade.price.amount)"
    }
    
    func toTrade() -> Trade? {
        guard let action = TradeAction(rawValue: action),
              let market = Market(rawValue: market),
              let priceDecimal = Decimal(string: price) else {
            return nil
        }
        
        return Trade(
            symbol: symbol,
            action: action,
            market: market,
            quantity: quantity,
            price: Money(amount: priceDecimal)
        )
    }
}

