import SwiftUI

struct DividendView: View {
    
    @StateObject private var viewModel: DividendViewModel
    
    init(viewModel: DividendViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel)
    }
    
    var body: some View {
        ScrollView {
            VStack(spacing: AppSpacing.sectionSpacing) {
                ratioSection
                todayDividendSection
                historySection
                summarySection
            }
            .padding(AppSpacing.screenPadding)
        }
        .background(AppColors.backgroundDark.ignoresSafeArea())
        .navigationTitle("股东分红")
        .navigationBarTitleDisplayMode(.inline)
    }
    
    private var ratioSection: some View {
        CardView {
            VStack(alignment: .leading, spacing: AppSpacing.md) {
                CardHeaderView("分红比例", icon: "📊")
                
                HStack(spacing: AppSpacing.sm) {
                    TextField("1", value: $viewModel.numerator, format: .number)
                        .textFieldStyle(.roundedBorder)
                        .keyboardType(.numberPad)
                        .frame(width: 60)
                    
                    Text("/")
                        .appTitle2()
                        .foregroundStyle(AppColors.textDark)
                    
                    TextField("3", value: $viewModel.denominator, format: .number)
                        .textFieldStyle(.roundedBorder)
                        .keyboardType(.numberPad)
                        .frame(width: 60)
                    
                    Spacer()
                }
            }
        }
    }
    
    private var todayDividendSection: some View {
        CardView {
            VStack(alignment: .leading, spacing: AppSpacing.md) {
                CardHeaderView("今日分红", icon: "🎁")
                
                if let todayResult = viewModel.todayDividend {
                    VStack(spacing: AppSpacing.sm) {
                        Text(todayDateText)
                            .appSubheadline()
                            .foregroundStyle(AppColors.mutedDark)
                        
                        HStack {
                            Text("今日收益:")
                                .appSubheadline()
                                .foregroundStyle(AppColors.mutedDark)
                            
                            MoneyText(todayResult.profit, showSign: true, size: .small)
                        }
                        
                        MoneyText(todayResult.dividend, showSign: true, size: .large)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(AppSpacing.md)
                } else {
                    EmptyStateView(icon: "📅", title: "今日暂无交易记录")
                }
            }
        }
    }
    
    private var historySection: some View {
        CardView {
            VStack(alignment: .leading, spacing: AppSpacing.md) {
                CardHeaderView("分红历史", icon: "📜")
                
                if viewModel.dividendHistory.isEmpty {
                    EmptyStateView(icon: "🎁", title: "暂无分红记录")
                } else {
                    ForEach(viewModel.dividendHistory.prefix(10), id: \.date) { result in
                        DividendHistoryRowView(result: result)
                    }
                }
            }
        }
    }
    
    private var summarySection: some View {
        CardView {
            VStack(alignment: .leading, spacing: AppSpacing.md) {
                CardHeaderView("分红汇总", icon: "📊")
                
                VStack(spacing: AppSpacing.sm) {
                    HStack {
                        Text("累计分红")
                            .appSubheadline()
                            .foregroundStyle(AppColors.mutedDark)
                        
                        Spacer()
                        
                        Text(viewModel.summary.totalDividend.formatted())
                            .appSubheadline()
                            .foregroundStyle(AppColors.success)
                    }
                    
                    HStack {
                        Text("累计分担亏损")
                            .appSubheadline()
                            .foregroundStyle(AppColors.mutedDark)
                        
                        Spacer()
                        
                        Text(viewModel.summary.totalLossShare.formatted())
                            .appSubheadline()
                            .foregroundStyle(AppColors.danger)
                    }
                    
                    Divider()
                        .background(AppColors.mutedDark)
                    
                    HStack {
                        Text("净分红")
                            .appHeadline()
                            .foregroundStyle(AppColors.textDark)
                        
                        Spacer()
                        
                        MoneyText(viewModel.summary.netDividend, showSign: true, size: .medium)
                    }
                }
            }
        }
    }
    
    private var todayDateText: String {
        let today = LocalDate.today
        return "\(today.year)年\(today.month)月\(today.day)日"
    }
}

struct DividendHistoryRowView: View {
    
    let result: DividendResult
    
    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("\(result.date.month)月\(result.date.day)日")
                    .appSubheadline()
                    .foregroundStyle(AppColors.textDark)
                
                Text("收益: \(result.profit.formatted(showSign: true))")
                    .appCaption()
                    .foregroundStyle(AppColors.mutedDark)
            }
            
            Spacer()
            
            MoneyText(result.dividend, showSign: true, size: .small)
        }
        .padding(AppSpacing.sm)
        .background(
            RoundedRectangle(cornerRadius: AppSpacing.cornerRadiusSmall)
                .fill(AppColors.cardDark.opacity(0.5))
        )
    }
}

