package com.margelo.nitro.wakeword

/** Mutable classifier state, confined to the owning queue. */
internal class WakeWordKeyword(
  val keyword: String,
  val model: OnnxModel,
  val window: Int,
  var threshold: Float,
  val patience: Int,
  refractoryMs: Double,
) {
  companion object {
    fun validatedScore(output: FloatArray, name: String): Float {
      return ModelOutputValidation.probability(output, "Classifier '$name'")
    }
  }

  var consecutive = 0
  val cooldown = KeywordCooldown(refractoryMs)
}
