import Foundation

/// Nitro property reads can arrive from arbitrary runtimes. Only these two
/// cached flags cross that boundary; no hardware, queue hop or callback is held
/// under this tiny lock.
final class WakeWordSnapshot {
  private let lock = NSLock()
  private var loaded = false
  private var listening = false

  var isLoaded: Bool {
    lock.lock()
    defer { lock.unlock() }
    return loaded
  }

  var isListening: Bool {
    lock.lock()
    defer { lock.unlock() }
    return listening
  }

  func setLoaded(_ value: Bool) {
    lock.lock()
    loaded = value
    lock.unlock()
  }

  func setListening(_ value: Bool) {
    lock.lock()
    listening = value
    lock.unlock()
  }
}
