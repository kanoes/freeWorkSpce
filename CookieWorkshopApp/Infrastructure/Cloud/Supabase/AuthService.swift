import Foundation
import Supabase
import AuthenticationServices

protocol AuthServiceProtocol {
    func signInWithApple(credential: ASAuthorizationAppleIDCredential) async throws -> User
    func signOut() async throws
    func currentUser() async -> User?
    func observeAuthState() -> AsyncStream<User?>
}

struct User: Identifiable, Hashable {
    let id: UUID
    let email: String?
    let createdAt: Date
}

final class AuthService: AuthServiceProtocol {
    
    private let supabase: SupabaseClient
    
    init(supabase: SupabaseClient) {
        self.supabase = supabase
    }
    
    func signInWithApple(credential: ASAuthorizationAppleIDCredential) async throws -> User {
        guard let identityToken = credential.identityToken,
              let tokenString = String(data: identityToken, encoding: .utf8) else {
            throw AuthError.invalidCredential
        }
        
        let response = try await supabase.auth.signInWithIdToken(
            credentials: .init(
                provider: .apple,
                idToken: tokenString
            )
        )
        
        return User(
            id: response.user.id,
            email: response.user.email,
            createdAt: response.user.createdAt
        )
    }
    
    func signOut() async throws {
        try await supabase.auth.signOut()
    }
    
    func currentUser() async -> User? {
        guard let session = try? await supabase.auth.session else {
            return nil
        }
        
        return User(
            id: session.user.id,
            email: session.user.email,
            createdAt: session.user.createdAt
        )
    }
    
    func observeAuthState() -> AsyncStream<User?> {
        AsyncStream { continuation in
            let task = Task {
                for await (event, session) in supabase.auth.authStateChanges {
                    switch event {
                    case .signedIn, .tokenRefreshed:
                        if let session = session {
                            let user = User(
                                id: session.user.id,
                                email: session.user.email,
                                createdAt: session.user.createdAt
                            )
                            continuation.yield(user)
                        }
                    case .signedOut:
                        continuation.yield(nil)
                    default:
                        break
                    }
                }
            }
            
            continuation.onTermination = { _ in
                task.cancel()
            }
        }
    }
}

enum AuthError: Error {
    case invalidCredential
    case notAuthenticated
}

