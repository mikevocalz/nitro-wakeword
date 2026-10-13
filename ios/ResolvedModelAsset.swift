import Foundation

struct ResolvedModelAsset {
  let url: URL
  let sha256: String?

  init(model: String, sha256: String?) throws {
    guard !model.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      throw WakeWordError("model must be a non-empty local reference")
    }
    try ModelIntegrity.validateDigest(sha256)
    guard let url = ModelResolver.resolve(model) else { throw WakeWordError("Model not found: \(model)") }
    self.url = url
    self.sha256 = sha256
  }
}
