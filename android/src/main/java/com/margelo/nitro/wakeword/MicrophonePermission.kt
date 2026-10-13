package com.margelo.nitro.wakeword

import android.Manifest
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.Promise

internal object MicrophonePermission {
  private const val REQUEST_CODE = 0x5742
  private val main = Handler(Looper.getMainLooper())
  // Owned by the main thread. Concurrent requests share the one Android dialog.
  private val pending = mutableListOf<Promise<Boolean>>()
  private val context
    get() = NitroModules.applicationContext ?: throw WakeWordException("React context unavailable")

  fun isGranted(): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

  fun request(): Promise<Boolean> {
    val promise = Promise<Boolean>()
    main.post {
      try {
        if (isGranted()) {
          promise.resolve(true)
          return@post
        }
        if (pending.isNotEmpty()) {
          pending.add(promise)
          return@post
        }
        val activity = context.currentActivity as? PermissionAwareActivity
          ?: throw WakeWordException("No current activity to request permission from")
        pending.add(promise)
        activity.requestPermissions(
          arrayOf(Manifest.permission.RECORD_AUDIO), REQUEST_CODE,
          PermissionListener { requestCode, _, grantResults ->
            if (requestCode != REQUEST_CODE) return@PermissionListener false
            val granted = grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
            val completed = pending.toList()
            pending.clear()
            completed.forEach { it.resolve(granted) }
            true
          },
        )
      } catch (error: Exception) {
        val failed = if (pending.isEmpty()) listOf(promise) else pending.toList()
        pending.clear()
        failed.forEach { it.reject(error) }
      }
    }
    return promise
  }
}
