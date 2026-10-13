package com.margelo.nitro.wakeword

internal data class WakeWordFrameResult(
  val scores: List<Pair<String, Float>>,
  val detections: List<WakeWordDetectionResult>,
)
