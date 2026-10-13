package com.margelo.nitro.wakeword

internal data class WakeWordKeywordSpec(
  val keyword: String,
  val bytes: ByteArray,
  val threshold: Float,
  val patience: Int,
  val refractoryMs: Double,
)
