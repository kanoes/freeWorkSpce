import SwiftUI

struct TradeTagView: View {
    
    let action: TradeAction
    
    var body: some View {
        Text(action == .buy ? "买入" : "卖出")
            .appCaption()
            .foregroundStyle(.white)
            .padding(.horizontal, AppSpacing.xs)
            .padding(.vertical, 2)
            .background(
                RoundedRectangle(cornerRadius: 4)
                    .fill(action == .buy ? AppColors.success : AppColors.danger)
            )
    }
}

struct MarketTagView: View {
    
    let market: Market
    
    var body: some View {
        Text(market.displayName)
            .appCaption()
            .foregroundStyle(AppColors.textDark)
            .padding(.horizontal, AppSpacing.xs)
            .padding(.vertical, 2)
            .background(
                RoundedRectangle(cornerRadius: 4)
                    .fill(AppColors.mutedDark.opacity(0.3))
            )
    }
}

