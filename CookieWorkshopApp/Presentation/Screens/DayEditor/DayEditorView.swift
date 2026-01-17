import SwiftUI

struct DayEditorView: View {
    
    @StateObject private var viewModel: DayEditorViewModel
    @Environment(\.dismiss) private var dismiss
    
    let onSave: () -> Void
    
    init(viewModel: DayEditorViewModel, onSave: @escaping () -> Void) {
        _viewModel = StateObject(wrappedValue: viewModel)
        self.onSave = onSave
    }
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: AppSpacing.sectionSpacing) {
                    dateSection
                    tradesSection
                    dailySummarySection
                }
                .padding(AppSpacing.screenPadding)
            }
            .background(AppColors.backgroundDark.ignoresSafeArea())
            .navigationTitle(viewModel.isEditing ? "编辑记录" : "添加记录")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") {
                        dismiss()
                    }
                    .foregroundStyle(AppColors.textDark)
                }
                
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") {
                        Task {
                            await viewModel.save()
                            onSave()
                            dismiss()
                        }
                    }
                    .foregroundStyle(AppColors.primary)
                }
                
                if viewModel.isEditing {
                    ToolbarItem(placement: .destructiveAction) {
                        Button("删除") {
                            Task {
                                await viewModel.delete()
                                onSave()
                                dismiss()
                            }
                        }
                        .foregroundStyle(AppColors.danger)
                    }
                }
            }
        }
    }
    
    private var dateSection: some View {
        CardView {
            VStack(alignment: .leading, spacing: AppSpacing.sm) {
                Text("日期")
                    .appSubheadline()
                    .foregroundStyle(AppColors.mutedDark)
                
                DatePicker(
                    "",
                    selection: $viewModel.selectedDate,
                    displayedComponents: .date
                )
                .datePickerStyle(.compact)
                .labelsHidden()
                .disabled(viewModel.isEditing)
            }
        }
    }
    
    private var tradesSection: some View {
        CardView {
            VStack(alignment: .leading, spacing: AppSpacing.md) {
                CardHeaderView("交易明细")
                
                ForEach(viewModel.trades.indices, id: \.self) { index in
                    TradeEntryView(
                        trade: $viewModel.trades[index],
                        onRemove: {
                            viewModel.removeTrade(at: index)
                        }
                    )
                }
                
                Button {
                    viewModel.addTrade()
                } label: {
                    HStack {
                        Text("+ 添加交易")
                            .appSubheadline()
                    }
                    .foregroundStyle(AppColors.primary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, AppSpacing.sm)
                    .background(
                        RoundedRectangle(cornerRadius: AppSpacing.cornerRadiusSmall)
                            .stroke(AppColors.primary.opacity(0.5), style: StrokeStyle(lineWidth: 1, dash: [5]))
                    )
                }
            }
        }
    }
    
    private var dailySummarySection: some View {
        CardView {
            HStack {
                Text("今日已实现损益")
                    .appSubheadline()
                    .foregroundStyle(AppColors.mutedDark)
                
                Spacer()
                
                MoneyText(viewModel.estimatedProfit, showSign: true, size: .medium)
            }
        }
    }
}

struct TradeEntryView: View {
    
    @Binding var trade: TradeEntryData
    let onRemove: () -> Void
    
    var body: some View {
        VStack(spacing: AppSpacing.sm) {
            HStack {
                TextField("股票代码", text: $trade.symbol)
                    .textFieldStyle(.roundedBorder)
                    .textInputAutocapitalization(.characters)
                
                Button(action: onRemove) {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(AppColors.mutedDark)
                }
            }
            
            HStack(spacing: AppSpacing.sm) {
                Picker("操作", selection: $trade.action) {
                    Text("买入").tag(TradeAction.buy)
                    Text("卖出").tag(TradeAction.sell)
                }
                .pickerStyle(.segmented)
                
                Picker("市场", selection: $trade.market) {
                    Text("东证").tag(Market.tse)
                    Text("PTS").tag(Market.pts)
                }
                .pickerStyle(.menu)
            }
            
            HStack(spacing: AppSpacing.sm) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("数量")
                        .appCaption()
                        .foregroundStyle(AppColors.mutedDark)
                    
                    TextField("0", text: $trade.quantityText)
                        .textFieldStyle(.roundedBorder)
                        .keyboardType(.numberPad)
                }
                
                VStack(alignment: .leading, spacing: 4) {
                    Text("单价 (¥)")
                        .appCaption()
                        .foregroundStyle(AppColors.mutedDark)
                    
                    TextField("0.00", text: $trade.priceText)
                        .textFieldStyle(.roundedBorder)
                        .keyboardType(.decimalPad)
                }
            }
            
            HStack {
                Text("金额")
                    .appCaption()
                    .foregroundStyle(AppColors.mutedDark)
                
                Spacer()
                
                Text(trade.totalAmount.formatted())
                    .appSubheadline()
                    .foregroundStyle(AppColors.textDark)
            }
        }
        .padding(AppSpacing.sm)
        .background(
            RoundedRectangle(cornerRadius: AppSpacing.cornerRadiusSmall)
                .fill(AppColors.cardDark.opacity(0.5))
        )
    }
}

struct TradeEntryData: Identifiable {
    let id = UUID()
    var symbol: String = ""
    var action: TradeAction = .buy
    var market: Market = .tse
    var quantityText: String = ""
    var priceText: String = ""
    
    var quantity: Int {
        Int(quantityText) ?? 0
    }
    
    var price: Money {
        guard let decimal = Decimal(string: priceText) else { return .zero }
        return Money(amount: decimal)
    }
    
    var totalAmount: Money {
        price * quantity
    }
    
    func toTrade() -> Trade? {
        guard !symbol.isEmpty, quantity > 0, price.amount > 0 else { return nil }
        return Trade(
            symbol: symbol,
            action: action,
            market: market,
            quantity: quantity,
            price: price
        )
    }
    
    static func from(_ trade: Trade) -> TradeEntryData {
        var entry = TradeEntryData()
        entry.symbol = trade.symbol
        entry.action = trade.action
        entry.market = trade.market
        entry.quantityText = String(trade.quantity)
        entry.priceText = "\(trade.price.amount)"
        return entry
    }
}

