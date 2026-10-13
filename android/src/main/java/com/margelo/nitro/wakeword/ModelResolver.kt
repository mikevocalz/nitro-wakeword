package com.margelo.nitro.wakeword

import android.content.Context
import java.io.File
import java.net.URI
import java.net.URISyntaxException

/** Resolves local absolute paths/file URIs, then app assets (including optional host models). */
internal object ModelResolver {
  private val scheme = Regex("^[A-Za-z][A-Za-z0-9+.-]*:")

  fun load(context: Context, reference: String): ByteArray {
    val file = localFile(reference)
    if (file != null) {
      if (!file.isFile) throw WakeWordException("Model file not found: $reference")
      return file.readBytes()
    }
    val assetName = if (reference.contains('.')) reference else "$reference.onnx"
    try {
      return context.assets.open(assetName).use { it.readBytes() }
    } catch (error: Exception) {
      throw WakeWordException("Model not found in assets: $assetName", error)
    }
  }

  private fun localFile(reference: String): File? {
    if (reference.startsWith("/")) return File(reference)
    if (!scheme.containsMatchIn(reference)) return null
    val uri = try {
      URI(reference)
    } catch (error: URISyntaxException) {
      throw WakeWordException("Invalid model file URI: $reference", error)
    }
    require(uri.scheme.equals("file", ignoreCase = true)) { "Only local file URIs and asset names are supported" }
    require(!uri.isOpaque && uri.rawAuthority.isNullOrEmpty() && uri.rawQuery == null && uri.rawFragment == null) {
      "Model file URI must be local, without an authority, query, or fragment"
    }
    // URI.path decodes percent escapes exactly once, including spaces and Unicode.
    val path = uri.path
    require(!path.isNullOrEmpty() && path.startsWith("/")) { "Model file URI must contain an absolute path" }
    return File(path)
  }

  fun defaultKeyword(reference: String): String =
    reference.substringAfterLast('/').substringBeforeLast('.')
}
