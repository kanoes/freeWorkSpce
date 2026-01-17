import SwiftUI

struct SummaryCardView: View {
    
    let icon: String
    let label: String
    let value: String
    let valueColor: Color
    
    init(icon: String, label: String, value: String, valueColor: Color = AppColors.textDark) {
        self.icon = icon
        self.label = label
        self.value = value
        self.valueColor = valueColor
    }
    
    var body: some View {
        VStack(spacing: AppSpacing.xs) {
            Text(icon)
                .font(.system(size: 24))
            
            Text(label)
                .appCaption()
                .foregroundStyle(AppColors.mutedDark)
            
            Text(value)
                .font(AppTypography.moneyMedium)
                .foregroundStyle(valueColor)
        }
        .frame(maxWidth: .infinity)
        .padding(AppSpacing.sm)
        .background(
            RoundedRectangle(cornerRadius: AppSpacing.cornerRadiusSmall)
                .fill(AppColors.cardDark)
        )
    }
}

