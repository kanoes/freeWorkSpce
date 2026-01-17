import Foundation

struct ImportFromJSONUseCase {
    
    private let repository: TradeDayRepositoryProtocol
    
    init(repository: TradeDayRepositoryProtocol) {
        self.repository = repository
    }
    
    func execute(jsonData: Data) async throws -> Int {
        let decoder = JSONDecoder()
        let exportData = try decoder.decode(ExportData.self, from: jsonData)
        
        var importedCount = 0
        
        for dayData in exportData.days {
            if let tradeDay = dayData.toTradeDay() {
                var updatedDay = tradeDay
                updatedDay.updatedAt = Date()
                try await repository.upsert(updatedDay)
                importedCount += 1
            }
        }
        
        return importedCount
    }
}

struct ExportData: Codable {
    let exportedAt: String?
    let version: String?
    let days: [ExportDayData]
}

struct ExportDayData: Codable {
    let id: String
    let date: String
    let trades: [ExportTradeData]?
    let status: String?
    let updatedAt: String?
    
    func toTradeDay() -> TradeDay? {
        guard let uuid = UUID(uuidString: id),
              let localDate = LocalDate(from: date) else {
            return nil
        }
        
        let convertedTrades = (trades ?? []).compactMap { $0.toTrade() }
        
        return TradeDay(
            id: uuid,
            date: localDate,
            trades: convertedTrades,
            updatedAt: Date()
        )
    }
}

struct ExportTradeData: Codable {
    let symbol: String?
    let action: String?
    let market: String?
    let quantity: IntOrString?
    let price: DoubleOrString?
    let profit: DoubleOrString?
    
    func toTrade() -> Trade? {
        guard let symbol = symbol, !symbol.isEmpty else { return nil }
        
        if let actionString = action,
           let action = TradeAction(rawValue: actionString),
           let market = Market(rawValue: market ?? "tse"),
           let qty = quantity?.intValue,
           let priceValue = price?.decimalValue {
            return Trade(
                symbol: symbol,
                action: action,
                market: market,
                quantity: qty,
                price: Money(amount: priceValue)
            )
        }
        
        if let profitValue = profit?.decimalValue, profitValue != 0 {
            return Trade(
                symbol: symbol,
                action: .sell,
                market: .tse,
                quantity: 100,
                price: Money(amount: abs(profitValue) / 100)
            )
        }
        
        return nil
    }
}

enum IntOrString: Codable {
    case int(Int)
    case string(String)
    
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let intValue = try? container.decode(Int.self) {
            self = .int(intValue)
        } else if let stringValue = try? container.decode(String.self) {
            self = .string(stringValue)
        } else {
            throw DecodingError.typeMismatch(
                IntOrString.self,
                DecodingError.Context(codingPath: decoder.codingPath, debugDescription: "Expected Int or String")
            )
        }
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .int(let value):
            try container.encode(value)
        case .string(let value):
            try container.encode(value)
        }
    }
    
    var intValue: Int? {
        switch self {
        case .int(let value):
            return value
        case .string(let value):
            return Int(value)
        }
    }
}

enum DoubleOrString: Codable {
    case double(Double)
    case string(String)
    
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let doubleValue = try? container.decode(Double.self) {
            self = .double(doubleValue)
        } else if let stringValue = try? container.decode(String.self) {
            self = .string(stringValue)
        } else {
            throw DecodingError.typeMismatch(
                DoubleOrString.self,
                DecodingError.Context(codingPath: decoder.codingPath, debugDescription: "Expected Double or String")
            )
        }
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .double(let value):
            try container.encode(value)
        case .string(let value):
            try container.encode(value)
        }
    }
    
    var decimalValue: Decimal? {
        switch self {
        case .double(let value):
            return Decimal(value)
        case .string(let value):
            return Decimal(string: value)
        }
    }
}

