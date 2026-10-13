package com.margelo.nitro.wakeword

/** Fixed-size partial PCM storage. Append and reset belong to one capture/inference owner. */
internal class PcmFrameAccumulator(frameSize: Int) {
  init {
    require(frameSize > 0) { "PCM frame size must be positive" }
  }

  private val frame = FloatArray(frameSize)
  var pendingCount = 0
    private set

  /** Each synchronous callback receives its own frame, safe to retain or enqueue. */
  fun append(samples: FloatArray, onFrame: (FloatArray) -> Unit) {
    var offset = 0
    while (offset < samples.size) {
      val count = minOf(frame.size - pendingCount, samples.size - offset)
      System.arraycopy(samples, offset, frame, pendingCount, count)
      offset += count
      pendingCount += count
      if (pendingCount == frame.size) {
        pendingCount = 0
        onFrame(frame.copyOf())
      }
    }
  }

  fun reset() {
    frame.fill(0f)
    pendingCount = 0
  }
}
