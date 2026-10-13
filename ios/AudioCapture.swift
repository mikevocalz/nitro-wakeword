import AVFoundation
import Foundation

/// All mutable capture state belongs to `queue`, shared with inference. The
/// render callback only acquires a nonblocking backlog slot, copies its borrowed
/// buffer and submits it. It never reads or mutates capture/converter state.
final class AudioCapture {
  private let queue: DispatchQueue
  private let owner = UUID()
  private let chunkSize: Int
  private let manageSession: Bool
  private let onChunk: ([Float]) -> Void
  private let onError: (String) -> Void
  private let onRunningChanged: (Bool) -> Void
  private var engine = AVAudioEngine()
  private var stream: AudioChunkStream?
  private var tapInstalled = false
  private var sessionActivated = false
  private var observers: [NSObjectProtocol] = []
  private var engineObserver: NSObjectProtocol?
  private var restartWork: DispatchWorkItem?
  private var restartToken: UUID?
  private var interrupted = false
  /// Owner-queue state, distinct from a requested session awaiting recovery.
  private(set) var isRunning = false
  private var isStarted = false

  init(
    queue: DispatchQueue,
    chunkSize: Int,
    manageSession: Bool,
    onChunk: @escaping ([Float]) -> Void,
    onError: @escaping (String) -> Void,
    onRunningChanged: @escaping (Bool) -> Void
  ) {
    self.queue = queue
    self.chunkSize = chunkSize
    self.manageSession = manageSession
    self.onChunk = onChunk
    self.onError = onError
    self.onRunningChanged = onRunningChanged
  }

  func start() throws {
    dispatchPrecondition(condition: .onQueue(queue))
    guard !isStarted else { return }
    try MicrophoneOwnership.claim(owner)
    do {
      try configureSession()
      try activateSession()
      try startEngine()
      isStarted = true
      registerObservers()
    } catch {
      // Teardown must also work before startEngine has marked us running.
      stop()
      throw error
    }
  }

  func stop() {
    dispatchPrecondition(condition: .onQueue(queue))
    isStarted = false
    interrupted = false
    cancelRestart()
    observers.forEach { NotificationCenter.default.removeObserver($0) }
    observers.removeAll()
    tearDownEngine()
    if sessionActivated {
      try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
      sessionActivated = false
    }
    MicrophoneOwnership.release(owner)
  }

  private func configureSession() throws {
    guard manageSession else { return }
    try AVAudioSession.sharedInstance().setCategory(
      .playAndRecord, mode: .default,
      options: [.mixWithOthers, .allowBluetooth, .defaultToSpeaker]
    )
  }

  private func activateSession() throws {
    guard manageSession else { return }
    try AVAudioSession.sharedInstance().setActive(true)
    sessionActivated = true
  }

  private func startEngine() throws {
    let input = engine.inputNode
    let format = input.outputFormat(forBus: 0)
    guard format.sampleRate.isFinite, format.sampleRate > 0, format.channelCount > 0 else {
      throw WakeWordError("Microphone input format unavailable")
    }
    let activeStream = AudioChunkStream(chunkSize: chunkSize)
    stream = activeStream
    let slots = DispatchSemaphore(value: 8)
    let ownerQueue = queue
    // nil allows AVAudioEngine to select the current hardware format.
    input.installTap(onBus: 0, bufferSize: 4096, format: nil) { [weak self] buffer, _ in
      guard slots.wait(timeout: .now()) == .success else { return }
      guard let copied = buffer.ownedCopy() else {
        slots.signal()
        return
      }
      ownerQueue.async { [weak self] in
        defer { slots.signal() }
        guard let self, self.isRunning, self.stream === activeStream else { return }
        do {
          try activeStream.process(copied, onChunk: self.onChunk)
        } catch {
          self.onError(error.localizedDescription)
        }
      }
    }
    tapInstalled = true
    engine.prepare()
    try engine.start()
    isRunning = true
    onRunningChanged(true)
    // Observe only the current stream. Notifications queued by a previous
    // graph, including our own teardown, cannot restart a replacement graph.
    engineObserver = NotificationCenter.default.addObserver(
      forName: .AVAudioEngineConfigurationChange, object: engine, queue: nil
    ) { [weak self] _ in
      ownerQueue.async { [weak self] in
        guard let self, self.stream === activeStream else { return }
        self.restart(reason: "engine configuration change")
      }
    }
  }

  private func tearDownEngine() {
    // Invalidate before removing the tap. Any queued or racing old tap buffers
    // retain their old stream identity and will be dropped on the owner queue.
    stream = nil
    if let engineObserver { NotificationCenter.default.removeObserver(engineObserver) }
    engineObserver = nil
    if tapInstalled {
      engine.inputNode.removeTap(onBus: 0)
      tapInstalled = false
    }
    engine.stop()
    engine.reset()
    if isRunning { onRunningChanged(false) }
    isRunning = false
  }

  private func cancelRestart() {
    restartToken = nil
    restartWork?.cancel()
    restartWork = nil
  }

  private func restart(reason: String, attempt: Int = 0) {
    guard isStarted, !interrupted else { return }
    cancelRestart()
    tearDownEngine()
    do {
      try configureSession()
      try activateSession()
      try startEngine()
    } catch {
      // A failed start may already have installed its tap. Always remove it
      // before a retry; otherwise the next installTap can raise NSException.
      tearDownEngine()
      if attempt < 4 {
        let token = UUID()
        restartToken = token
        let work = DispatchWorkItem { [weak self] in
          guard let self, self.restartToken == token else { return }
          self.restart(reason: reason, attempt: attempt + 1)
        }
        restartWork = work
        // This bounded retry is for external hardware/OS settling, not ordering.
        queue.asyncAfter(deadline: .now() + 0.5 * Double(attempt + 1), execute: work)
      } else {
        stop()
        onError("Audio engine restart failed after \(reason): \(error.localizedDescription)")
      }
    }
  }

  private func registerObservers() {
    observe(AVAudioSession.interruptionNotification) { capture, note in
      guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
            let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
      switch type {
      case .began:
        capture.interrupted = true
        capture.cancelRestart()
        capture.tearDownEngine()
      case .ended:
        capture.interrupted = false
        capture.restart(reason: "interruption")
      @unknown default:
        break
      }
    }
    observe(AVAudioSession.routeChangeNotification) { capture, note in
      guard let raw = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
            let reason = AVAudioSession.RouteChangeReason(rawValue: raw) else { return }
      switch reason {
      case .newDeviceAvailable, .oldDeviceUnavailable, .wakeFromSleep, .routeConfigurationChange:
        capture.restart(reason: "route change (\(reason.rawValue))")
      default:
        // In particular, ignore notifications from our own category settings.
        break
      }
    }
    observe(AVAudioSession.mediaServicesWereResetNotification) { capture, _ in
      capture.cancelRestart()
      capture.tearDownEngine()
      capture.engine = AVAudioEngine()
      capture.sessionActivated = false
      capture.restart(reason: "media services reset")
    }
  }

  private func observe(_ name: Notification.Name, handler: @escaping (AudioCapture, Notification) -> Void) {
    let ownerQueue = queue
    let observer = NotificationCenter.default.addObserver(forName: name, object: nil, queue: nil) { [weak self] note in
      ownerQueue.async { [weak self] in
        guard let self, self.isStarted else { return }
        handler(self, note)
      }
    }
    observers.append(observer)
  }
}
