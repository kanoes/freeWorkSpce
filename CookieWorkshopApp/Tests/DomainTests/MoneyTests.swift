import XCTest
@testable import CookieWorkshopApp

final class MoneyTests: XCTestCase {
    
    func testAddition() {
        let a = Money(100)
        let b = Money(200)
        let result = a + b
        
        XCTAssertEqual(result.amount, 300)
    }
    
    func testSubtraction() {
        let a = Money(300)
        let b = Money(100)
        let result = a - b
        
        XCTAssertEqual(result.amount, 200)
    }
    
    func testMultiplicationByInt() {
        let money = Money(100)
        let result = money * 5
        
        XCTAssertEqual(result.amount, 500)
    }
    
    func testDivisionByInt() {
        let money = Money(500)
        let result = money / 5
        
        XCTAssertEqual(result.amount, 100)
    }
    
    func testDivisionByZeroReturnsZero() {
        let money = Money(500)
        let result = money / 0
        
        XCTAssertEqual(result.amount, 0)
    }
    
    func testIsPositive() {
        XCTAssertTrue(Money(100).isPositive)
        XCTAssertFalse(Money(-100).isPositive)
        XCTAssertFalse(Money(0).isPositive)
    }
    
    func testIsNegative() {
        XCTAssertTrue(Money(-100).isNegative)
        XCTAssertFalse(Money(100).isNegative)
        XCTAssertFalse(Money(0).isNegative)
    }
    
    func testIsZero() {
        XCTAssertTrue(Money(0).isZero)
        XCTAssertTrue(Money.zero.isZero)
        XCTAssertFalse(Money(100).isZero)
    }
    
    func testAbsoluteValue() {
        XCTAssertEqual(Money(-100).absoluteValue.amount, 100)
        XCTAssertEqual(Money(100).absoluteValue.amount, 100)
    }
    
    func testComparison() {
        XCTAssertTrue(Money(100) < Money(200))
        XCTAssertTrue(Money(200) > Money(100))
        XCTAssertTrue(Money(100) == Money(100))
    }
    
    func testFormattedWithSign() {
        let positive = Money(1000)
        XCTAssertTrue(positive.formatted(showSign: true).contains("+"))
        
        let negative = Money(-1000)
        XCTAssertFalse(negative.formatted(showSign: true).contains("+"))
    }
}

