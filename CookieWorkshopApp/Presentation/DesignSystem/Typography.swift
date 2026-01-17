import SwiftUI

struct AppTypography {
    
    static let largeTitle = Font.system(size: 34, weight: .bold)
    static let title = Font.system(size: 24, weight: .bold)
    static let title2 = Font.system(size: 20, weight: .semibold)
    static let title3 = Font.system(size: 17, weight: .semibold)
    
    static let headline = Font.system(size: 17, weight: .semibold)
    static let body = Font.system(size: 17, weight: .regular)
    static let callout = Font.system(size: 16, weight: .regular)
    static let subheadline = Font.system(size: 15, weight: .regular)
    static let footnote = Font.system(size: 13, weight: .regular)
    static let caption = Font.system(size: 12, weight: .regular)
    static let caption2 = Font.system(size: 11, weight: .regular)
    
    static let moneyLarge = Font.system(size: 28, weight: .bold).monospacedDigit()
    static let moneyMedium = Font.system(size: 20, weight: .semibold).monospacedDigit()
    static let moneySmall = Font.system(size: 16, weight: .medium).monospacedDigit()
}

extension View {
    
    func appLargeTitle() -> some View {
        self.font(AppTypography.largeTitle)
    }
    
    func appTitle() -> some View {
        self.font(AppTypography.title)
    }
    
    func appTitle2() -> some View {
        self.font(AppTypography.title2)
    }
    
    func appTitle3() -> some View {
        self.font(AppTypography.title3)
    }
    
    func appHeadline() -> some View {
        self.font(AppTypography.headline)
    }
    
    func appBody() -> some View {
        self.font(AppTypography.body)
    }
    
    func appCallout() -> some View {
        self.font(AppTypography.callout)
    }
    
    func appSubheadline() -> some View {
        self.font(AppTypography.subheadline)
    }
    
    func appFootnote() -> some View {
        self.font(AppTypography.footnote)
    }
    
    func appCaption() -> some View {
        self.font(AppTypography.caption)
    }
}

