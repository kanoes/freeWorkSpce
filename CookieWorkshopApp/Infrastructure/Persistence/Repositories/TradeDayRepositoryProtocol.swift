import Foundation

protocol TradeDayRepositoryProtocol: Sendable {
    func fetchAll() async throws -> [TradeDay]
    func fetchByDate(_ date: LocalDate) async throws -> TradeDay?
    func fetchById(_ id: UUID) async throws -> TradeDay?
    func upsert(_ day: TradeDay) async throws
    func markDeleted(_ id: UUID) async throws
    func fetchDirty() async throws -> [TradeDay]
    func markClean(_ ids: [UUID]) async throws
    func deleteAll() async throws
    func upsertFromRemote(_ day: TradeDay) async throws
}

