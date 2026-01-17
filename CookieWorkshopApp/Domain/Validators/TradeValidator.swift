import Foundation

enum TradeValidationError: Error {
    case emptySymbol
    case invalidQuantity
    case invalidPrice
}

struct TradeValidator {
    
    func validate(_ trade: Trade) -> Result<Trade, TradeValidationError> {
        if trade.symbol.trimmingCharacters(in: .whitespaces).isEmpty {
            return .failure(.emptySymbol)
        }
        
        if trade.quantity <= 0 {
            return .failure(.invalidQuantity)
        }
        
        if trade.price.amount <= 0 {
            return .failure(.invalidPrice)
        }
        
        return .success(trade)
    }
    
    func validateAll(_ trades: [Trade]) -> [Result<Trade, TradeValidationError>] {
        trades.map(validate)
    }
    
    func filterValid(_ trades: [Trade]) -> [Trade] {
        trades.filter { trade in
            switch validate(trade) {
            case .success:
                return true
            case .failure:
                return false
            }
        }
    }
}

