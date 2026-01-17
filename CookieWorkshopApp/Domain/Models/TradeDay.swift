import Foundation

struct TradeDay: Identifiable, Hashable, Codable {
    var id: UUID
    var date: LocalDate
    var trades: [Trade]
    var updatedAt: Date
    var deletedAt: Date?
    
    var isDeleted: Bool {
        deletedAt != nil
    }
    
    init(
        id: UUID = UUID(),
        date: LocalDate,
        trades: [Trade] = [],
        updatedAt: Date = Date(),
        deletedAt: Date? = nil
    ) {
        self.id = id
        self.date = date
        self.trades = trades
        self.updatedAt = updatedAt
        self.deletedAt = deletedAt
    }
    
    var buyTrades: [Trade] {
        trades.filter { $0.action == .buy }
    }
    
    var sellTrades: [Trade] {
        trades.filter { $0.action == .sell }
    }
    
    var tradedSymbols: Set<String> {
        Set(trades.map { $0.symbol })
    }
}

