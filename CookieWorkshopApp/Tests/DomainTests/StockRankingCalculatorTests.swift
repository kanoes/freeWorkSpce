import XCTest
@testable import CookieWorkshopApp

final class StockRankingCalculatorTests: XCTestCase {
    
    private var calculator: StockRankingCalculator!
    
    override func setUp() {
        super.setUp()
        calculator = StockRankingCalculator()
    }
    
    func testEmptyDaysReturnsEmptyRanking() {
        let ranking = calculator.calculateRanking(from: [])
        XCTAssertTrue(ranking.isEmpty)
    }
    
    func testOnlyBuysReturnsEmptyRanking() {
        let day = TradeDay(
            date: LocalDate(year: 2025, month: 1, day: 1),
            trades: [
                Trade(symbol: "1301", action: .buy, market: .tse, quantity: 100, price: Money(1000))
            ]
        )
        
        let ranking = calculator.calculateRanking(from: [day])
        
        XCTAssertTrue(ranking.isEmpty)
    }
    
    func testRankingIncludesStocksWithSells() {
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
        
        let ranking = calculator.calculateRanking(from: [day1, day2])
        
        XCTAssertEqual(ranking.count, 1)
        XCTAssertEqual(ranking.first?.symbol, "1301")
        XCTAssertEqual(ranking.first?.profit.amount, 10000)
        XCTAssertEqual(ranking.first?.buyCount, 1)
        XCTAssertEqual(ranking.first?.sellCount, 1)
    }
    
    func testRankingSortedByProfitDescending() {
        let day1 = TradeDay(
            date: LocalDate(year: 2025, month: 1, day: 1),
            trades: [
                Trade(symbol: "1301", action: .buy, market: .tse, quantity: 100, price: Money(1000)),
                Trade(symbol: "1302", action: .buy, market: .tse, quantity: 100, price: Money(2000))
            ]
        )
        
        let day2 = TradeDay(
            date: LocalDate(year: 2025, month: 1, day: 2),
            trades: [
                Trade(symbol: "1301", action: .sell, market: .tse, quantity: 100, price: Money(1050)),
                Trade(symbol: "1302", action: .sell, market: .tse, quantity: 100, price: Money(2200))
            ]
        )
        
        let ranking = calculator.calculateRanking(from: [day1, day2])
        
        XCTAssertEqual(ranking.count, 2)
        XCTAssertEqual(ranking[0].symbol, "1302")
        XCTAssertEqual(ranking[0].profit.amount, 20000)
        XCTAssertEqual(ranking[1].symbol, "1301")
        XCTAssertEqual(ranking[1].profit.amount, 5000)
    }
    
    func testMultipleTradesPerStock() {
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
        
        let day3 = TradeDay(
            date: LocalDate(year: 2025, month: 1, day: 3),
            trades: [
                Trade(symbol: "1301", action: .sell, market: .tse, quantity: 50, price: Money(1200))
            ]
        )
        
        let ranking = calculator.calculateRanking(from: [day1, day2, day3])
        
        XCTAssertEqual(ranking.count, 1)
        XCTAssertEqual(ranking.first?.buyCount, 1)
        XCTAssertEqual(ranking.first?.sellCount, 2)
        XCTAssertEqual(ranking.first?.profit.amount, 15000)
    }
}

