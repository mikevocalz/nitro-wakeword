package com.margelo.nitro.wakeword

import com.margelo.nitro.wakeword.NativeAudioTests.expectFailure
import com.margelo.nitro.wakeword.NativeAudioTests.test

internal object VadGateTests {
  fun run() {
    test("earlier speech peaks survive final silent VAD frames") {
      for (probabilities in listOf(floatArrayOf(0.9f, 0.1f), floatArrayOf(0.1f, 0.9f, 0.1f))) {
        val gate = VadGate(historySize = 12, threshold = 0.5f)
        gate.recordChunk(probabilities)
        check(gate.isSpeech) { "The capture chunk must retain its maximum VAD probability" }
      }
    }
    test("silence keeps the VAD gate closed") {
      val gate = VadGate(12, 0.5f)
      check(!gate.isSpeech)
      repeat(30) {
        gate.recordChunk(floatArrayOf(0f, 0.1f, 0.49f))
        check(!gate.isSpeech)
      }
    }
    test("VAD threshold comparison includes the exact boundary") {
      val gate = VadGate(1, 0.5f)
      gate.recordChunk(floatArrayOf(Math.nextDown(0.5f)))
      check(!gate.isSpeech)
      gate.recordChunk(floatArrayOf(0.5f))
      check(gate.isSpeech)
    }
    test("zero and one are valid VAD probability and threshold boundaries") {
      val disabled = VadGate(1, 0f)
      disabled.recordChunk(floatArrayOf(0f))
      check(disabled.isSpeech)
      val strict = VadGate(1, 1f)
      strict.recordChunk(floatArrayOf(Math.nextDown(1f)))
      check(!strict.isSpeech)
      strict.recordChunk(floatArrayOf(1f))
      check(strict.isSpeech)
    }
    test("speech expires after twelve capture chunks, not twelve VAD frames") {
      val gate = VadGate(12, 0.5f)
      gate.recordChunk(floatArrayOf(0.9f, 0f, 0f))
      repeat(11) {
        gate.recordChunk(floatArrayOf(0f, 0f, 0f))
        check(gate.isSpeech)
      }
      gate.recordChunk(floatArrayOf(0f, 0f))
      check(!gate.isSpeech)
    }
    test("empty capture chunks advance silent history") {
      val gate = VadGate(2, 0.5f)
      gate.recordChunk(floatArrayOf(1f))
      gate.recordChunk(floatArrayOf())
      check(gate.isSpeech)
      gate.recordChunk(floatArrayOf())
      check(!gate.isSpeech)
    }
    test("VAD history wraps and accepts new speech after expiration") {
      val gate = VadGate(3, 0.5f)
      repeat(30) {
        gate.recordChunk(floatArrayOf(1f))
        repeat(2) {
          gate.recordChunk(floatArrayOf(0f))
          check(gate.isSpeech)
        }
        gate.recordChunk(floatArrayOf(0f))
        check(!gate.isSpeech)
      }
    }
    test("VAD reset clears all speech and history position") {
      val gate = VadGate(2, 0.5f)
      gate.recordChunk(floatArrayOf(1f))
      gate.reset()
      gate.reset()
      check(!gate.isSpeech)
      gate.recordChunk(floatArrayOf(1f))
      gate.recordChunk(floatArrayOf(0f))
      check(gate.isSpeech)
      gate.recordChunk(floatArrayOf(0f))
      check(!gate.isSpeech)
    }
    test("invalid VAD scores neither record speech nor advance history") {
      for (invalid in floatArrayOf(Float.NaN, Float.POSITIVE_INFINITY, Float.NEGATIVE_INFINITY,
        -Float.MIN_VALUE, Math.nextUp(1f))) {
        val gate = VadGate(2, 0.5f)
        expectFailure<IllegalArgumentException> { gate.recordChunk(floatArrayOf(1f, invalid)) }
        check(!gate.isSpeech)
        gate.recordChunk(floatArrayOf(1f))
        expectFailure<IllegalArgumentException> { gate.recordChunk(floatArrayOf(0f, invalid)) }
        gate.recordChunk(floatArrayOf(0f))
        check(gate.isSpeech)
        gate.recordChunk(floatArrayOf(0f))
        check(!gate.isSpeech)
      }
    }
    test("invalid VAD history sizes and thresholds fail at construction") {
      expectFailure<IllegalArgumentException> { VadGate(0, 0.5f) }
      expectFailure<IllegalArgumentException> { VadGate(-1, 0.5f) }
      for (invalid in floatArrayOf(Float.NaN, Float.POSITIVE_INFINITY, Float.NEGATIVE_INFINITY,
        -Float.MIN_VALUE, Math.nextUp(1f))) {
        expectFailure<IllegalArgumentException> { VadGate(12, invalid) }
      }
    }
    test("VAD history does not alias caller scores") {
      val probabilities = floatArrayOf(0.9f, 0.1f)
      val gate = VadGate(2, 0.5f)
      gate.recordChunk(probabilities)
      probabilities.fill(0f)
      check(gate.isSpeech)
    }
  }
}
