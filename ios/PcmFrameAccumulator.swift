/// Bounded, single-owner framing. Emitted arrays have independent value semantics.
final class PcmFrameAccumulator {
  private var frame: [Float]
  private(set) var pendingCount = 0

  init(frameSize: Int) throws {
    guard frameSize > 0 else { throw WakeWordError("PCM frame size must be positive") }
    frame = [Float](repeating: 0, count: frameSize)
  }

  func reset() { pendingCount = 0 }

  func append(_ samples: [Float], onFrame: ([Float]) throws -> Void) rethrows {
    for sample in samples {
      frame[pendingCount] = sample
      pendingCount += 1
      if pendingCount == frame.count {
        pendingCount = 0
        try onFrame(frame)
      }
    }
  }
}
