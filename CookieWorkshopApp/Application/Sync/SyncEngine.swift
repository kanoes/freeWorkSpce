import Foundation

actor SyncEngine {
    
    private let localRepository: TradeDayRepositoryProtocol
    private let remoteDataSource: TradeDayRemoteDataSourceProtocol
    private let kvRepository: KeyValueRepository
    
    private var isSyncing = false
    
    init(
        localRepository: TradeDayRepositoryProtocol,
        remoteDataSource: TradeDayRemoteDataSourceProtocol,
        kvRepository: KeyValueRepository
    ) {
        self.localRepository = localRepository
        self.remoteDataSource = remoteDataSource
        self.kvRepository = kvRepository
    }
    
    func sync(userId: String) async throws {
        guard !isSyncing else { return }
        
        isSyncing = true
        defer { isSyncing = false }
        
        try await push(userId: userId)
        try await pull(userId: userId)
    }
    
    private func push(userId: String) async throws {
        let dirtyDays = try await localRepository.fetchDirty()
        
        guard !dirtyDays.isEmpty else { return }
        
        try await remoteDataSource.upsert(dirtyDays, userId: userId)
        
        try await localRepository.markClean(dirtyDays.map(\.id))
    }
    
    private func pull(userId: String) async throws {
        let lastPullAt = try await kvRepository.getInt64(.lastPullAt) ?? 0
        let lastPullDate = Date(timeIntervalSince1970: Double(lastPullAt) / 1000)
        
        let remoteDays = try await remoteDataSource.fetchUpdated(since: lastPullDate, userId: userId)
        
        for remoteDay in remoteDays {
            try await mergeRemoteDay(remoteDay)
        }
        
        let newLastPullAt = Int64(Date().timeIntervalSince1970 * 1000)
        try await kvRepository.setInt64(.lastPullAt, value: newLastPullAt)
    }
    
    private func mergeRemoteDay(_ remoteDay: TradeDay) async throws {
        guard let localDay = try await localRepository.fetchById(remoteDay.id) else {
            try await localRepository.upsertFromRemote(remoteDay)
            return
        }
        
        if localDay.updatedAt < remoteDay.updatedAt {
            try await localRepository.upsertFromRemote(remoteDay)
        }
    }
}
