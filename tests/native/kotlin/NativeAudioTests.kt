package com.margelo.nitro.wakeword

/** Runs the production pure Kotlin helpers on the host JVM, without Android/ONNX substitutes. */
internal object NativeAudioTests {
  private var passed = 0

  @JvmStatic
  fun main(args: Array<String>) {
    PcmFrameAccumulatorTests.run()
    VadGateTests.run()
    ModelOutputValidationTests.run()
    MicrophoneLeaseTests.run()
    println("PASS: $passed pure Kotlin audio/VAD tests (host JVM; no Android or ONNX runtime)")
  }

  fun test(name: String, body: () -> Unit) {
    body()
    passed += 1
    println("PASS: $name")
  }

  inline fun <reified T : Throwable> expectFailure(body: () -> Unit) {
    try {
      body()
    } catch (error: Throwable) {
      check(error is T) { "Expected ${T::class.simpleName}, got $error" }
      return
    }
    error("Expected ${T::class.simpleName}")
  }
}
