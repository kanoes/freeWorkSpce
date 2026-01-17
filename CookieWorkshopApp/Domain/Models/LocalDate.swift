import Foundation

struct LocalDate: Hashable, Codable, Comparable {
    let year: Int
    let month: Int
    let day: Int
    
    init(year: Int, month: Int, day: Int) {
        self.year = year
        self.month = month
        self.day = day
    }
    
    init(from date: Date, calendar: Calendar = .current) {
        let components = calendar.dateComponents([.year, .month, .day], from: date)
        self.year = components.year ?? 1970
        self.month = components.month ?? 1
        self.day = components.day ?? 1
    }
    
    init?(from string: String) {
        let parts = string.split(separator: "-")
        guard parts.count == 3,
              let year = Int(parts[0]),
              let month = Int(parts[1]),
              let day = Int(parts[2]) else {
            return nil
        }
        self.year = year
        self.month = month
        self.day = day
    }
    
    static var today: LocalDate {
        LocalDate(from: Date())
    }
    
    var isoString: String {
        String(format: "%04d-%02d-%02d", year, month, day)
    }
    
    var monthKey: String {
        String(format: "%04d-%02d", year, month)
    }
    
    func toDate(calendar: Calendar = .current) -> Date? {
        var components = DateComponents()
        components.year = year
        components.month = month
        components.day = day
        return calendar.date(from: components)
    }
    
    func adding(days: Int, calendar: Calendar = .current) -> LocalDate? {
        guard let date = toDate(calendar: calendar),
              let newDate = calendar.date(byAdding: .day, value: days, to: date) else {
            return nil
        }
        return LocalDate(from: newDate, calendar: calendar)
    }
    
    static func < (lhs: LocalDate, rhs: LocalDate) -> Bool {
        if lhs.year != rhs.year { return lhs.year < rhs.year }
        if lhs.month != rhs.month { return lhs.month < rhs.month }
        return lhs.day < rhs.day
    }
}

