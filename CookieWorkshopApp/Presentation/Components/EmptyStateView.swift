import SwiftUI

struct EmptyStateView: View {
    
    let icon: String
    let title: String
    let description: String?
    
    init(icon: String, title: String, description: String? = nil) {
        self.icon = icon
        self.title = title
        self.description = description
    }
    
    var body: some View {
        VStack(spacing: AppSpacing.sm) {
            Text(icon)
                .font(.system(size: 48))
            
            Text(title)
                .appHeadline()
                .foregroundStyle(AppColors.textDark)
            
            if let description = description {
                Text(description)
                    .appSubheadline()
                    .foregroundStyle(AppColors.mutedDark)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(AppSpacing.xl)
    }
}

