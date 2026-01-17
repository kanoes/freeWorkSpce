import SwiftUI
import Charts

struct AnalysisView: View {
    
    @StateObject private var viewModel: AnalysisViewModel
    
    init(viewModel: AnalysisViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel)
    }
    
    var body: some View {
        ScrollView {
            VStack(spacing: AppSpacing.sectionSpacing) {
                summarySection
                holdingsSection
                stockRankingSection
                tradingStatsSection
                monthlyChartSection
                bestWorstDaysSection
            }
            .padding(AppSpacing.screenPadding)
        }
        .background(AppColors.backgroundDark.ignoresSafeArea())
        .navigationTitle("数据分析")
        .navigationBarTitleDisplayMode(.inline)
    }
    
    private var summarySection: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: AppSpacing.sm) {
            SummaryCardView(
                icon: "💹",
                label: "总收益",
                value: viewModel.totalProfit.formatted(),
                valueColor: viewModel.totalProfit.isPositive ? AppColors.success :
                    (viewModel.totalProfit.isNegative ? AppColors.danger : AppColors.textDark)
            )
            
            SummaryCardView(
                icon: "📈",
                label: "盈利天数",
                value: "\(viewModel.stats.winDays)"
            )
            
            SummaryCardView(
                icon: "📉",
                label: "亏损天数",
                value: "\(viewModel.stats.lossDays)"
            )
            
            SummaryCardView(
                icon: "🏷️",
                label: "交易股票数",
                value: "\(viewModel.stats.tradedSymbolCount)"
            )
        }
    }
    
    private var holdingsSection: some View {
        CardView {
            VStack(alignment: .leading, spacing: AppSpacing.md) {
                CardHeaderView("当前持仓", icon: "📦")
                
                if viewModel.holdings.isEmpty {
                    EmptyStateView(icon: "📦", title: "暂无持仓")
                } else {
                    ForEach(viewModel.holdings, id: \.symbol) { holding in
                        HoldingRowView(holding: holding)
                    }
                }
            }
        }
    }
    
    private var stockRankingSection: some View {
        CardView {
            VStack(alignment: .leading, spacing: AppSpacing.md) {
                CardHeaderView("股票损益排行", icon: "📊")
                
                if viewModel.stockRanking.isEmpty {
                    EmptyStateView(
                        icon: "📈",
                        title: "暂无数据",
                        description: "开始记录交易后这里会显示排行"
                    )
                } else {
                    ForEach(Array(viewModel.stockRanking.enumerated()), id: \.element.symbol) { index, entry in
                        StockRankingRowView(rank: index + 1, entry: entry)
                    }
                }
            }
        }
    }
    
    private var tradingStatsSection: some View {
        CardView {
            VStack(alignment: .leading, spacing: AppSpacing.md) {
                CardHeaderView("交易频率", icon: "📈")
                
                VStack(spacing: AppSpacing.sm) {
                    StatRowView(label: "总买入次数", value: "\(viewModel.stats.totalBuyCount)")
                    StatRowView(label: "总卖出次数", value: "\(viewModel.stats.totalSellCount)")
                    StatRowView(label: "平均每日交易", value: String(format: "%.1f", viewModel.stats.averageDailyTrades))
                }
            }
        }
    }
    
    private var monthlyChartSection: some View {
        CardView {
            VStack(alignment: .leading, spacing: AppSpacing.md) {
                CardHeaderView("月度收益", icon: "📅")
                
                if viewModel.monthlyData.isEmpty {
                    EmptyStateView(icon: "📅", title: "暂无数据")
                } else {
                    Chart(viewModel.monthlyData) { item in
                        BarMark(
                            x: .value("月份", item.month),
                            y: .value("收益", item.profit.amount)
                        )
                        .foregroundStyle(item.profit.isPositive ? AppColors.success : AppColors.danger)
                        .cornerRadius(4)
                    }
                    .frame(height: 200)
                    .chartXAxis {
                        AxisMarks { value in
                            AxisValueLabel()
                                .foregroundStyle(AppColors.mutedDark)
                                .font(.caption)
                        }
                    }
                    .chartYAxis {
                        AxisMarks { value in
                            AxisGridLine()
                                .foregroundStyle(AppColors.mutedDark.opacity(0.2))
                            AxisValueLabel()
                                .foregroundStyle(AppColors.mutedDark)
                                .font(.caption)
                        }
                    }
                }
            }
        }
    }
    
    private var bestWorstDaysSection: some View {
        CardView {
            VStack(alignment: .leading, spacing: AppSpacing.md) {
                CardHeaderView("最佳 & 最差交易日", icon: "🏆")
                
                if let best = viewModel.bestDay {
                    DayHighlightView(
                        icon: "🏆",
                        label: "最佳交易日",
                        date: best.day.date,
                        profit: best.profit,
                        isPositive: true
                    )
                }
                
                if let worst = viewModel.worstDay {
                    DayHighlightView(
                        icon: "📉",
                        label: "最差交易日",
                        date: worst.day.date,
                        profit: worst.profit,
                        isPositive: false
                    )
                }
                
                if viewModel.bestDay == nil && viewModel.worstDay == nil {
                    EmptyStateView(icon: "📆", title: "暂无明显盈亏")
                }
            }
        }
    }
}

