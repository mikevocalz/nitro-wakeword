package com.margelo.nitro.wakeword

import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.security.MessageDigest

internal object ModelIntegrity {
  const val MAXIMUM_BYTES = 256 * 1024 * 1024
  private val digest = Regex("[0-9a-fA-F]{64}")

  fun validateDigest(expected: String?) {
    require(expected == null || digest.matches(expected)) { "sha256 must contain exactly 64 hexadecimal characters" }
  }

  fun read(input: InputStream, sha256: String?, limit: Int = MAXIMUM_BYTES): ByteArray {
    validateDigest(sha256)
    require(limit > 0) { "Model byte limit must be positive" }
    val output = ByteArrayOutputStream()
    val buffer = ByteArray(minOf(65536, limit))
    while (true) {
      val count = input.read(buffer, 0, minOf(buffer.size, limit - output.size() + 1))
      if (count == -1) break
      require(count > 0) { "Model stream returned no data without reaching EOF" }
      require(count <= limit - output.size()) { "Model exceeds the 256 MiB size limit" }
      output.write(buffer, 0, count)
    }
    val bytes = output.toByteArray()
    require(bytes.isNotEmpty()) { "Model file is empty" }
    if (sha256 != null) {
      val actual = MessageDigest.getInstance("SHA-256").digest(bytes)
        .joinToString("") { "%02x".format(it.toInt() and 0xff) }
      require(actual.equals(sha256, ignoreCase = true)) { "Model SHA-256 mismatch" }
    }
    return bytes
  }
}
