import XCTest
@testable import CookieWorkshopApp

final class HoldingsCalculatorTests: XCTestCase {
    
    private var calculator: HoldingsCalculator!
    
    override func setUp() {
        super.setUp()
        calculator = HoldingsCalculator()
    }
    
    func testEmptyDaysReturnsEmptyHoldings() {
        let holdings = calculator.calculateHoldings(from: [])
        XCTAssertTrue(holdings.isEmpty)
    }
    
    func testSingleBuyCreatesHolding() {
        let day = TradeDay(
            date: LocalDate(year: 2025, month: 1, day: 1),
            trades: [
                Trade(symbol: "1301", action: .buy, market: .tse, quantity: 100, price: Money(1000))
            ]
        )
        
        let holdings = calculator.calculateHoldings(from: [day])
        
        XCTAssertEqual(holdings.count, 1)
        XCTAssertEqual(holdings["1301"]?.quantity, 100)
        XCTAssertEqual(holdings["1301"]?.averagePrice.amount, 1000)
    }
    
    func testMultipleBuysCalculatesAveragePrice() {
        let day = TradeDay(
            date: LocalDate(year: 2025, month: 1, day: 1),
            trades: [
                Trade(symbol: "1301", action: .buy, market: .tse, quantity: 100, price: Money(1000)),
                Trade(symbol: "1301", action: .buy, market: .tse, quantity: 100, price: Money(1200))
            ]
        )
        
        let holdings = calculator.calculateHoldings(from: [day])
        
        XCTAssertEqual(holdings["1301"]?.quantity, 200)
        XCTAssertEqual(holdings["1301"]?.averagePrice.amount, 1100)
    }
    
    func testSellReducesHolding() {
        let day1 = TradeDay(
            date: LocalDate(year: 2025, month: 1, day: 1),
            trades: [
                Trade(symbol: "1301", action: .buy, market: .tse, quantity: 100, price: Money(1000))
            ]
        )
        
        let day2 = TradeDay(
            date: LocalDate(year: 2025, month: 1, day: 2),
            trades: [
                Trade(symbol: "1301", action: .sell, market: .tse, quantity: 50, price: Money(1100))
            ]
        )
        
        let holdings = calculator.calculateHoldings(from: [day1, day2])
        
        XCTAssertEqual(holdings["1301"]?.quantity, 50)
    }
    
    func testFullSellRemovesHolding() {
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
        
        let holdings = calculator.calculateHoldings(from: [day1, day2])
        
        XCTAssertNil(holdings["1301"])
    }
    
    func testSameDayBuySellProcessesBuysFirst() {
        let day = TradeDay(
            date: LocalDate(year: 2025, month: 1, day: 1),
            trades: [
                Trade(symbol: "1301", action: .sell, market: .tse, quantity: 50, price: Money(1100)),
                Trade(symbol: "1301", action: .buy, market: .tse, quantity: 100, price: Money(1000))
            ]
        )
        
        let holdings = calculator.calculateHoldings(from: [day])
        
        XCTAssertEqual(holdings["1301"]?.quantity, 50)
    }
    
    func testUpToDateFiltersLaterDays() {
        let day1 = TradeDay(
            date: LocalDate(year: 2025, month: 1, day: 1),
            trades: [
                Trade(symbol: "1301", action: .buy, market: .tse, quantity: 100, price: Money(1000))
            ]
        )
        
        let day2 = TradeDay(
            date: LocalDate(year: 2025, month: 1, day: 3),
            trades: [
                Trade(symbol: "1301", action: .buy, market: .tse, quantity: 100, price: Money(1200))
            ]
        )
        
        let holdings = calculator.calculateHoldings(
            from: [day1, day2],
            upToDate: LocalDate(year: 2025, month: 1, day: 2)
        )
        
        XCTAssertEqual(holdings["1301"]?.quantity, 100)
        XCTAssertEqual(holdings["1301"]?.averagePrice.amount, 1000)
    }
    
    func testDeletedDaysAreIgnored() {
        let day = TradeDay(
            date: LocalDate(year: 2025, month: 1, day: 1),
            trades: [
                Trade(symbol: "1301", action: .buy, market: .tse, quantity: 100, price: Money(1000))
            ],
            deletedAt: Date()
        )
        
        let holdings = calculator.calculateHoldings(from: [day])
        
        XCTAssertTrue(holdings.isEmpty)
    }
}

