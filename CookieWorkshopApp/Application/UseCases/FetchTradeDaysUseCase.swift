import Foundation

struct FetchTradeDaysUseCase {
    
    private let repository: TradeDayRepositoryProtocol
    
    init(repository: TradeDayRepositoryProtocol) {
        self.repository = repository
    }
    
    func execute() async throws -> [TradeDay] {
        try await repository.fetchAll()
    }
    
    func executeByDate(_ date: LocalDate) async throws -> TradeDay? {
        try await repository.fetchByDate(date)
    }
}

