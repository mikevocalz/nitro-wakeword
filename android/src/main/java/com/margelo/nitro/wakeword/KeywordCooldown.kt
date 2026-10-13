package com.margelo.nitro.wakeword

internal class KeywordCooldown(milliseconds: Double) {
  private val seconds: Double
  private var lastDetection = Double.NEGATIVE_INFINITY

  init {
    require(milliseconds.isFinite() && milliseconds >= 0) { "refractoryMs must be finite and non-negative" }
    seconds = milliseconds / 1000.0
  }

  fun accept(uptime: Double): Boolean {
    if (uptime - lastDetection < seconds) return false
    lastDetection = uptime
    return true
  }

  fun reset() { lastDetection = Double.NEGATIVE_INFINITY }
}