struct HoldingRowView: View {
    
    let holding: Holding
    
    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(holding.symbol)
                    .appHeadline()
                    .foregroundStyle(AppColors.textDark)
                
                Text("\(holding.market.displayName)")
                    .appCaption()
                    .foregroundStyle(AppColors.mutedDark)
            }
            
            Spacer()
            
            VStack(alignment: .trailing, spacing: 4) {
                Text("\(holding.quantity)股")
                    .appSubheadline()
                    .foregroundStyle(AppColors.textDark)
                
                Text("均价: \(holding.averagePrice.formatted())")
                    .appCaption()
                    .foregroundStyle(AppColors.mutedDark)
                
                Text("市值: \(holding.marketValue.formatted())")
                    .appCaption()
                    .foregroundStyle(AppColors.mutedDark)
            }
        }
        .padding(AppSpacing.sm)
        .background(
            RoundedRectangle(cornerRadius: AppSpacing.cornerRadiusSmall)
                .fill(AppColors.cardDark.opacity(0.5))
        )
    }
}

struct StockRankingRowView: View {
    
    let rank: Int
    let entry: StockRankingEntry
    
    var body: some View {
        HStack(spacing: AppSpacing.md) {
            Text("\(rank)")
                .appHeadline()
                .foregroundStyle(rankColor)
                .frame(width: 24)
            
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.symbol)
                    .appSubheadline()
                    .foregroundStyle(AppColors.textDark)
                
                Text("买\(entry.buyCount)/卖\(entry.sellCount)")
                    .appCaption()
                    .foregroundStyle(AppColors.mutedDark)
            }
            
            Spacer()
            
            MoneyText(entry.profit, showSign: true, size: .small)
        }
        .padding(AppSpacing.sm)
        .background(
            RoundedRectangle(cornerRadius: AppSpacing.cornerRadiusSmall)
                .fill(AppColors.cardDark.opacity(0.5))
        )
    }
    
    private var rankColor: Color {
        switch rank {
        case 1: return Color(hex: "ffd700")
        case 2: return Color(hex: "c0c0c0")
        case 3: return Color(hex: "cd7f32")
        default: return AppColors.mutedDark
        }
    }
}

struct StatRowView: View {
    
    let label: String
    let value: String
    
    var body: some View {
        HStack {
            Text(label)
                .appSubheadline()
                .foregroundStyle(AppColors.mutedDark)
            
            Spacer()
            
            Text(value)
                .appSubheadline()
                .foregroundStyle(AppColors.textDark)
        }
    }
}

struct DayHighlightView: View {
    
    let icon: String
    let label: String
    let date: LocalDate
    let profit: Money
    let isPositive: Bool
    
    var body: some View {
        HStack(spacing: AppSpacing.md) {
            Text(icon)
                .font(.system(size: 28))
            
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .appCaption()
                    .foregroundStyle(AppColors.mutedDark)
                
                Text("\(date.year)年\(date.month)月\(date.day)日")
                    .appSubheadline()
                    .foregroundStyle(AppColors.textDark)
            }
            
            Spacer()
            
            MoneyText(profit, showSign: true, size: .small)
        }
        .padding(AppSpacing.sm)
        .background(
            RoundedRectangle(cornerRadius: AppSpacing.cornerRadiusSmall)
                .fill(isPositive ? AppColors.success.opacity(0.1) : AppColors.danger.opacity(0.1))
        )
    }
}

