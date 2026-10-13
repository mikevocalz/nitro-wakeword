import Foundation

/// openWakeWord inference pipeline (see NOTICE):
///
/// 16 kHz mono int16-scaled float audio, processed in 80 ms chunks (1280 samples).
/// Each chunk: melspectrogram over the last 1760 samples -> 8 new mel frames (32 bins),
/// transformed `x / 10 + 2`; the last 76 mel frames -> one 96-dim speech embedding;
/// the last `N` embeddings (`N` = classifier window, usually 16) -> keyword score.
/// Optionally gated by Silero VAD.
final class OpenWakeWordEngine {
  static let sampleRate = WakeWordAudioFormat.sampleRate
  static let chunkSize = WakeWordAudioFormat.chunkSize
  static let melContext = 480          // 3 extra hops so that 1280 samples yield 8 frames
  static let melWindow = 76
  static let melBins = 32
  static let embeddingDim = 96
  static let vadFrame = 512
  static let vadHistory = 12           // ~1 s of 80 ms chunks

  private let melModel: OnnxModel
  private let embeddingModel: OnnxModel
  private let vadModel: OnnxModel?
  private let keywords: [KeywordClassifier]

  private var raw = [Float](repeating: 0, count: chunkSize + melContext)
  private var mel = [Float](repeating: 1, count: melWindow * melBins)
  private var melFramesSeen = 0
  private var features: [Float]
  private var featuresSeen = 0
  private let maxWindow: Int

  private var vadH = [Float](repeating: 0, count: 2 * 64)
  private var vadC = [Float](repeating: 0, count: 2 * 64)
  private let vadPending: PcmFrameAccumulator
  private let vadGate: VadGate

  init(
    mel: ResolvedModelAsset,
    embedding: ResolvedModelAsset,
    vad: ResolvedModelAsset?,
    vadThreshold: Float,
    keywords: [KeywordConfiguration]
  ) throws {
    vadPending = try PcmFrameAccumulator(frameSize: OpenWakeWordEngine.vadFrame)
    vadGate = try VadGate(historySize: OpenWakeWordEngine.vadHistory, threshold: vadThreshold)
    melModel = try OnnxModel(asset: mel)
    embeddingModel = try OnnxModel(asset: embedding)
    if vadThreshold > 0, let vad {
      vadModel = try OnnxModel(asset: vad)
    } else {
      vadModel = nil
    }

    var loaded: [KeywordClassifier] = []
    for entry in keywords {
      let model = try OnnxModel(asset: entry.asset)
      let window = try OpenWakeWordEngine.resolveWindow(model, name: entry.keyword)
      loaded.append(try KeywordClassifier(
        keyword: entry.keyword, model: model, window: window,
        threshold: entry.threshold, patience: entry.patience, refractoryMs: entry.refractoryMs
      ))
    }
    self.keywords = loaded
    maxWindow = loaded.map(\.window).max() ?? 16
    features = [Float](repeating: 0, count: maxWindow * OpenWakeWordEngine.embeddingDim)

    try warmUp()
  }

  /// Reads the classifier window from the declared input shape `[1, N, 96]`;
  /// falls back to probing common sizes when the dimension is symbolic.
  private static func resolveWindow(_ model: OnnxModel, name: String) throws -> Int {
    let shape = model.firstInputShape
    guard shape.count == 3,
          shape[0] == 1 || shape[0] == -1,
          shape[2] == embeddingDim || shape[2] == -1 else {
      throw WakeWordError("Classifier '\(name)' must accept [1, N, 96]")
    }
    let declaredWindow = shape[1]
    if declaredWindow != -1 {
      // Bound before multiplying or allocating from model-controlled metadata.
      guard (1...1024).contains(declaredWindow) else {
        throw WakeWordError("Classifier '\(name)' window must be between 1 and 1024")
      }
      let zeros = [Float](repeating: 0, count: declaredWindow * embeddingDim)
      let output = try model.run(zeros, shape: [1, declaredWindow, embeddingDim])
      _ = try KeywordClassifier.validatedScore(output, name: name)
      return declaredWindow
    }
    let candidates = [16, 28, 20, 24, 32, 12, 36, 40, 48, 64, 8]
    for n in candidates {
      let zeros = [Float](repeating: 0, count: n * embeddingDim)
      if let output = try? model.run(zeros, shape: [1, n, embeddingDim]) {
        _ = try KeywordClassifier.validatedScore(output, name: name)
        return n
      }
    }
    throw WakeWordError("Could not determine input window of classifier '\(name)'. Expected [1, N, 96].")
  }

  private func warmUp() throws {
    // Fill mel + feature buffers with "silence" features, like openWakeWord does on init.
    let zeros = [Float](repeating: 0, count: OpenWakeWordEngine.chunkSize)
    let chunks = OpenWakeWordEngine.melWindow / 8 + maxWindow + 2
    for _ in 0..<chunks {
      _ = try processChunk(zeros, emit: false)
    }
    for keyword in keywords {
      keyword.consecutive = 0
      keyword.cooldown.reset()
    }
    resetVadState()
  }

  /// Flushes every buffer back to "silence". Call before (re)starting capture:
  /// the mel/embedding windows still hold the audio that triggered the last
  /// detection, and would fire again on the first chunk after a stop/start.
  func reset() throws {
    raw = [Float](repeating: 0, count: raw.count)
    mel = [Float](repeating: 1, count: mel.count)
    melFramesSeen = 0
    features = [Float](repeating: 0, count: features.count)
    featuresSeen = 0
    resetVadState()
    try warmUp()
  }

