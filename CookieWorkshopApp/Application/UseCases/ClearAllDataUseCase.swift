import Foundation

struct ClearAllDataUseCase {
    
    private let repository: TradeDayRepositoryProtocol
    private let kvRepository: KeyValueRepository
    
    init(repository: TradeDayRepositoryProtocol, kvRepository: KeyValueRepository) {
        self.repository = repository
        self.kvRepository = kvRepository
    }
    
    func execute() async throws {
        try await repository.deleteAll()
        try await kvRepository.deleteAll()
    }
}

