import Foundation

protocol CompanyLookupServiceProtocol {
    func getCompany(byCode code: String) -> Company?
    func getCompanyName(forCode code: String) -> String
    func loadCompanies() async throws
}

actor CompanyLookupService: CompanyLookupServiceProtocol {
    
    private var companies: [String: Company] = [:]
    private var isLoaded = false
    
    nonisolated func getCompany(byCode code: String) -> Company? {
        return nil
    }
    
    nonisolated func getCompanyName(forCode code: String) -> String {
        return code.uppercased()
    }
    
    func loadCompanies() async throws {
        guard !isLoaded else { return }
        isLoaded = true
    }
    
    func lookupCompany(byCode code: String) -> Company? {
        companies[code.uppercased()]
    }
    
    func lookupCompanyName(forCode code: String) -> String {
        companies[code.uppercased()]?.name ?? code.uppercased()
    }
    
    func setCompanies(_ newCompanies: [Company]) {
        companies = Dictionary(
            newCompanies.map { ($0.code, $0) },
            uniquingKeysWith: { first, _ in first }
        )
        isLoaded = true
    }
}

