import Foundation
import Supabase

protocol TradeDayRemoteDataSourceProtocol: Sendable {
    func upsert(_ days: [TradeDay], userId: String) async throws
    func fetchUpdated(since: Date, userId: String) async throws -> [TradeDay]
}

final class TradeDayRemoteDataSource: TradeDayRemoteDataSourceProtocol, @unchecked Sendable {
    
    private let supabase: SupabaseClient
    private let tableName = "trade_days"
    
    init(supabase: SupabaseClient) {
        self.supabase = supabase
    }
    
    func upsert(_ days: [TradeDay], userId: String) async throws {
        guard !days.isEmpty else { return }
        
        let dtos = days.map { TradeDayDTO(from: $0, userId: userId) }
        
        try await supabase
            .from(tableName)
            .upsert(dtos, onConflict: "id")
            .execute()
    }
    
    func fetchUpdated(since: Date, userId: String) async throws -> [TradeDay] {
        let formatter = ISO8601DateFormatter()
        let sinceString = formatter.string(from: since)
        
        let response: [TradeDayDTO] = try await supabase
            .from(tableName)
            .select()
            .eq("user_id", value: userId)
            .gt("updated_at", value: sinceString)
            .order("updated_at", ascending: true)
            .execute()
            .value
        
        return response.compactMap { $0.toTradeDay() }
    }
}

