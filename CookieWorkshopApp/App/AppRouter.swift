import SwiftUI

enum AppRoute: Hashable {
    case home
    case dayEditor(TradeDay?)
    case analysis
    case dividend
    case settings
    case signIn
}

@MainActor
final class AppRouter: ObservableObject {
    
    @Published var path = NavigationPath()
    @Published var presentedSheet: AppRoute?
    
    func navigate(to route: AppRoute) {
        path.append(route)
    }
    
    func present(_ route: AppRoute) {
        presentedSheet = route
    }
    
    func dismissSheet() {
        presentedSheet = nil
    }
    
    func popToRoot() {
        path = NavigationPath()
    }
    
    func pop() {
        guard !path.isEmpty else { return }
        path.removeLast()
    }
}

