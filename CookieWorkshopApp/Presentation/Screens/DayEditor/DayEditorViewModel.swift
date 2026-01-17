import Foundation

@MainActor
final class DayEditorViewModel: ObservableObject {
    
    @Published var selectedDate: Date
    @Published var trades: [TradeEntryData]
    
    let repository: TradeDayRepositoryProtocol
    let existingDay: TradeDay?
    
    private let profitCalculator = ProfitCalculator()
    private let holdingsCalculator = HoldingsCalculator()
    
    var isEditing: Bool {
        existingDay != nil
    }
    
    init(repository: TradeDayRepositoryProtocol, existingDay: TradeDay? = nil) {
        self.repository = repository
        self.existingDay = existingDay
        
        if let day = existingDay {
            self.selectedDate = day.date.toDate() ?? Date()
            self.trades = day.trades.map { TradeEntryData.from($0) }
        } else {
            self.selectedDate = Date()
            self.trades = [TradeEntryData()]
        }
    }
    
    var estimatedProfit: Money {
        let validTrades = trades.compactMap { $0.toTrade() }
        
        guard !validTrades.isEmpty else { return .zero }
        
        let localDate = LocalDate(from: selectedDate)
        
        Task {
            let allDays = (try? await repository.fetchAll()) ?? []
            let previousDate = localDate.adding(days: -1)
            var holdings = holdingsCalculator.calculateHoldings(from: allDays, upToDate: previousDate)
            
            for trade in validTrades where trade.action == .buy {
                if holdings[trade.symbol] == nil {
                    holdings[trade.symbol] = Holding(symbol: trade.symbol, market: trade.market)
                }
                holdings[trade.symbol]?.addBuy(
                    quantity: trade.quantity,
                    price: trade.price,
                    market: trade.market
                )
            }
            
            var profit = Money.zero
            
            for trade in validTrades where trade.action == .sell {
                guard var holding = holdings[trade.symbol], !holding.isEmpty else { continue }
                
                let sellQuantity = min(trade.quantity, holding.quantity)
                let costBasis = holding.processSell(quantity: sellQuantity)
                let revenue = trade.price * sellQuantity
                
                profit += revenue - costBasis
                holdings[trade.symbol] = holding
            }
            
            return profit
        }
        
        return .zero
    }
    
    func addTrade() {
        trades.append(TradeEntryData())
    }
    
    func removeTrade(at index: Int) {
        guard trades.count > 1 else { return }
        trades.remove(at: index)
    }
    
    func save() async {
        let localDate = LocalDate(from: selectedDate)
        let validTrades = trades.compactMap { $0.toTrade() }
        
        let day = TradeDay(
            id: existingDay?.id ?? UUID(),
            date: localDate,
            trades: validTrades,
            updatedAt: Date()
        )
        
        try? await repository.upsert(day)
    }
    
    func delete() async {
        guard let day = existingDay else { return }
        try? await repository.markDeleted(day.id)
    }
}

