import Foundation

/// Synchronous Nitro setters race with owner-queue emissions. Copy the selected
/// callback under a tiny lock, then invoke it outside the lock. Removing a
/// listener does not cancel a callback already selected by an in-flight event.
final class WakeWordListeners {
  private let lock = NSLock()
  private var detectionCallback: ((WakeWordDetection) -> Void)?
  private var scoreCallback: ((String, Double) -> Void)?
  private var errorCallback: ((String) -> Void)?

  func clear() {
    lock.lock()
    detectionCallback = nil
    scoreCallback = nil
    errorCallback = nil
    lock.unlock()
  }

  var detection: ((WakeWordDetection) -> Void)? {
    get {
      lock.lock()
      defer { lock.unlock() }
      return detectionCallback
    }
    set {
      lock.lock()
      detectionCallback = newValue
      lock.unlock()
    }
  }

  var score: ((String, Double) -> Void)? {
    get {
      lock.lock()
      defer { lock.unlock() }
      return scoreCallback
    }
    set {
      lock.lock()
      scoreCallback = newValue
      lock.unlock()
    }
  }

  var error: ((String) -> Void)? {
    get {
      lock.lock()
      defer { lock.unlock() }
      return errorCallback
    }
    set {
      lock.lock()
      errorCallback = newValue
      lock.unlock()
    }
  }
}
