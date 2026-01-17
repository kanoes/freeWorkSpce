import SwiftUI

struct CardView<Content: View>: View {
    
    let content: Content
    
    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }
    
    var body: some View {
        content
            .padding(AppSpacing.cardPadding)
            .background(
                RoundedRectangle(cornerRadius: AppSpacing.cornerRadius)
                    .fill(AppColors.cardDark)
                    .shadow(color: .black.opacity(0.1), radius: 8, x: 0, y: 4)
            )
    }
}

struct CardHeaderView: View {
    
    let title: String
    let icon: String?
    
    init(_ title: String, icon: String? = nil) {
        self.title = title
        self.icon = icon
    }
    
    var body: some View {
        HStack(spacing: AppSpacing.xs) {
            if let icon = icon {
                Text(icon)
                    .font(.system(size: 18))
            }
            
            Text(title)
                .appTitle3()
                .foregroundStyle(AppColors.textDark)
            
            Spacer()
        }
    }
}

