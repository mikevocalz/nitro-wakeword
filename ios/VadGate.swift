/// One history entry per capture chunk, preserving speech in every VAD subframe.
final class VadGate {
  private var history: [Float]
  private var index = 0
  private let threshold: Float

  init(historySize: Int, threshold: Float) throws {
    guard historySize > 0 else { throw WakeWordError("VAD history size must be positive") }
    guard threshold.isFinite, (0...1).contains(threshold) else {
      throw WakeWordError("VAD threshold must be a finite probability")
    }
    history = [Float](repeating: 0, count: historySize)
    self.threshold = threshold
  }

  var isSpeech: Bool { (history.max() ?? 0) >= threshold }

  func recordChunk(_ probabilities: [Float]) throws {
    guard probabilities.allSatisfy({ $0.isFinite && (0...1).contains($0) }) else {
      throw WakeWordError("VAD scores must be finite probabilities")
    }
    history[index] = probabilities.max() ?? 0
    index = (index + 1) % history.count
  }

  func reset() {
    history = [Float](repeating: 0, count: history.count)
    index = 0
  }
}
