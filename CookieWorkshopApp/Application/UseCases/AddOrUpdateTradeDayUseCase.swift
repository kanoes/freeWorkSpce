import Foundation

struct AddOrUpdateTradeDayUseCase {
    
    private let repository: TradeDayRepositoryProtocol
    private let validator: TradeDayValidator
    private let tradeValidator: TradeValidator
    
    init(
        repository: TradeDayRepositoryProtocol,
        validator: TradeDayValidator = TradeDayValidator(),
        tradeValidator: TradeValidator = TradeValidator()
    ) {
        self.repository = repository
        self.validator = validator
        self.tradeValidator = tradeValidator
    }
    
    func execute(day: TradeDay) async throws -> TradeDay {
        let existingDays = try await repository.fetchAll()
        
        switch validator.validate(day, existingDays: existingDays) {
        case .success:
            break
        case .failure(let error):
            throw error
        }
        
        let validTrades = tradeValidator.filterValid(day.trades)
        
        var updatedDay = day
        updatedDay.trades = validTrades
        updatedDay.updatedAt = Date()
        
        try await repository.upsert(updatedDay)
        
        return updatedDay
    }
}

