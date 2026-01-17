import XCTest
@testable import CookieWorkshopApp

final class TradeDayRecordTests: XCTestCase {
    
    func testConversionFromTradeDay() {
        let tradeDay = TradeDay(
            id: UUID(),
            date: LocalDate(year: 2025, month: 1, day: 15),
            trades: [
                Trade(symbol: "1301", action: .buy, market: .tse, quantity: 100, price: Money(1000))
            ],
            updatedAt: Date()
        )
        
        let record = TradeDayRecord(from: tradeDay, syncState: .dirty)
        
        XCTAssertEqual(record.id, tradeDay.id.uuidString)
        XCTAssertEqual(record.date, "2025-01-15")
        XCTAssertEqual(record.syncState, SyncState.dirty.rawValue)
    }
    
    func testConversionToTradeDay() {
        let record = TradeDayRecord(
            id: UUID().uuidString,
            date: "2025-01-15",
            payload: "{\"trades\":[{\"symbol\":\"1301\",\"action\":\"buy\",\"market\":\"tse\",\"quantity\":100,\"price\":\"1000\"}]}",
            updatedAt: Int64(Date().timeIntervalSince1970 * 1000),
            deletedAt: nil,
            syncState: 0,
            lastSyncedAt: nil
        )
        
        let tradeDay = record.toTradeDay()
        
        XCTAssertNotNil(tradeDay)
        XCTAssertEqual(tradeDay?.date.year, 2025)
        XCTAssertEqual(tradeDay?.date.month, 1)
        XCTAssertEqual(tradeDay?.date.day, 15)
        XCTAssertEqual(tradeDay?.trades.count, 1)
        XCTAssertEqual(tradeDay?.trades.first?.symbol, "1301")
    }
    
    func testRoundTripConversion() {
        let originalDay = TradeDay(
            id: UUID(),
            date: LocalDate(year: 2025, month: 1, day: 15),
            trades: [
                Trade(symbol: "1301", action: .buy, market: .tse, quantity: 100, price: Money(1000)),
                Trade(symbol: "1302", action: .sell, market: .pts, quantity: 50, price: Money(2000))
            ],
            updatedAt: Date()
        )
        
        let record = TradeDayRecord(from: originalDay, syncState: .dirty)
        let convertedDay = record.toTradeDay()
        
        XCTAssertNotNil(convertedDay)
        XCTAssertEqual(convertedDay?.id, originalDay.id)
        XCTAssertEqual(convertedDay?.date, originalDay.date)
        XCTAssertEqual(convertedDay?.trades.count, originalDay.trades.count)
    }
    
    func testDeletedAtConversion() {
        let deletedAt = Date()
        var tradeDay = TradeDay(
            date: LocalDate(year: 2025, month: 1, day: 15),
            trades: []
        )
        tradeDay.deletedAt = deletedAt
        
        let record = TradeDayRecord(from: tradeDay, syncState: .dirty)
        let convertedDay = record.toTradeDay()
        
        XCTAssertNotNil(record.deletedAt)
        XCTAssertNotNil(convertedDay?.deletedAt)
        XCTAssertTrue(convertedDay?.isDeleted ?? false)
    }
    
    func testInvalidRecordReturnsNil() {
        let record = TradeDayRecord(
            id: "invalid-uuid",
            date: "invalid-date",
            payload: "{}",
            updatedAt: 0,
            deletedAt: nil,
            syncState: 0,
            lastSyncedAt: nil
        )
        
        let tradeDay = record.toTradeDay()
        
        XCTAssertNil(tradeDay)
    }
}

