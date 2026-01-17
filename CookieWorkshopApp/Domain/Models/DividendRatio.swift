import Foundation

struct DividendRatio: Codable, Hashable {
    let numerator: Int
    let denominator: Int
    
    static let defaultRatio = DividendRatio(numerator: 1, denominator: 3)
    
    init(numerator: Int, denominator: Int) {
        self.numerator = max(1, numerator)
        self.denominator = max(1, denominator)
    }
    
    var decimalValue: Decimal {
        Decimal(numerator) / Decimal(denominator)
    }
}

