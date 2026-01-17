import SwiftUI
import AuthenticationServices

struct SignInView: View {
    
    @StateObject private var viewModel: SignInViewModel
    
    init(viewModel: SignInViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel)
    }
    
    var body: some View {
        VStack(spacing: AppSpacing.xl) {
            Spacer()
            
            VStack(spacing: AppSpacing.md) {
                Text("🍪")
                    .font(.system(size: 72))
                
                Text("甜饼工坊")
                    .appLargeTitle()
                    .foregroundStyle(AppColors.textDark)
                
                Text("每日交易记录")
                    .appSubheadline()
                    .foregroundStyle(AppColors.mutedDark)
            }
            
            Spacer()
            
            VStack(spacing: AppSpacing.md) {
                SignInWithAppleButton(
                    onRequest: { request in
                        request.requestedScopes = [.email]
                    },
                    onCompletion: { result in
                        Task {
                            await viewModel.handleSignInResult(result)
                        }
                    }
                )
                .signInWithAppleButtonStyle(.white)
                .frame(height: 50)
                .cornerRadius(AppSpacing.cornerRadiusSmall)
                
                Button {
                    viewModel.continueWithoutSignIn()
                } label: {
                    Text("不登录继续使用")
                        .appSubheadline()
                        .foregroundStyle(AppColors.mutedDark)
                }
            }
            .padding(.horizontal, AppSpacing.lg)
            
            Spacer()
                .frame(height: AppSpacing.xxl)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(AppColors.backgroundDark.ignoresSafeArea())
    }
}

@MainActor
final class SignInViewModel: ObservableObject {
    
    @Published var isLoading = false
    @Published var errorMessage: String?
    
    var onSignInComplete: (() -> Void)?
    var onSkipSignIn: (() -> Void)?
    
    func handleSignInResult(_ result: Result<ASAuthorization, Error>) async {
        isLoading = true
        defer { isLoading = false }
        
        switch result {
        case .success(let authorization):
            if let _ = authorization.credential as? ASAuthorizationAppleIDCredential {
                onSignInComplete?()
            }
        case .failure(let error):
            errorMessage = error.localizedDescription
        }
    }
    
    func continueWithoutSignIn() {
        onSkipSignIn?()
    }
}

