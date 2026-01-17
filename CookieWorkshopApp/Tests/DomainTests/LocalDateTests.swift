import XCTest
@testable import CookieWorkshopApp

final class LocalDateTests: XCTestCase {
    
    func testInitFromComponents() {
        let date = LocalDate(year: 2025, month: 1, day: 15)
        
        XCTAssertEqual(date.year, 2025)
        XCTAssertEqual(date.month, 1)
        XCTAssertEqual(date.day, 15)
    }
    
    func testInitFromString() {
        let date = LocalDate(from: "2025-01-15")
        
        XCTAssertNotNil(date)
        XCTAssertEqual(date?.year, 2025)
        XCTAssertEqual(date?.month, 1)
        XCTAssertEqual(date?.day, 15)
    }
    
    func testInitFromInvalidStringReturnsNil() {
        let date = LocalDate(from: "invalid")
        XCTAssertNil(date)
    }
    
    func testIsoString() {
        let date = LocalDate(year: 2025, month: 1, day: 5)
        XCTAssertEqual(date.isoString, "2025-01-05")
    }
    
    func testMonthKey() {
        let date = LocalDate(year: 2025, month: 1, day: 15)
        XCTAssertEqual(date.monthKey, "2025-01")
    }
    
    func testComparison() {
        let earlier = LocalDate(year: 2025, month: 1, day: 1)
        let later = LocalDate(year: 2025, month: 1, day: 15)
        
        XCTAssertTrue(earlier < later)
        XCTAssertTrue(later > earlier)
    }
    
    func testComparisonAcrossMonths() {
        let jan = LocalDate(year: 2025, month: 1, day: 31)
        let feb = LocalDate(year: 2025, month: 2, day: 1)
        
        XCTAssertTrue(jan < feb)
    }
    
    func testComparisonAcrossYears() {
        let dec = LocalDate(year: 2024, month: 12, day: 31)
        let jan = LocalDate(year: 2025, month: 1, day: 1)
        
        XCTAssertTrue(dec < jan)
    }
    
    func testAddingDays() {
        let date = LocalDate(year: 2025, month: 1, day: 1)
        let nextDay = date.adding(days: 1)
        
        XCTAssertEqual(nextDay?.day, 2)
    }
    
    func testAddingNegativeDays() {
        let date = LocalDate(year: 2025, month: 1, day: 15)
        let previousDay = date.adding(days: -1)
        
        XCTAssertEqual(previousDay?.day, 14)
    }
}

