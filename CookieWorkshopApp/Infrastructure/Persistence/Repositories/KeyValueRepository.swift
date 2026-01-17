import Foundation
import GRDB

final class KeyValueRepository {
    
    private let database: DatabasePool
    
    init(database: DatabasePool) {
        self.database = database
    }
    
    func getString(_ key: KeyValueKey) async throws -> String? {
        try await database.read { db in
            let record = try KeyValueRecord
                .filter(KeyValueRecord.Columns.key == key.rawValue)
                .fetchOne(db)
            return record?.value
        }
    }
    
    func setString(_ key: KeyValueKey, value: String) async throws {
        let record = KeyValueRecord(key: key.rawValue, value: value)
        
        try await database.write { db in
            try record.save(db)
        }
    }
    
    func getInt(_ key: KeyValueKey) async throws -> Int? {
        guard let string = try await getString(key) else { return nil }
        return Int(string)
    }
    
    func setInt(_ key: KeyValueKey, value: Int) async throws {
        try await setString(key, value: String(value))
    }
    
    func getInt64(_ key: KeyValueKey) async throws -> Int64? {
        guard let string = try await getString(key) else { return nil }
        return Int64(string)
    }
    
    func setInt64(_ key: KeyValueKey, value: Int64) async throws {
        try await setString(key, value: String(value))
    }
    
    func delete(_ key: KeyValueKey) async throws {
        try await database.write { db in
            try KeyValueRecord
                .filter(KeyValueRecord.Columns.key == key.rawValue)
                .deleteAll(db)
        }
    }
    
    func deleteAll() async throws {
        try await database.write { db in
            try KeyValueRecord.deleteAll(db)
        }
    }
}

