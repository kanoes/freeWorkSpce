import Foundation

struct Company: Codable, Hashable, Identifiable {
    var id: String { code }
    let code: String
    let name: String
    let market: String
    
    init(code: String, name: String, market: String) {
        self.code = code.uppercased()
        self.name = name
        self.market = market
    }
}

