import Foundation
import GRDB

struct KeyValueRecord: Codable, FetchableRecord, PersistableRecord {
    
    static let databaseTableName = "kv_store"
    
    var key: String
    var value: String
    
    enum Columns {
        static let key = Column(CodingKeys.key)
        static let value = Column(CodingKeys.value)
    }
}

enum KeyValueKey: String {
    case lastPullAt
    case currentUserId
    case appDataVersion
    case dividendNumerator
    case dividendDenominator
}

