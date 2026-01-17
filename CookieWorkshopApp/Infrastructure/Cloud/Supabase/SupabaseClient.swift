import Foundation
import Supabase

final class SupabaseClientManager: @unchecked Sendable {
    
    static let shared = SupabaseClientManager()
    
    private var client: SupabaseClient?
    
    private init() {}
    
    func configure(url: URL, anonKey: String) {
        client = SupabaseClient(supabaseURL: url, supabaseKey: anonKey)
    }
    
    var supabase: SupabaseClient {
        guard let client = client else {
            fatalError("Supabase client not configured. Call configure() first.")
        }
        return client
    }
    
    var isConfigured: Bool {
        client != nil
    }
}

