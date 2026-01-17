import SwiftUI

struct PrimaryButton: View {
    
    let title: String
    let icon: String?
    let action: () -> Void
    
    init(_ title: String, icon: String? = nil, action: @escaping () -> Void) {
        self.title = title
        self.icon = icon
        self.action = action
    }
    
    var body: some View {
        Button(action: action) {
            HStack(spacing: AppSpacing.xs) {
                if let icon = icon {
                    Text(icon)
                        .font(.system(size: 16))
                }
                
                Text(title)
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
        .buttonStyle(.plain)
    }
}

struct SecondaryButton: View {
    
    let title: String
    let action: () -> Void
    
    init(_ title: String, action: @escaping () -> Void) {
        self.title = title
        self.action = action
    }
    
    var body: some View {
        Button(action: action) {
            Text(title)
                .appHeadline()
                .foregroundStyle(AppColors.textDark)
                .frame(maxWidth: .infinity)
                .padding(.vertical, AppSpacing.sm)
                .background(
                    RoundedRectangle(cornerRadius: AppSpacing.cornerRadiusSmall)
                        .stroke(AppColors.mutedDark, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }
}

struct DangerButton: View {
    
    let title: String
    let action: () -> Void
    
    init(_ title: String, action: @escaping () -> Void) {
        self.title = title
        self.action = action
    }
    
    var body: some View {
        Button(action: action) {
            Text(title)
                .appHeadline()
                .foregroundStyle(AppColors.danger)
                .frame(maxWidth: .infinity)
                .padding(.vertical, AppSpacing.sm)
                .background(
                    RoundedRectangle(cornerRadius: AppSpacing.cornerRadiusSmall)
                        .stroke(AppColors.danger.opacity(0.5), lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }
}

