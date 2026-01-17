import Foundation

enum SyncState: Int, Codable {
    case clean = 0
    case dirty = 1
}

