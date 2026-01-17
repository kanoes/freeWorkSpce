import SwiftUI

@main
struct CookieWorkshopApp: App {
    
    @StateObject private var appEnvironment = AppEnvironment()
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appEnvironment)
                .task {
                    await appEnvironment.initialize()
                }
        }
    }
}

struct ContentView: View {
    
    @EnvironmentObject private var environment: AppEnvironment
    
    var body: some View {
        Group {
            if environment.isInitialized {
                HomeView(viewModel: HomeViewModel(repository: environment.tradeDayRepository))
            } else {
                LoadingView()
            }
        }
    }
}

struct LoadingView: View {
    
    var body: some View {
        VStack(spacing: AppSpacing.md) {
            Text("🍪")
                .font(.system(size: 64))
            
            ProgressView()
                .tint(AppColors.primary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(AppColors.backgroundDark.ignoresSafeArea())
    }
}

