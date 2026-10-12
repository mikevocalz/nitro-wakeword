package com.margelo.nitro.wakeword

/** Validate an entire model result before mutating inference history. */
internal object ModelOutputValidation {
  fun finite(values: FloatArray?, count: Int, name: String): FloatArray {
    require(values != null && values.size == count && values.all { it.isFinite() }) {
      "$name must contain exactly $count finite float32 values"
    }
    return values
  }

  fun probability(values: FloatArray?, name: String): Float {
    val value = finite(values, 1, name)[0]
    require(value in 0f..1f) { "$name must be a probability between 0 and 1" }
    return value
  }
}
