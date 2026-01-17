import XCTest
@testable import CookieWorkshopApp

final class ProfitCalculatorTests: XCTestCase {
    
    private var calculator: ProfitCalculator!
    
    override func setUp() {
        super.setUp()
        calculator = ProfitCalculator()
    }
    
    func testNoProfitWithOnlyBuys() {
        let day = TradeDay(
            date: LocalDate(year: 2025, month: 1, day: 1),
            trades: [
                Trade(symbol: "1301", action: .buy, market: .tse, quantity: 100, price: Money(1000))
            ]
        )
        
        let profit = calculator.calculateDayProfit(for: day, allDays: [day])
        
        XCTAssertEqual(profit.amount, 0)
    }
    
    func testProfitFromSell() {
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
        
        let profit = calculator.calculateDayProfit(for: day2, allDays: [day1, day2])
        
        XCTAssertEqual(profit.amount, 10000)
    }
    
    func testLossFromSell() {
        let day1 = TradeDay(
            date: LocalDate(year: 2025, month: 1, day: 1),
            trades: [
                Trade(symbol: "1301", action: .buy, market: .tse, quantity: 100, price: Money(1000))
            ]
        )
        
        let day2 = TradeDay(
            date: LocalDate(year: 2025, month: 1, day: 2),
            trades: [
                Trade(symbol: "1301", action: .sell, market: .tse, quantity: 100, price: Money(900))
            ]
        )
        
        let profit = calculator.calculateDayProfit(for: day2, allDays: [day1, day2])
        
        XCTAssertEqual(profit.amount, -10000)
    }
    
    func testPartialSellUsesAveragePrice() {
        let day1 = TradeDay(
            date: LocalDate(year: 2025, month: 1, day: 1),
            trades: [
                Trade(symbol: "1301", action: .buy, market: .tse, quantity: 100, price: Money(1000)),
                Trade(symbol: "1301", action: .buy, market: .tse, quantity: 100, price: Money(1200))
            ]
        )
        
        let day2 = TradeDay(
            date: LocalDate(year: 2025, month: 1, day: 2),
            trades: [
                Trade(symbol: "1301", action: .sell, market: .tse, quantity: 100, price: Money(1200))
            ]
        )
        
        let profit = calculator.calculateDayProfit(for: day2, allDays: [day1, day2])
        
        XCTAssertEqual(profit.amount, 10000)
    }
    
    func testSameDayBuySellDayTrading() {
        let day = TradeDay(
            date: LocalDate(year: 2025, month: 1, day: 1),
            trades: [
                Trade(symbol: "1301", action: .buy, market: .tse, quantity: 100, price: Money(1000)),
                Trade(symbol: "1301", action: .sell, market: .tse, quantity: 100, price: Money(1100))
            ]
        )
        
        let profit = calculator.calculateDayProfit(for: day, allDays: [day])
        
        XCTAssertEqual(profit.amount, 10000)
    }
    
    func testSellWithoutHoldingReturnsZeroProfit() {
        let day = TradeDay(
            date: LocalDate(year: 2025, month: 1, day: 1),
            trades: [
                Trade(symbol: "1301", action: .sell, market: .tse, quantity: 100, price: Money(1100))
            ]
        )
        
        let profit = calculator.calculateDayProfit(for: day, allDays: [day])
        
        XCTAssertEqual(profit.amount, 0)
    }
    
    func testTotalProfitAcrossMultipleDays() {
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
        
        let totalProfit = calculator.calculateTotalProfit(from: [day1, day2, day3])
        
        XCTAssertEqual(totalProfit.amount, 15000)
    }
    
    func testMonthlyProfitCalculation() {
        let jan1 = TradeDay(
            date: LocalDate(year: 2025, month: 1, day: 1),
            trades: [
                Trade(symbol: "1301", action: .buy, market: .tse, quantity: 100, price: Money(1000))
            ]
        )
        
        let jan2 = TradeDay(
            date: LocalDate(year: 2025, month: 1, day: 15),
            trades: [
                Trade(symbol: "1301", action: .sell, market: .tse, quantity: 100, price: Money(1100))
            ]
        )
        
        let feb1 = TradeDay(
            date: LocalDate(year: 2025, month: 2, day: 1),
            trades: [
                Trade(symbol: "1301", action: .buy, market: .tse, quantity: 100, price: Money(1100))
            ]
        )
        
        let feb2 = TradeDay(
            date: LocalDate(year: 2025, month: 2, day: 15),
            trades: [
                Trade(symbol: "1301", action: .sell, market: .tse, quantity: 100, price: Money(1000))
            ]
        )
        
        let monthlyProfit = calculator.calculateMonthlyProfit(from: [jan1, jan2, feb1, feb2])
        
        XCTAssertEqual(monthlyProfit["2025-01"]?.amount, 10000)
        XCTAssertEqual(monthlyProfit["2025-02"]?.amount, -10000)
    }
}

