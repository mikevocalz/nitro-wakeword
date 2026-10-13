import Foundation

/// The only shared lifecycle state across otherwise independent HybridObjects.
/// No AVFoundation operation or callback runs while this lock is held.
enum MicrophoneOwnership {
  private static let lock = NSLock()
  private static var owner: UUID?

  static func claim(_ candidate: UUID) throws {
    lock.lock()
    defer { lock.unlock() }
    guard owner == nil || owner == candidate else {
      throw WakeWordError("Microphone is already in use by another WakeWord instance")
    }
    owner = candidate
  }

  static func release(_ candidate: UUID) {
    lock.lock()
    if owner == candidate { owner = nil }
    lock.unlock()
  }
}
