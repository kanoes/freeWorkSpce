import Foundation

struct DeleteTradeDayUseCase {
    
    private let repository: TradeDayRepositoryProtocol
    
    init(repository: TradeDayRepositoryProtocol) {
        self.repository = repository
    }
    
    func execute(id: UUID) async throws {
        try await repository.markDeleted(id)
    }
}

