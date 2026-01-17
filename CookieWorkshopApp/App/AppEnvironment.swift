import Foundation
import GRDB

@MainActor
final class AppEnvironment: ObservableObject {
    
    @Published var isInitialized = false
    @Published var currentUser: User?
    
    private(set) var databaseManager: DatabaseManager?
    private(set) var tradeDayRepository: TradeDayRepository!
    private(set) var kvRepository: KeyValueRepository!
    
    func initialize() async {
        do {
            let dbManager = DatabaseManager.shared
            try dbManager.setup()
            databaseManager = dbManager
            
            tradeDayRepository = TradeDayRepository(database: dbManager.database)
            kvRepository = KeyValueRepository(database: dbManager.database)
            
            isInitialized = true
        } catch {
            isInitialized = false
        }
    }
}

