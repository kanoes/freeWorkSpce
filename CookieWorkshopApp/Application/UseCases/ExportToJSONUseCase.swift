import Foundation

struct ExportToJSONUseCase {
    
    private let repository: TradeDayRepositoryProtocol
    
    init(repository: TradeDayRepositoryProtocol) {
        self.repository = repository
    }
    
    func execute() async throws -> Data {
        let days = try await repository.fetchAll()
        let activeDays = days.filter { !$0.isDeleted }
        
        let exportDays = activeDays.map { day in
            ExportDayOutput(
                id: day.id.uuidString,
                date: day.date.isoString,
                status: "open",
                trades: day.trades.map { trade in
                    ExportTradeOutput(
                        symbol: trade.symbol,
                        action: trade.action.rawValue,
                        market: trade.market.rawValue,
                        quantity: trade.quantity,
                        price: NSDecimalNumber(decimal: trade.price.amount).doubleValue
                    )
                },
                updatedAt: ISO8601DateFormatter().string(from: day.updatedAt)
            )
        }
        
        let exportData = ExportDataOutput(
            exportedAt: ISO8601DateFormatter().string(from: Date()),
            version: "3.0",
            days: exportDays
        )
        
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        
        return try encoder.encode(exportData)
    }
}

struct ExportDataOutput: Codable {
    let exportedAt: String
    let version: String
    let days: [ExportDayOutput]
}

struct ExportDayOutput: Codable {
    let id: String
    let date: String
    let status: String
    let trades: [ExportTradeOutput]
    let updatedAt: String
}

struct ExportTradeOutput: Codable {
    let symbol: String
    let action: String
    let market: String
    let quantity: Int
    let price: Double
}