  func setThreshold(keyword: String, threshold: Float) throws {
    guard let classifier = keywords.first(where: { $0.keyword == keyword }) else {
      throw WakeWordError("Unknown keyword: \(keyword)")
    }
    classifier.threshold = threshold
  }

  /// Processes exactly one 1280-sample chunk. Returns per-keyword scores and detections.
  func process(_ chunk: [Float]) throws -> (scores: [(String, Float)], detections: [KeywordDetection]) {
    try processChunk(chunk, emit: true)
  }

  private func processChunk(_ chunk: [Float], emit: Bool) throws -> (scores: [(String, Float)], detections: [KeywordDetection]) {
    precondition(chunk.count == OpenWakeWordEngine.chunkSize, "chunk must be 1280 samples")

    if vadModel != nil {
      try runVad(chunk)
    }

    // Sliding raw buffer: [ previous 480 | new 1280 ]
    let context = OpenWakeWordEngine.melContext
    raw.replaceSubrange(0..<context, with: raw[(raw.count - context)...])
    raw.replaceSubrange(context..<raw.count, with: chunk)

    let bins = OpenWakeWordEngine.melBins
    let newFrames = 8
    let melOutput = try melModel.run(raw, shape: [1, raw.count])
    let melOut = try ModelOutputValidation.values(
      melOutput, count: newFrames * bins, name: "Melspectrogram"
    )
    let transformed = melOut.map { $0 / 10 + 2 }
    appendFrames(transformed, frames: newFrames, into: &mel, frameSize: bins)
    melFramesSeen = min(melFramesSeen + newFrames, OpenWakeWordEngine.melWindow)
    guard melFramesSeen >= OpenWakeWordEngine.melWindow else { return ([], []) }

    let embeddingOutput = try embeddingModel.run(
      mel, shape: [1, OpenWakeWordEngine.melWindow, bins, 1]
    )
    let embedding = try ModelOutputValidation.values(
      embeddingOutput, count: OpenWakeWordEngine.embeddingDim, name: "Embedding model"
    )
    appendFrames(embedding, frames: 1, into: &features, frameSize: OpenWakeWordEngine.embeddingDim)
    featuresSeen = min(featuresSeen + 1, maxWindow)

    var scores: [(String, Float)] = []
    var detections: [KeywordDetection] = []
    let speech = vadModel == nil || vadGate.isSpeech
    let nowUptimeS = ProcessInfo.processInfo.systemUptime

    for keyword in keywords {
      guard featuresSeen >= keyword.window else { continue }
      // VAD gate closed: the score would be forced to 0 anyway, skip the classifier.
      var score: Float = 0
      if speech {
        let dim = OpenWakeWordEngine.embeddingDim
        let slice = Array(features[(features.count - keyword.window * dim)...])
        let output = try keyword.model.run(slice, shape: [1, keyword.window, dim])
        score = try KeywordClassifier.validatedScore(output, name: keyword.keyword)
      }
      scores.append((keyword.keyword, score))
      guard speech else {
        // A valid classifier threshold of zero must not bypass a closed VAD gate.
        keyword.consecutive = 0
        continue
      }
      guard emit else { continue }

      if score >= keyword.threshold {
        keyword.consecutive = min(keyword.consecutive + 1, keyword.patience)
      } else {
        keyword.consecutive = 0
      }
      if keyword.consecutive >= keyword.patience,
         keyword.cooldown.accept(at: nowUptimeS) {
        keyword.consecutive = 0
        detections.append(KeywordDetection(
          keyword: keyword.keyword, score: score,
          timestamp: Date().timeIntervalSince1970 * 1000
        ))
      }
    }
    return (scores, detections)
  }

  /// Shifts `buffer` left by `frames * frameSize` and appends that many values.
  private func appendFrames(_ values: [Float], frames: Int, into buffer: inout [Float], frameSize: Int) {
    let incoming = min(frames * frameSize, values.count)
    guard incoming > 0 else { return }
    if incoming >= buffer.count {
      buffer = Array(values.suffix(buffer.count))
      return
    }
    buffer.removeFirst(incoming)
    buffer.append(contentsOf: values.prefix(incoming))
  }

  private func runVad(_ chunk: [Float]) throws {
    guard let vad = vadModel else { return }
    // Silero expects audio normalised to [-1, 1].
    let frame = OpenWakeWordEngine.vadFrame
    var probabilities: [Float] = []
    try vadPending.append(chunk.map { $0 / 32768 }) { input in
      let outputs = try vad.run(inputs: [
        "input": OnnxModel.floatTensor(input, shape: [1, frame]),
        "sr": OnnxModel.int64Scalar(Int64(OpenWakeWordEngine.sampleRate)),
        "h": OnnxModel.floatTensor(vadH, shape: [2, 1, 64]),
        "c": OnnxModel.floatTensor(vadC, shape: [2, 1, 64]),
      ])
      let nextH = try ModelOutputValidation.values(outputs["hn"], count: 128, name: "VAD hn")
      let nextC = try ModelOutputValidation.values(outputs["cn"], count: 128, name: "VAD cn")
      let probability = try ModelOutputValidation.probability(outputs["output"], name: "VAD output")
      // Commit recurrent state only after every required output is valid.
      vadH = nextH
      vadC = nextC
      probabilities.append(probability)
    }
    try vadGate.recordChunk(probabilities)
  }

  private func resetVadState() {
    vadH = [Float](repeating: 0, count: 2 * 64)
    vadC = [Float](repeating: 0, count: 2 * 64)
    vadPending.reset()
    vadGate.reset()
  }
}
