import Foundation
import GRDB

final class DatabaseManager {
    
    static let shared = DatabaseManager()
    
    private var dbPool: DatabasePool?
    
    private init() {}
    
    var database: DatabasePool {
        guard let pool = dbPool else {
            fatalError("Database not initialized. Call setup() first.")
        }
        return pool
    }
    
    func setup() throws {
        let fileManager = FileManager.default
        let appSupportURL = try fileManager.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        
        let dbURL = appSupportURL.appendingPathComponent("cookieworkshop.sqlite")
        
        var config = Configuration()
        config.foreignKeysEnabled = true
        config.prepareDatabase { db in
            db.trace { _ in }
        }
        
        dbPool = try DatabasePool(path: dbURL.path, configuration: config)
        
        try runMigrations()
    }
    
    private func runMigrations() throws {
        var migrator = DatabaseMigrator()
        
        migrator.registerMigration("v1_create_trade_days") { db in
            try db.create(table: "trade_days_local") { t in
                t.column("id", .text).primaryKey()
                t.column("date", .text).notNull()
                t.column("payload", .text).notNull()
                t.column("updated_at", .integer).notNull()
                t.column("deleted_at", .integer)
                t.column("sync_state", .integer).notNull().defaults(to: 1)
                t.column("last_synced_at", .integer)
            }
            
            try db.create(
                index: "idx_trade_days_date",
                on: "trade_days_local",
                columns: ["date"],
                unique: true,
                ifNotExists: true
            )
            
            try db.create(
                index: "idx_trade_days_sync_state",
                on: "trade_days_local",
                columns: ["sync_state"],
                ifNotExists: true
            )
        }
        
        migrator.registerMigration("v2_create_kv_store") { db in
            try db.create(table: "kv_store") { t in
                t.column("key", .text).primaryKey()
                t.column("value", .text).notNull()
            }
        }
        
        try migrator.migrate(database)
    }
    
    func resetDatabase() throws {
        try database.write { db in
            try db.execute(sql: "DELETE FROM trade_days_local")
            try db.execute(sql: "DELETE FROM kv_store")
        }
    }
}

