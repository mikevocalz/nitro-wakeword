package com.margelo.nitro.wakeword

import android.content.Context

/** Resolves local absolute paths/file URIs, then app assets (including optional host models). */
internal object ModelResolver {
  fun load(context: Context, reference: String, sha256: String? = null): ByteArray {
    ModelIntegrity.validateDigest(sha256)
    val file = ModelReference.localFile(reference)
    if (file != null) {
      if (!file.isFile) throw WakeWordException("Model file not found: $reference")
      return file.inputStream().use { ModelIntegrity.read(it, sha256) }
    }
    val assetName = if (reference.contains('.')) reference else "$reference.onnx"
    try {
      return context.assets.open(assetName).use { ModelIntegrity.read(it, sha256) }
    } catch (error: Exception) {
      throw WakeWordException("Model not found in assets: $assetName", error)
    }
  }

  fun defaultKeyword(reference: String): String = ModelReference.defaultKeyword(reference)
}
