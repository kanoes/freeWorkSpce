import Foundation

struct ChartDataPoint: Identifiable {
    let id = UUID()
    let label: String
    let value: Decimal
}

@MainActor
final class HomeViewModel: ObservableObject {
    
    @Published var tradeDays: [TradeDay] = []
    @Published var isLoading = false
    
    let repository: TradeDayRepositoryProtocol
    
    private let profitCalculator = ProfitCalculator()
    private let statsCalculator = TradingStatsCalculator()
    
    init(repository: TradeDayRepositoryProtocol) {
        self.repository = repository
    }
    
    var sortedDays: [TradeDay] {
        tradeDays
            .filter { !$0.isDeleted }
            .sorted { $0.date > $1.date }
    }
    
    var totalProfit: Money {
        profitCalculator.calculateTotalProfit(from: tradeDays)
    }
    
    var tradingDays: Int {
        statsCalculator.calculate(from: tradeDays).tradingDays
    }
    
    var winRatePercentage: Int {
        statsCalculator.calculate(from: tradeDays).winRatePercentage
    }
    
    var chartData: [ChartDataPoint] {
        let activeDays = tradeDays
            .filter { !$0.isDeleted }
            .sorted { $0.date < $1.date }
        
        var cumulative = Decimal.zero
        var points: [ChartDataPoint] = []
        
        for day in activeDays {
            let profit = profitCalculator.calculateDayProfit(for: day, allDays: tradeDays)
            cumulative += profit.amount
            
            let label = "\(day.date.month)/\(day.date.day)"
            points.append(ChartDataPoint(label: label, value: cumulative))
        }
        
        return points
    }
    
    func profitForDay(_ day: TradeDay) -> Money {
        profitCalculator.calculateDayProfit(for: day, allDays: tradeDays)
    }
    
    func loadData() async {
        isLoading = true
        defer { isLoading = false }
        
        do {
            tradeDays = try await repository.fetchAll()
        } catch {
            tradeDays = []
        }
    }
}

