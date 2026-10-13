import Foundation
import NitroModules

/// Lifecycle, AVAudioEngine and inference share one owner queue per instance.
final class HybridWakeWord: HybridWakeWordSpec {
  private let queue = DispatchQueue(label: "com.nitrowakeword.engine", qos: .userInitiated)
  private let snapshot = WakeWordSnapshot()
  private let listeners = WakeWordListeners()
  private var engine: OpenWakeWordEngine?
  private var capture: AudioCapture?
  private var manageAudioSession = true

  public var isLoaded: Bool { snapshot.isLoaded }
  public var isListening: Bool { snapshot.isListening }

  deinit {
    // An in-flight Promise retains this instance. Once it is released, only the
    // capture can still own hardware; finish that cleanup on its owner queue.
    let capture = capture
    queue.async { capture?.stop() }
  }

  public func load(config: WakeWordConfig) throws -> Promise<Void> {
    return Promise.parallel(queue) {
      self.stopCapture()
      self.engine = nil
      self.snapshot.setLoaded(false)
      let configuration = try WakeWordConfiguration(config)
      self.engine = try OpenWakeWordEngine(
        melURL: configuration.melURL,
        embeddingURL: configuration.embeddingURL,
        vadURL: configuration.vadURL,
        vadThreshold: configuration.vadThreshold,
        refractoryMs: configuration.refractoryMs,
        keywords: configuration.keywords
      )
      self.manageAudioSession = configuration.manageAudioSession
      self.snapshot.setLoaded(true)
    }
  }

  public func unload() throws -> Promise<Void> {
    return Promise.parallel(queue) {
      self.stopCapture()
      self.engine = nil
      self.snapshot.setLoaded(false)
      self.listeners.clear()
    }
  }

  public func start() throws -> Promise<Void> {
    return Promise.parallel(queue) {
      guard let engine = self.engine else {
        throw WakeWordError("Call load() before start()")
      }
      if self.capture?.isRunning == true { return }
      // An interruption is not guaranteed to deliver an ended notification.
      // Explicit start must be able to replace a stopped recovery generation.
      self.stopCapture()
      try MicrophonePermission.requireGranted()
      try engine.reset()
      let capture = AudioCapture(
        queue: self.queue,
        chunkSize: OpenWakeWordEngine.chunkSize,
        manageSession: self.manageAudioSession,
        onChunk: { [weak self] chunk in self?.process(chunk) },
        onError: { [weak self] message in self?.listeners.error?(message) },
        onRunningChanged: { [weak self] running in self?.snapshot.setListening(running) }
      )
      // AudioCapture owns partial-start rollback, including its microphone claim.
      try capture.start()
      self.capture = capture
    }
  }

  public func stop() throws -> Promise<Void> {
    return Promise.parallel(queue) { self.stopCapture() }
  }

  public func setThreshold(keyword: String, threshold: Double) throws -> Promise<Void> {
    return Promise.parallel(queue) {
      let value = try WakeWordConfiguration.probability(threshold, name: "threshold")
      guard let engine = self.engine else {
        throw WakeWordError("Call load() before setThreshold()")
      }
      try engine.setThreshold(keyword: keyword, threshold: value)
    }
  }

  public func setDetectionListener(listener: @escaping (WakeWordDetection) -> Void) throws {
    listeners.detection = listener
  }

  public func clearDetectionListener() throws { listeners.detection = nil }

  public func setScoreListener(listener: @escaping (String, Double) -> Void) throws {
    listeners.score = listener
  }

  public func clearScoreListener() throws { listeners.score = nil }

  public func setErrorListener(listener: @escaping (String) -> Void) throws {
    listeners.error = listener
  }

  public func clearErrorListener() throws { listeners.error = nil }

  public func hasMicrophonePermission() throws -> Bool { MicrophonePermission.isGranted }

  public func requestMicrophonePermission() throws -> Promise<Bool> {
    return try MicrophonePermission.request()
  }

  private func stopCapture() {
    capture?.stop()
    capture = nil
    snapshot.setListening(false)
  }

  /// Called only by the current audio stream on the owner queue. Stop/unload
  /// invalidate queued audio before resolving, so it cannot reach this method.
  private func process(_ chunk: [Float]) {
    guard let engine else { return }
    do {
      let result = try engine.process(chunk)
      if let listener = listeners.score {
        for (keyword, score) in result.scores { listener(keyword, Double(score)) }
      }
      if let listener = listeners.detection {
        for detection in result.detections {
          listener(WakeWordDetection(
            keyword: detection.keyword,
            score: Double(detection.score),
            timestamp: detection.timestamp
          ))
        }
      }
    } catch {
      listeners.error?("Inference failed: \(error.localizedDescription)")
    }
  }
}
