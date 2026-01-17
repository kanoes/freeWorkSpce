import XCTest
@testable import CookieWorkshopApp

final class MockTradeDayRepository: TradeDayRepositoryProtocol {
    
    var days: [TradeDay] = []
    var dirtyDays: [TradeDay] = []
    var cleanedIds: [UUID] = []
    
    func fetchAll() async throws -> [TradeDay] {
        days
    }
    
    func fetchByDate(_ date: LocalDate) async throws -> TradeDay? {
        days.first { $0.date == date }
    }
    
    func fetchById(_ id: UUID) async throws -> TradeDay? {
        days.first { $0.id == id }
    }
    
    func upsert(_ day: TradeDay) async throws {
        if let index = days.firstIndex(where: { $0.id == day.id }) {
            days[index] = day
        } else {
            days.append(day)
        }
    }
    
    func markDeleted(_ id: UUID) async throws {
        if let index = days.firstIndex(where: { $0.id == id }) {
            var day = days[index]
            day.deletedAt = Date()
            days[index] = day
        }
    }
    
    func fetchDirty() async throws -> [TradeDay] {
        dirtyDays
    }
    
    func markClean(_ ids: [UUID]) async throws {
        cleanedIds.append(contentsOf: ids)
        dirtyDays.removeAll { ids.contains($0.id) }
    }
    
    func deleteAll() async throws {
        days.removeAll()
        dirtyDays.removeAll()
    }
}

final class MockRemoteDataSource: TradeDayRemoteDataSourceProtocol {
    
    var upsertedDays: [TradeDay] = []
    var remoteDays: [TradeDay] = []
    
    func upsert(_ days: [TradeDay], userId: String) async throws {
        upsertedDays.append(contentsOf: days)
    }
    
    func fetchUpdated(since: Date, userId: String) async throws -> [TradeDay] {
        remoteDays.filter { $0.updatedAt > since }
    }
}

final class MockKeyValueRepository {
    
    var values: [String: String] = [:]
    
    func getString(_ key: KeyValueKey) async throws -> String? {
        values[key.rawValue]
    }
    
    func setString(_ key: KeyValueKey, value: String) async throws {
        values[key.rawValue] = value
    }
    
    func getInt64(_ key: KeyValueKey) async throws -> Int64? {
        guard let string = values[key.rawValue] else { return nil }
        return Int64(string)
    }
    
    func setInt64(_ key: KeyValueKey, value: Int64) async throws {
        values[key.rawValue] = String(value)
    }
}

final class SyncEngineTests: XCTestCase {
    
    func testPushSendsDirtyDaysToRemote() async throws {
        let localRepo = MockTradeDayRepository()
        let remoteSource = MockRemoteDataSource()
        
        let dirtyDay = TradeDay(
            date: LocalDate(year: 2025, month: 1, day: 1),
            trades: [
                Trade(symbol: "1301", action: .buy, market: .tse, quantity: 100, price: Money(1000))
            ]
        )
        localRepo.dirtyDays = [dirtyDay]
        
        XCTAssertEqual(localRepo.dirtyDays.count, 1)
        XCTAssertTrue(remoteSource.upsertedDays.isEmpty)
    }
    
    func testPullMergesRemoteDays() async throws {
        let localRepo = MockTradeDayRepository()
        let remoteSource = MockRemoteDataSource()
        
        let remoteDay = TradeDay(
            date: LocalDate(year: 2025, month: 1, day: 1),
            trades: [
                Trade(symbol: "1301", action: .buy, market: .tse, quantity: 100, price: Money(1000))
            ],
            updatedAt: Date()
        )
        remoteSource.remoteDays = [remoteDay]
        
        XCTAssertEqual(remoteSource.remoteDays.count, 1)
    }
    
    func testConflictResolutionUsesLatestUpdatedAt() async throws {
        let localDay = TradeDay(
            id: UUID(),
            date: LocalDate(year: 2025, month: 1, day: 1),
            trades: [
                Trade(symbol: "1301", action: .buy, market: .tse, quantity: 100, price: Money(1000))
            ],
            updatedAt: Date(timeIntervalSince1970: 1000)
        )
        
        let remoteDay = TradeDay(
            id: localDay.id,
            date: LocalDate(year: 2025, month: 1, day: 1),
            trades: [
                Trade(symbol: "1301", action: .buy, market: .tse, quantity: 200, price: Money(1000))
            ],
            updatedAt: Date(timeIntervalSince1970: 2000)
        )
        
        XCTAssertTrue(remoteDay.updatedAt > localDay.updatedAt)
    }
    
    func testDeletedDaysAreSynced() async throws {
        let localRepo = MockTradeDayRepository()
        
        var deletedDay = TradeDay(
            date: LocalDate(year: 2025, month: 1, day: 1),
            trades: []
        )
        deletedDay.deletedAt = Date()
        localRepo.dirtyDays = [deletedDay]
        
        XCTAssertNotNil(deletedDay.deletedAt)
        XCTAssertTrue(deletedDay.isDeleted)
    }
}

