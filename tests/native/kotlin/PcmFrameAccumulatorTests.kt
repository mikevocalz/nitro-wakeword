package com.margelo.nitro.wakeword

import com.margelo.nitro.wakeword.NativeAudioTests.expectFailure
import com.margelo.nitro.wakeword.NativeAudioTests.test

internal object PcmFrameAccumulatorTests {
  fun run() {
    test("partial PCM reads preserve frame boundaries") {
      val frames = mutableListOf<FloatArray>()
      val accumulator = PcmFrameAccumulator(frameSize = 4)
      accumulator.append(floatArrayOf(1f, 2f)) { frames.add(it) }
      check(accumulator.pendingCount == 2 && frames.isEmpty())
      accumulator.append(floatArrayOf(3f, 4f, 5f)) { frames.add(it) }
      check(frames.single().contentEquals(floatArrayOf(1f, 2f, 3f, 4f)))
      check(accumulator.pendingCount == 1)
    }
    test("empty reads do not emit or discard pending samples") {
      val accumulator = PcmFrameAccumulator(4)
      accumulator.append(floatArrayOf(1f)) { error("Incomplete frame emitted") }
      accumulator.append(floatArrayOf()) { error("Empty read emitted") }
      check(accumulator.pendingCount == 1)
    }
    test("completed PCM frames are independently owned") {
      val accumulator = PcmFrameAccumulator(2)
      val frames = mutableListOf<FloatArray>()
      val source = floatArrayOf(1f, 2f, 3f, 4f)
      accumulator.append(source) { frames.add(it) }
      source.fill(-1f)
      accumulator.append(floatArrayOf(5f, 6f)) { frames.add(it) }
      check(frames[0].contentEquals(floatArrayOf(1f, 2f)))
      check(frames[1].contentEquals(floatArrayOf(3f, 4f)))
      frames[0].fill(99f)
      check(frames[1].contentEquals(floatArrayOf(3f, 4f)))
      check(frames[2].contentEquals(floatArrayOf(5f, 6f)))
    }
    test("pending PCM samples do not alias caller memory") {
      val accumulator = PcmFrameAccumulator(4)
      val source = floatArrayOf(1f, 2f)
      accumulator.append(source) { error("Incomplete frame emitted") }
      source.fill(99f)
      accumulator.append(floatArrayOf(3f, 4f)) {
        check(it.contentEquals(floatArrayOf(1f, 2f, 3f, 4f)))
      }
      check(accumulator.pendingCount == 0)
    }
    test("reset drops a previous session's partial PCM") {
      val accumulator = PcmFrameAccumulator(4)
      accumulator.append(floatArrayOf(1f, 2f, 3f)) { error("Incomplete frame emitted") }
      accumulator.reset()
      accumulator.reset()
      check(accumulator.pendingCount == 0)
      val frames = mutableListOf<FloatArray>()
      accumulator.append(floatArrayOf(4f, 5f, 6f, 7f)) { frames.add(it) }
      check(frames.single().contentEquals(floatArrayOf(4f, 5f, 6f, 7f)))
    }
    test("1280-sample capture chunks produce alternating two and three VAD frames") {
      val accumulator = PcmFrameAccumulator(512)
      val frames = mutableListOf<FloatArray>()
      val stream = FloatArray(2560) { it.toFloat() }
      accumulator.append(stream.copyOfRange(0, 1280)) { frames.add(it) }
      check(frames.size == 2 && accumulator.pendingCount == 256)
      accumulator.append(stream.copyOfRange(1280, 2560)) { frames.add(it) }
      check(frames.size == 5 && accumulator.pendingCount == 0)
      check(frames.flatMap { it.toList() } == stream.toList())
    }
    test("arbitrary read partitions preserve a long PCM stream with bounded pending data") {
      val stream = FloatArray(16_000) { (it - 8_000).toFloat() }
      val partitions = intArrayOf(1, 511, 2, 1279, 17, 3000, 1, 8000, 3189)
      val accumulator = PcmFrameAccumulator(1280)
      val frames = mutableListOf<FloatArray>()
      var offset = 0
      for (count in partitions) {
        accumulator.append(stream.copyOfRange(offset, offset + count)) { frames.add(it) }
        check(accumulator.pendingCount in 0..1279)
        offset += count
      }
      check(offset == stream.size && frames.size == 12 && accumulator.pendingCount == 640)
      accumulator.append(FloatArray(640)) { frames.add(it) }
      val expected = stream.toList() + List(640) { 0f }
      check(frames.flatMap { it.toList() } == expected)
    }
    test("warmup's half VAD frame is absent after reset") {
      val accumulator = PcmFrameAccumulator(512)
      repeat(27) { accumulator.append(FloatArray(1280)) {} }
      check(accumulator.pendingCount == 256)
      accumulator.reset()
      var first: FloatArray? = null
      accumulator.append(FloatArray(1280) { 42f }) { if (first == null) first = it }
      check(first?.all { it == 42f } == true)
      check(accumulator.pendingCount == 256)
    }
    test("single-sample frames and exact fills leave no pending PCM") {
      val accumulator = PcmFrameAccumulator(1)
      val frames = mutableListOf<FloatArray>()
      accumulator.append(floatArrayOf(-32768f, 0f, 32767f)) { frames.add(it) }
      check(frames.size == 3 && accumulator.pendingCount == 0)
      check(frames.map { it.single() } == listOf(-32768f, 0f, 32767f))
    }
    test("PCM frame sizes must be positive") {
      expectFailure<IllegalArgumentException> { PcmFrameAccumulator(0) }
      expectFailure<IllegalArgumentException> { PcmFrameAccumulator(-1) }
    }
    test("frame callback failures propagate and reset permits a fresh session") {
      val accumulator = PcmFrameAccumulator(2)
      val failure = IllegalStateException("Inference failed")
      try {
        accumulator.append(floatArrayOf(1f, 2f, 3f)) { throw failure }
        error("Callback failure was swallowed")
      } catch (error: IllegalStateException) {
        check(error === failure)
      }
      accumulator.reset()
      accumulator.append(floatArrayOf(4f, 5f)) {
        check(it.contentEquals(floatArrayOf(4f, 5f)))
      }
    }
  }
}
