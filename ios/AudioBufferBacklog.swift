import Foundation

/// Bounds borrowed-buffer copies before the tap crosses into the owner queue.
final class AudioBufferBacklog {
  private let slots: DispatchSemaphore
  // The tap records a gap while owner-queue completions release slots. Only this
  // flag is protected; no callback, audio API or inference runs under the lock.
  private let lock = NSLock()
  private var dropped = false

  init(capacity: Int) throws {
    guard capacity > 0 else { throw WakeWordError("Audio backlog capacity must be positive") }
    slots = DispatchSemaphore(value: capacity)
  }

  func acquire() -> AudioBufferAdmission {
    guard slots.wait(timeout: .now()) == .success else {
      markDropped()
      return .dropped
    }
    lock.lock()
    let discontinuous = dropped
    dropped = false
    lock.unlock()
    return discontinuous ? .discontinuous : .contiguous
  }

  func markDropped() {
    lock.lock()
    dropped = true
    lock.unlock()
  }

  func release() { slots.signal() }
}
