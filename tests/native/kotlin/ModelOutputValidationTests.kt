package com.margelo.nitro.wakeword

import com.margelo.nitro.wakeword.NativeAudioTests.expectFailure
import com.margelo.nitro.wakeword.NativeAudioTests.test

internal object ModelOutputValidationTests {
  fun run() {
    test("VAD model output accepts exact probability boundaries") {
      check(ModelOutputValidation.probability(floatArrayOf(0f), "VAD") == 0f)
      check(ModelOutputValidation.probability(floatArrayOf(1f), "VAD") == 1f)
    }
    test("VAD model output rejects missing, wrong-shaped and invalid probabilities") {
      val outputs = listOf(null, floatArrayOf(), floatArrayOf(0.5f, 0.9f),
        floatArrayOf(Float.NaN), floatArrayOf(Float.POSITIVE_INFINITY),
        floatArrayOf(Float.NEGATIVE_INFINITY), floatArrayOf(-Float.MIN_VALUE),
        floatArrayOf(Math.nextUp(1f)))
      for (output in outputs) {
        expectFailure<IllegalArgumentException> { ModelOutputValidation.probability(output, "VAD") }
      }
    }
    test("VAD recurrent state must have exactly 128 finite values") {
      ModelOutputValidation.finite(FloatArray(128), 128, "VAD hn")
      expectFailure<IllegalArgumentException> { ModelOutputValidation.finite(FloatArray(127), 128, "VAD hn") }
      expectFailure<IllegalArgumentException> { ModelOutputValidation.finite(FloatArray(129), 128, "VAD cn") }
      expectFailure<IllegalArgumentException> {
        ModelOutputValidation.finite(FloatArray(128).also { it[127] = Float.NaN }, 128, "VAD cn")
      }
    }
  }
}
