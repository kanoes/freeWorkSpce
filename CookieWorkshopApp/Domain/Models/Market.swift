import Foundation

enum Market: String, Codable, Hashable, CaseIterable {
    case tse
    case pts
    
    var displayName: String {
        switch self {
        case .tse:
            return "東証"
        case .pts:
            return "PTS"
        }
    }
}

