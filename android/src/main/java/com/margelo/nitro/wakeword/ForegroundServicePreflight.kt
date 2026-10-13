package com.margelo.nitro.wakeword

import android.Manifest
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.content.ContextCompat

/** Host opt-in is required; the library's manifest grants only RECORD_AUDIO. */
internal object ForegroundServicePreflight {
  fun check(context: Context) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      requirePermission(context, Manifest.permission.FOREGROUND_SERVICE)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      requirePermission(context, Manifest.permission.FOREGROUND_SERVICE_MICROPHONE)
    }
    @Suppress("DEPRECATION")
    val service = try {
      context.packageManager.getServiceInfo(ComponentName(context, WakeWordForegroundService::class.java), 0)
    } catch (error: PackageManager.NameNotFoundException) {
      throw WakeWordException("Declare WakeWordForegroundService in the host manifest or enable the Expo plugin option", error)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      require(service.foregroundServiceType and ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE != 0) {
        "WakeWordForegroundService must declare foregroundServiceType=\"microphone\""
      }
    }
  }

  private fun requirePermission(context: Context, permission: String) {
    if (ContextCompat.checkSelfPermission(context, permission) != PackageManager.PERMISSION_GRANTED) {
      throw WakeWordException("Declare $permission in the host manifest or enable the Expo plugin androidForegroundService option")
    }
  }
}
