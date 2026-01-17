import Foundation
import SwiftUI

@MainActor
final class SettingsViewModel: ObservableObject {
    
    let repository: TradeDayRepositoryProtocol
    
    @Published var isLoading = false
    @Published var errorMessage: String?
    
    init(repository: TradeDayRepositoryProtocol) {
        self.repository = repository
    }
    
    func exportData() async -> Data? {
        let exportUseCase = ExportToJSONUseCase(repository: repository)
        return try? await exportUseCase.execute()
    }
    
    func copyToClipboard() async {
        guard let data = await exportData(),
              let text = String(data: data, encoding: .utf8) else {
            return
        }
        
        UIPasteboard.general.string = text
    }
    
    func handleImport(result: Result<URL, Error>) async {
        isLoading = true
        defer { isLoading = false }
        
        do {
            let url = try result.get()
            
            guard url.startAccessingSecurityScopedResource() else {
                throw ImportError.accessDenied
            }
            
            defer { url.stopAccessingSecurityScopedResource() }
            
            let data = try Data(contentsOf: url)
            let importUseCase = ImportFromJSONUseCase(repository: repository)
            _ = try await importUseCase.execute(jsonData: data)
            
        } catch {
            errorMessage = error.localizedDescription
        }
    }
    
    func clearAllData() async {
        isLoading = true
        defer { isLoading = false }
        
        try? await repository.deleteAll()
    }
}

enum ImportError: Error {
    case accessDenied
    case invalidFormat
}

