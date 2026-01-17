import SwiftUI

struct HomeView: View {
    
    @StateObject private var viewModel: HomeViewModel
    @State private var showingDayEditor = false
    @State private var showingSettings = false
    @State private var selectedDay: TradeDay?
    
    init(viewModel: HomeViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel)
    }
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: AppSpacing.sectionSpacing) {
                    headerSection
                    summarySection
                    chartSection
                    actionButtonsSection
                    recordsSection
                }
                .padding(AppSpacing.screenPadding)
            }
            .background(AppColors.backgroundDark.ignoresSafeArea())
            .navigationBarHidden(true)
            .sheet(isPresented: $showingDayEditor) {
                DayEditorView(
                    viewModel: DayEditorViewModel(
                        repository: viewModel.repository,
                        existingDay: selectedDay
                    ),
                    onSave: {
                        Task { await viewModel.loadData() }
                    }
                )
            }
            .sheet(isPresented: $showingSettings) {
                SettingsView(viewModel: SettingsViewModel(repository: viewModel.repository))
            }
            .task {
                await viewModel.loadData()
            }
        }
    }
    
    private var headerSection: some View {
        HStack {
            HStack(spacing: AppSpacing.sm) {
                Text("🍪")
                    .font(.system(size: 32))
                
                VStack(alignment: .leading, spacing: 2) {
                    Text("甜饼工坊")
                        .appTitle2()
                        .foregroundStyle(AppColors.textDark)
                    
                    Text("每日交易记录")
                        .appCaption()
                        .foregroundStyle(AppColors.mutedDark)
                }
            }
            
            Spacer()
            
            Button {
                showingSettings = true
            } label: {
                Image(systemName: "gearshape.fill")
                    .font(.system(size: 20))
                    .foregroundStyle(AppColors.mutedDark)
                    .frame(width: 44, height: 44)
                    .background(
                        Circle()
                            .fill(AppColors.cardDark)
                    )
            }
        }
    }
    
    private var summarySection: some View {
        HStack(spacing: AppSpacing.sm) {
            SummaryCardView(
                icon: "💰",
                label: "总收益",
                value: viewModel.totalProfit.formatted(),
                valueColor: viewModel.totalProfit.isPositive ? AppColors.success :
                    (viewModel.totalProfit.isNegative ? AppColors.danger : AppColors.textDark)
            )
            
            SummaryCardView(
                icon: "📊",
                label: "交易天数",
                value: "\(viewModel.tradingDays)天"
            )
            
            SummaryCardView(
                icon: "🎯",
                label: "胜率",
                value: "\(viewModel.winRatePercentage)%"
            )
        }
    }
    
    private var chartSection: some View {
        CardView {
            VStack(alignment: .leading, spacing: AppSpacing.md) {
                CardHeaderView("收益趋势")
                
                ProfitChartView(data: viewModel.chartData)
                    .frame(height: 200)
            }
        }
    }
    
    private var actionButtonsSection: some View {
        HStack(spacing: AppSpacing.sm) {
            Button {
                selectedDay = nil
                showingDayEditor = true
            } label: {
                HStack(spacing: AppSpacing.xs) {
                    Text("+")
                        .font(.system(size: 20, weight: .bold))
                    Text("添加记录")
                        .appHeadline()
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, AppSpacing.sm)
                .background(
                    RoundedRectangle(cornerRadius: AppSpacing.cornerRadiusSmall)
                        .fill(AppColors.primary)
                )
            }
            
            NavigationLink(destination: DividendView(viewModel: DividendViewModel(days: viewModel.tradeDays))) {
                VStack(spacing: 4) {
                    Text("🎁")
                    Text("分红")
                        .appCaption()
                }
                .foregroundStyle(AppColors.textDark)
                .frame(width: 60, height: 60)
                .background(
                    RoundedRectangle(cornerRadius: AppSpacing.cornerRadiusSmall)
                        .fill(AppColors.cardDark)
                )
            }
            
            NavigationLink(destination: AnalysisView(viewModel: AnalysisViewModel(days: viewModel.tradeDays))) {
                VStack(spacing: 4) {
                    Text("📊")
                    Text("分析")
                        .appCaption()
                }
                .foregroundStyle(AppColors.textDark)
                .frame(width: 60, height: 60)
                .background(
                    RoundedRectangle(cornerRadius: AppSpacing.cornerRadiusSmall)
                        .fill(AppColors.cardDark)
                )
            }
        }
    }
    
    private var recordsSection: some View {
        CardView {
            VStack(alignment: .leading, spacing: AppSpacing.md) {
                CardHeaderView("交易记录", icon: "📝")
                
                if viewModel.sortedDays.isEmpty {
                    EmptyStateView(
                        icon: "📝",
                        title: "还没有记录",
                        description: "点击上方按钮开始记录你的第一天"
                    )
                } else {
                    LazyVStack(spacing: AppSpacing.sm) {
                        ForEach(viewModel.sortedDays) { day in
                            RecordRowView(day: day, profit: viewModel.profitForDay(day))
                                .onTapGesture {
                                    selectedDay = day
                                    showingDayEditor = true
                                }
                        }
                    }
                }
            }
        }
    }
}

struct RecordRowView: View {
    
    let day: TradeDay
    let profit: Money
    
    var body: some View {
        HStack(spacing: AppSpacing.md) {
            VStack(spacing: 2) {
                Text("\(day.date.day)")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(AppColors.textDark)
                
                Text(monthText)
                    .appCaption()
                    .foregroundStyle(AppColors.mutedDark)
            }
            .frame(width: 44)
            
            VStack(alignment: .leading, spacing: 4) {
                Text(tradesInfo)
                    .appSubheadline()
                    .foregroundStyle(AppColors.textDark)
                    .lineLimit(1)
            }
            
            Spacer()
            
            MoneyText(profit, showSign: true, size: .small)
        }
        .padding(AppSpacing.sm)
        .background(
            RoundedRectangle(cornerRadius: AppSpacing.cornerRadiusSmall)
                .fill(AppColors.cardDark.opacity(0.5))
        )
    }
    
    private var monthText: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "M月"
        return day.date.toDate().map { formatter.string(from: $0) } ?? ""
    }
    
    private var tradesInfo: String {
        if day.trades.isEmpty {
            return "无交易记录"
        }
        
        let symbols = day.tradedSymbols.joined(separator: ", ")
        let buyCount = day.buyTrades.count
        let sellCount = day.sellTrades.count
        
        return "\(symbols) (买\(buyCount)/卖\(sellCount))"
    }
}

