import Foundation

final class KeywordCooldown {
  private let seconds: Double
  private var lastDetection = -Double.infinity

  init(milliseconds: Double) throws {
    guard milliseconds.isFinite, milliseconds >= 0 else {
      throw WakeWordError("refractoryMs must be finite and non-negative")
    }
    seconds = milliseconds / 1000
  }

  func accept(at uptime: Double) -> Bool {
    guard uptime - lastDetection >= seconds else { return false }
    lastDetection = uptime
    return true
  }

  func reset() { lastDetection = -.infinity }
}
