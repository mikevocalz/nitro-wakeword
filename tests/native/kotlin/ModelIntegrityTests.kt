package com.margelo.nitro.wakeword

import java.io.ByteArrayInputStream
import java.io.File

internal object ModelIntegrityTests {
  fun run() {
    val abc = "abc".toByteArray()
    val hash = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    NativeAudioTests.test("SHA-256 accepts exact bytes and uppercase digests") {
      check(ModelIntegrity.read(ByteArrayInputStream(abc), hash).contentEquals(abc))
      check(ModelIntegrity.read(ByteArrayInputStream(abc), hash.uppercase()).contentEquals(abc))
    }
    NativeAudioTests.test("model integrity rejects mismatched and malformed hashes") {
      for (bad in listOf("0".repeat(64), "g".repeat(64), hash.dropLast(1), " $hash")) {
        NativeAudioTests.expectFailure<IllegalArgumentException> { ModelIntegrity.read(ByteArrayInputStream(abc), bad) }
      }
    }
    NativeAudioTests.test("model reads reject empty and oversized data") {
      NativeAudioTests.expectFailure<IllegalArgumentException> { ModelIntegrity.read(ByteArrayInputStream(byteArrayOf()), null) }
      NativeAudioTests.expectFailure<IllegalArgumentException> { ModelIntegrity.read(ByteArrayInputStream(abc), null, limit = 2) }
      check(ModelIntegrity.read(ByteArrayInputStream(abc), null, limit = 3).contentEquals(abc))
    }
    NativeAudioTests.test("verified bytes do not change after file replacement") {
      val file = File.createTempFile("nitro-model", ".onnx")
      try {
        file.writeBytes(abc)
        val verified = file.inputStream().use { ModelIntegrity.read(it, hash) }
        file.writeText("different model")
        check(verified.contentEquals(abc))
      } finally { file.delete() }
    }
    NativeAudioTests.test("local file references decode once and reject remote or traversal forms") {
      check(ModelReference.localFile("file:///tmp/hey%20deca.onnx")?.path == "/tmp/hey deca.onnx")
      check(ModelReference.defaultKeyword("file:///tmp/hey%20deca.onnx") == "hey deca")
      check(ModelReference.localFile("models/deca.onnx") == null)
      for (bad in listOf("https://example.com/model.onnx", "file://server/a", "file:///a?b", "file:///a#b", "../a", "models//a", "", "file:relative")) {
        NativeAudioTests.expectFailure<IllegalArgumentException> { ModelReference.localFile(bad) }
      }
    }
    NativeAudioTests.test("per-keyword cooldowns stay independent and reset") {
      val short = KeywordCooldown(100.0)
      val long = KeywordCooldown(2000.0)
      check(short.accept(10.0) && long.accept(10.0))
      check(short.accept(10.2) && !long.accept(10.2))
      check(long.accept(12.0))
      long.reset()
      check(long.accept(12.1))
      val zero = KeywordCooldown(0.0)
      check(zero.accept(1.0) && zero.accept(1.0))
    }
    NativeAudioTests.test("invalid keyword cooldowns fail") {
      for (bad in listOf(-1.0, Double.NaN, Double.POSITIVE_INFINITY)) {
        NativeAudioTests.expectFailure<IllegalArgumentException> { KeywordCooldown(bad) }
      }
    }
  }
}
