import Foundation

enum TradeDayValidationError: Error {
    case invalidDate
    case duplicateDate
}

struct TradeDayValidator {
    
    func validate(_ day: TradeDay, existingDays: [TradeDay]) -> Result<TradeDay, TradeDayValidationError> {
        let existingDates = Set(
            existingDays
                .filter { $0.id != day.id && !$0.isDeleted }
                .map { $0.date }
        )
        
        if existingDates.contains(day.date) {
            return .failure(.duplicateDate)
        }
        
        return .success(day)
    }
}

