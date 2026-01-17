import Foundation

struct Money: Hashable, Codable {
    let amount: Decimal
    
    static let zero = Money(amount: .zero)
    
    init(amount: Decimal) {
        self.amount = amount
    }
    
    init(_ intValue: Int) {
        self.amount = Decimal(intValue)
    }
    
    init(_ doubleValue: Double) {
        self.amount = Decimal(doubleValue)
    }
    
    static func + (lhs: Money, rhs: Money) -> Money {
        Money(amount: lhs.amount + rhs.amount)
    }
    
    static func - (lhs: Money, rhs: Money) -> Money {
        Money(amount: lhs.amount - rhs.amount)
    }
    
    static func * (lhs: Money, rhs: Decimal) -> Money {
        Money(amount: lhs.amount * rhs)
    }
    
    static func * (lhs: Money, rhs: Int) -> Money {
        Money(amount: lhs.amount * Decimal(rhs))
    }
    
    static func / (lhs: Money, rhs: Decimal) -> Money {
        guard rhs != .zero else { return .zero }
        return Money(amount: lhs.amount / rhs)
    }
    
    static func / (lhs: Money, rhs: Int) -> Money {
        guard rhs != 0 else { return .zero }
        return Money(amount: lhs.amount / Decimal(rhs))
    }
    
    static func += (lhs: inout Money, rhs: Money) {
        lhs = lhs + rhs
    }
    
    static func -= (lhs: inout Money, rhs: Money) {
        lhs = lhs - rhs
    }
    
    var isPositive: Bool {
        amount > .zero
    }
    
    var isNegative: Bool {
        amount < .zero
    }
    
    var isZero: Bool {
        amount == .zero
    }
    
    var absoluteValue: Money {
        Money(amount: abs(amount))
    }
    
    func formatted(showSign: Bool = false) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencySymbol = "¥"
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = 2
        
        let nsNumber = NSDecimalNumber(decimal: amount)
        let formatted = formatter.string(from: nsNumber) ?? "¥0"
        
        if showSign && isPositive {
            return "+" + formatted
        }
        return formatted
    }
}

extension Money: Comparable {
    static func < (lhs: Money, rhs: Money) -> Bool {
        lhs.amount < rhs.amount
    }
}

