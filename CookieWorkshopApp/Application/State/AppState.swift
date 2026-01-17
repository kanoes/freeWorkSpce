import Foundation
import Combine

@MainActor
final class AppState: ObservableObject {
    
    @Published var tradeDays: [TradeDay] = []
    @Published var currentUser: User?
    @Published var isLoading: Bool = false
    @Published var syncStatus: SyncStatus = .idle
    @Published var dividendRatio: DividendRatio = .defaultRatio
    
    var activeTradeDays: [TradeDay] {
        tradeDays.filter { !$0.isDeleted }
    }
    
    var sortedTradeDays: [TradeDay] {
        activeTradeDays.sorted { $0.date > $1.date }
    }
    
    func updateTradeDays(_ days: [TradeDay]) {
        tradeDays = days
    }
    
    func addOrUpdateTradeDay(_ day: TradeDay) {
        if let index = tradeDays.firstIndex(where: { $0.id == day.id }) {
            tradeDays[index] = day
        } else {
            tradeDays.append(day)
        }
    }
    
    func removeTradeDay(_ id: UUID) {
        tradeDays.removeAll { $0.id == id }
    }
    
    func markTradeDayDeleted(_ id: UUID) {
        if let index = tradeDays.firstIndex(where: { $0.id == id }) {
            var day = tradeDays[index]
            day.deletedAt = Date()
            day.updatedAt = Date()
            tradeDays[index] = day
        }
    }
}

enum SyncStatus: Equatable {
    case idle
    case syncing
    case success
    case failed(String)
}

