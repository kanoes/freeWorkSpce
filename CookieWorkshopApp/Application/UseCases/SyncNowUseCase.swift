import Foundation

struct SyncNowUseCase {
    
    private let syncEngine: SyncEngine
    private let authService: AuthServiceProtocol
    
    init(syncEngine: SyncEngine, authService: AuthServiceProtocol) {
        self.syncEngine = syncEngine
        self.authService = authService
    }
    
    func execute() async throws {
        guard let user = await authService.currentUser() else {
            throw SyncError.notAuthenticated
        }
        
        try await syncEngine.sync(userId: user.id.uuidString)
    }
}

enum SyncError: Error {
    case notAuthenticated
    case networkUnavailable
    case syncFailed(String)
}

