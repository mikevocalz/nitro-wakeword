package com.margelo.nitro.wakeword

/** One maximum probability per capture chunk, owned by the inference queue. */
internal class VadGate(historySize: Int, private val threshold: Float) {
  init {
    require(historySize > 0) { "VAD history size must be positive" }
    require(threshold.isFinite() && threshold in 0f..1f) { "VAD threshold must be between 0 and 1" }
  }

  private val history = FloatArray(historySize)
  private var index = 0

  val isSpeech: Boolean
    get() = history.any { it >= threshold }

  fun recordChunk(probabilities: FloatArray) {
    var maximum = 0f
    for (probability in probabilities) {
      require(probability.isFinite() && probability in 0f..1f) {
        "VAD score must be a finite probability between 0 and 1"
      }
      maximum = maxOf(maximum, probability)
    }
    // Empty chunks count as silence; invalid chunks leave the history unchanged.
    history[index] = maximum
    index = (index + 1) % history.size
  }

  fun reset() {
    history.fill(0f)
    index = 0
  }
}
