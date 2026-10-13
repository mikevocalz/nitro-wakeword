import Foundation

/// Resolves and validates untrusted JS values before numeric conversion or ONNX
/// allocation. Android-only preferences intentionally have no effect on iOS.
struct WakeWordConfiguration {
  let mel: ResolvedModelAsset
  let embedding: ResolvedModelAsset
  let vad: ResolvedModelAsset?
  let vadThreshold: Float
  let refractoryMs: Double
  let manageAudioSession: Bool
  let keywords: [KeywordConfiguration]

  init(_ config: WakeWordConfig) throws {
    guard !config.models.isEmpty else {
      throw WakeWordError("config.models must contain at least one model")
    }
    vadThreshold = try Self.probability(config.vadThreshold ?? 0.3, name: "vadThreshold")
    refractoryMs = config.refractoryMs ?? 1000
    guard refractoryMs.isFinite, refractoryMs >= 0 else {
      throw WakeWordError("refractoryMs must be a finite non-negative number")
    }
    manageAudioSession = config.manageAudioSession ?? true

    var labels = Set<String>()
    var resolved: [KeywordConfiguration] = []
    for model in config.models {
      guard !model.model.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
        throw WakeWordError("model must be a non-empty string")
      }
      let keyword = model.keyword ?? ModelResolver.defaultKeyword(for: model.model)
      guard !keyword.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
        throw WakeWordError("keyword must be a non-empty string")
      }
      guard labels.insert(keyword).inserted else {
        throw WakeWordError("Duplicate keyword: \(keyword)")
      }
      let threshold = try Self.probability(model.threshold ?? 0.5, name: "threshold")
      let patience = model.patience ?? 1
      guard patience.isFinite, patience >= 1, patience <= 2_147_483_647,
            patience.rounded(.towardZero) == patience else {
        throw WakeWordError("patience must be an integer between 1 and 2147483647")
      }
      let cooldown = model.refractoryMs ?? refractoryMs
      guard cooldown.isFinite, cooldown >= 0 else {
        throw WakeWordError("model.refractoryMs must be a finite non-negative number")
      }
      resolved.append(KeywordConfiguration(
        keyword: keyword, asset: try ResolvedModelAsset(model: model.model, sha256: model.sha256),
        threshold: threshold, patience: Int(patience), refractoryMs: cooldown
      ))
    }
    keywords = resolved
    let bases = config.baseModels
    if let configuredVad = bases?.vad {
      _ = try ModelReference.localFileURL(configuredVad.model)
      try ModelIntegrity.validateDigest(configuredVad.sha256)
    }
    mel = try ResolvedModelAsset(model: bases?.melspectrogram.model ?? "melspectrogram.onnx", sha256: bases?.melspectrogram.sha256)
    embedding = try ResolvedModelAsset(model: bases?.embedding.model ?? "embedding_model.onnx", sha256: bases?.embedding.sha256)
    vad = vadThreshold > 0
      ? try ResolvedModelAsset(model: bases?.vad?.model ?? "silero_vad.onnx", sha256: bases?.vad?.sha256)
      : nil
  }

  static func probability(_ value: Double, name: String) throws -> Float {
    guard value.isFinite, (0...1).contains(value) else {
      throw WakeWordError("\(name) must be a finite number between 0 and 1")
    }
    return Float(value)
  }
}
