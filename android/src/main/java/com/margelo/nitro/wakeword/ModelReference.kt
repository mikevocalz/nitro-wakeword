package com.margelo.nitro.wakeword

import java.io.File
import java.net.URI

internal object ModelReference {
  private val scheme = Regex("^[A-Za-z][A-Za-z0-9+.-]*:")

  fun localFile(reference: String): File? {
    require(reference.isNotBlank()) { "Model reference must be nonempty" }
    if (reference.startsWith("/")) return File(reference)
    if (!scheme.containsMatchIn(reference)) {
      require(!reference.contains('\\') && reference.split('/').none { it.isEmpty() || it == "." || it == ".." }) {
        "Bundled model names cannot contain empty or parent path components"
      }
      return null
    }
    val uri = URI(reference)
    require(uri.scheme.equals("file", ignoreCase = true)) { "Only local file URIs and asset names are supported" }
    require(!uri.isOpaque && uri.rawAuthority.isNullOrEmpty() && uri.rawQuery == null && uri.rawFragment == null) {
      "Model file URI must be local, without an authority, query, or fragment"
    }
    val path = uri.path
    require(!path.isNullOrEmpty() && path.startsWith("/")) { "Model file URI must contain an absolute path" }
    return File(path)
  }

  fun defaultKeyword(reference: String): String {
    val name = localFile(reference)?.name ?: reference.substringAfterLast('/')
    return name.substringBeforeLast('.')
  }
}
