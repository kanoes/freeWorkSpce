import XCTest
@testable import CookieWorkshopApp

final class DividendCalculatorTests: XCTestCase {
    
    func testPositiveProfitDividend() {
        let calculator = DividendCalculator(ratio: DividendRatio(numerator: 1, denominator: 3))
        
        let dividend = calculator.calculateDividend(from: Money(30000))
        
        XCTAssertEqual(dividend.amount, 8000)
    }
    
    func testNegativeProfitDividend() {
        let calculator = DividendCalculator(ratio: DividendRatio(numerator: 1, denominator: 3))
        
        let dividend = calculator.calculateDividend(from: Money(-30000))
        
        XCTAssertEqual(dividend.amount, -10000)
    }
    
    func testZeroProfitDividend() {
        let calculator = DividendCalculator(ratio: DividendRatio(numerator: 1, denominator: 3))
        
        let dividend = calculator.calculateDividend(from: Money.zero)
        
        XCTAssertEqual(dividend.amount, 0)
    }
    
    func testPositiveDividendCeilsUp() {
        let calculator = DividendCalculator(ratio: DividendRatio(numerator: 1, denominator: 3))
        
        let dividend = calculator.calculateDividend(from: Money(10000))
        
        XCTAssertEqual(dividend.amount, 2667)
    }
    
    func testNegativeDividendFloorsDown() {
        let calculator = DividendCalculator(ratio: DividendRatio(numerator: 1, denominator: 3))
        
        let dividend = calculator.calculateDividend(from: Money(-10000))
        
        XCTAssertEqual(dividend.amount, -3334)
    }
    
    func testCustomRatio() {
        let calculator = DividendCalculator(ratio: DividendRatio(numerator: 1, denominator: 2))
        
        let dividend = calculator.calculateDividend(from: Money(10000))
        
        XCTAssertEqual(dividend.amount, 4000)
    }
    
    func testDividendSummary() {
        let calculator = DividendCalculator(ratio: DividendRatio(numerator: 1, denominator: 3))
        let profitCalculator = ProfitCalculator()
        
        let day1 = TradeDay(
            date: LocalDate(year: 2025, month: 1, day: 1),
            trades: [
                Trade(symbol: "1301", action: .buy, market: .tse, quantity: 100, price: Money(1000))
            ]
        )
        
        let day2 = TradeDay(
            date: LocalDate(year: 2025, month: 1, day: 2),
            trades: [
                Trade(symbol: "1301", action: .sell, market: .tse, quantity: 100, price: Money(1100))
            ]
        )
        
        let summary = calculator.calculateDividendSummary(from: [day1, day2], profitCalculator: profitCalculator)
        
        XCTAssertTrue(summary.totalDividend.amount > 0)
        XCTAssertEqual(summary.totalLossShare.amount, 0)
    }
}

