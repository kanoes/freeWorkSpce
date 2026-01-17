import SwiftUI

extension Color {
    
    static let appPrimary = Color("AccentPrimary")
    static let appSuccess = Color("AccentSuccess")
    static let appDanger = Color("AccentDanger")
    static let appWarning = Color("AccentWarning")
    
    static let bgPrimary = Color("BgPrimary")
    static let bgSecondary = Color("BgSecondary")
    static let bgCard = Color("BgCard")
    static let bgCardHover = Color("BgCardHover")
    
    static let textPrimary = Color("TextPrimary")
    static let textSecondary = Color("TextSecondary")
    static let textMuted = Color("TextMuted")
    
    static let borderDefault = Color("BorderDefault")
    static let borderLight = Color("BorderLight")
}

struct AppColors {
    
    static let primary = Color(hex: "f59e0b")
    static let primaryGlow = Color(hex: "f59e0b").opacity(0.3)
    
    static let success = Color(hex: "34d399")
    static let successGlow = Color(hex: "34d399").opacity(0.3)
    
    static let danger = Color(hex: "f87171")
    static let dangerGlow = Color(hex: "f87171").opacity(0.3)
    
    static let warning = Color(hex: "fbbf24")
    
    static let backgroundDark = Color(hex: "0a0f1a")
    static let backgroundLight = Color(hex: "f5f5f0")
    
    static let cardDark = Color(hex: "111827").opacity(0.7)
    static let cardLight = Color.white.opacity(0.9)
    
    static let textDark = Color(hex: "f9fafb")
    static let textLight = Color(hex: "0f172a")
    
    static let mutedDark = Color.white.opacity(0.4)
    static let mutedLight = Color.black.opacity(0.4)
}

extension Color {
    
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3:
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6:
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8:
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

