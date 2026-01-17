import SwiftUI

struct MoneyText: View {
    
    let money: Money
    let showSign: Bool
    let size: MoneySize
    
    enum MoneySize {
        case small
        case medium
        case large
    }
    
    init(_ money: Money, showSign: Bool = false, size: MoneySize = .medium) {
        self.money = money
        self.showSign = showSign
        self.size = size
    }
    
    var body: some View {
        Text(money.formatted(showSign: showSign))
            .font(font)
            .foregroundStyle(color)
    }
    
    private var font: Font {
        switch size {
        case .small:
            return AppTypography.moneySmall
        case .medium:
            return AppTypography.moneyMedium
        case .large:
            return AppTypography.moneyLarge
        }
    }
    
    private var color: Color {
        if money.isPositive {
            return AppColors.success
        } else if money.isNegative {
            return AppColors.danger
        } else {
            return AppColors.mutedDark
        }
    }
}

