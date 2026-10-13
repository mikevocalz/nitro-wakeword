import Foundation

/// Resolves and validates untrusted JS values before numeric conversion or ONNX
/// allocation. Android-only preferences intentionally have no effect on iOS.
struct WakeWordConfiguration {
  let melURL: URL
  let embeddingURL: URL
  let vadURL: URL?
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
      guard let url = ModelResolver.resolve(model.model) else {
        throw WakeWordError("Model not found: \(model.model)")
      }
      resolved.append(KeywordConfiguration(
        keyword: keyword, url: url, threshold: threshold, patience: Int(patience)
      ))
    }
    keywords = resolved
    guard let mel = ModelResolver.resolve("melspectrogram.onnx"),
          let embedding = ModelResolver.resolve("embedding_model.onnx") else {
      throw WakeWordError("Base models not found. Add melspectrogram.onnx and embedding_model.onnx to the app bundle.")
    }
    melURL = mel
    embeddingURL = embedding
    vadURL = vadThreshold > 0 ? ModelResolver.resolve("silero_vad.onnx") : nil
    if vadThreshold > 0 && vadURL == nil {
      throw WakeWordError("silero_vad.onnx not found but vadThreshold > 0")
    }
  }

  static func probability(_ value: Double, name: String) throws -> Float {
    guard value.isFinite, (0...1).contains(value) else {
      throw WakeWordError("\(name) must be a finite number between 0 and 1")
    }
    return Float(value)
  }
}
