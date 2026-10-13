import Foundation

/// Inference state owned exclusively by its HybridObject's engine queue.
final class KeywordClassifier {
  let keyword: String
  let model: OnnxModel
  let window: Int
  var threshold: Float
  let patience: Int
  var consecutive = 0
  var lastDetectionUptimeS: Double = -.infinity

  init(keyword: String, model: OnnxModel, window: Int, threshold: Float, patience: Int) {
    self.keyword = keyword
    self.model = model
    self.window = window
    self.threshold = threshold
    self.patience = patience
  }

  static func validatedScore(_ output: [Float], name: String) throws -> Float {
    return try ModelOutputValidation.probability(output, name: "Classifier '\(name)'")
  }
}
