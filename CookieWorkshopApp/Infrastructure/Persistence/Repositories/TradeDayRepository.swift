import Foundation
import GRDB

final class TradeDayRepository: TradeDayRepositoryProtocol {
    
    private let database: DatabasePool
    
    init(database: DatabasePool) {
        self.database = database
    }
    
    func fetchAll() async throws -> [TradeDay] {
        try await database.read { db in
            let records = try TradeDayRecord
                .order(TradeDayRecord.Columns.date.desc)
                .fetchAll(db)
            return records.compactMap { $0.toTradeDay() }
        }
    }
    
    func fetchByDate(_ date: LocalDate) async throws -> TradeDay? {
        try await database.read { db in
            let record = try TradeDayRecord
                .filter(TradeDayRecord.Columns.date == date.isoString)
                .fetchOne(db)
            return record?.toTradeDay()
        }
    }
    
    func fetchById(_ id: UUID) async throws -> TradeDay? {
        try await database.read { db in
            let record = try TradeDayRecord
                .filter(TradeDayRecord.Columns.id == id.uuidString)
                .fetchOne(db)
            return record?.toTradeDay()
        }
    }
    
    func upsert(_ day: TradeDay) async throws {
        let record = TradeDayRecord(from: day, syncState: .dirty)
        
        try await database.write { db in
            try record.save(db)
        }
    }
    
    func markDeleted(_ id: UUID) async throws {
        try await database.write { db in
            guard var record = try TradeDayRecord
                .filter(TradeDayRecord.Columns.id == id.uuidString)
                .fetchOne(db) else {
                return
            }
            
            record.deletedAt = Int64(Date().timeIntervalSince1970 * 1000)
            record.updatedAt = Int64(Date().timeIntervalSince1970 * 1000)
            record.syncState = SyncState.dirty.rawValue
            
            try record.update(db)
        }
    }
    
    func fetchDirty() async throws -> [TradeDay] {
        try await database.read { db in
            let records = try TradeDayRecord
                .filter(TradeDayRecord.Columns.syncState == SyncState.dirty.rawValue)
                .fetchAll(db)
            return records.compactMap { $0.toTradeDay() }
        }
    }
    
    func markClean(_ ids: [UUID]) async throws {
        let idStrings = ids.map { $0.uuidString }
        
        try await database.write { db in
            try TradeDayRecord
                .filter(idStrings.contains(TradeDayRecord.Columns.id))
                .updateAll(db, [
                    TradeDayRecord.Columns.syncState.set(to: SyncState.clean.rawValue),
                    TradeDayRecord.Columns.lastSyncedAt.set(to: Int64(Date().timeIntervalSince1970 * 1000))
                ])
        }
    }
    
    func deleteAll() async throws {
        try await database.write { db in
            try TradeDayRecord.deleteAll(db)
        }
    }
    
    func upsertFromRemote(_ day: TradeDay) async throws {
        let record = TradeDayRecord(from: day, syncState: .clean)
        
        try await database.write { db in
            if let existing = try TradeDayRecord
                .filter(TradeDayRecord.Columns.id == record.id)
                .fetchOne(db) {
                
                if existing.updatedAt < record.updatedAt {
                    var updated = record
                    updated.lastSyncedAt = Int64(Date().timeIntervalSince1970 * 1000)
                    try updated.update(db)
                }
            } else {
                var newRecord = record
                newRecord.lastSyncedAt = Int64(Date().timeIntervalSince1970 * 1000)
                try newRecord.insert(db)
            }
        }
    }
}

