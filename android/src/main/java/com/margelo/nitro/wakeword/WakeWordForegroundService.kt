package com.margelo.nitro.wakeword

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import java.util.concurrent.ExecutionException
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference

/** Optional host-declared microphone service. Only the microphone lease holder starts it. */
class WakeWordForegroundService : Service() {
  companion object {
    private const val CHANNEL_ID = "nitro_wakeword"
    private const val NOTIFICATION_ID = 0x5741
    private const val EXTRA_TITLE = "title"
    private const val EXTRA_TEXT = "text"
    private const val EXTRA_REQUEST_ID = "requestId"
    private val nextRequestId = AtomicLong(0L)
    private val desiredRequestId = AtomicLong(0L)
    private val pendingStart = AtomicReference<ForegroundServiceRequest?>(null)

    /** Called on the native owner queue. Android completes startup on the main thread. */
    fun start(context: Context, title: String, text: String) {
      ForegroundServicePreflight.check(context)
      val request = ForegroundServiceRequest(nextRequestId.incrementAndGet())
      check(pendingStart.compareAndSet(null, request)) { "A foreground service start is already pending" }
      desiredRequestId.set(request.id)
      var started = false
      try {
        val intent = Intent(context, WakeWordForegroundService::class.java)
          .putExtra(EXTRA_TITLE, title)
          .putExtra(EXTRA_TEXT, text)
          .putExtra(EXTRA_REQUEST_ID, request.id)
        val component = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
        if (component == null) {
          throw WakeWordException("Foreground service is not declared. Enable it in the Expo plugin or host manifest.")
        }
        try {
          // Platform failure guard, not a readiness delay: success is signaled by onStartCommand.
          request.ready.get(10L, TimeUnit.SECONDS)
          started = true
        } catch (error: TimeoutException) {
          throw WakeWordException("Timed out waiting for Android to start the foreground service", error)
        } catch (error: ExecutionException) {
          throw error.cause ?: error
        }
      } finally {
        pendingStart.compareAndSet(request, null)
        if (!started) desiredRequestId.compareAndSet(request.id, 0L)
      }
    }

    fun stop(context: Context) {
      desiredRequestId.set(0L)
      context.stopService(Intent(context, WakeWordForegroundService::class.java))
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val request = pendingStart.get()
    val requestId = intent?.getLongExtra(EXTRA_REQUEST_ID, 0L) ?: 0L
    if (request == null || request.id != requestId) {
      // A delayed callback from a timed-out start must not resolve or stop its successor.
      if (desiredRequestId.get() == 0L) stopSelf(startId)
      return START_NOT_STICKY
    }
    try {
      val title = intent?.getStringExtra(EXTRA_TITLE) ?: "Listening"
      val text = intent?.getStringExtra(EXTRA_TEXT) ?: "Wake word detection is active"
      val notification = buildNotification(title, text)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
      request.ready.complete(Unit)
    } catch (error: Exception) {
      // Android 12+/14+ background-start/while-in-use restrictions reject start()
      // instead of crashing the app from this Service callback.
      request.ready.completeExceptionally(error)
      stopSelf(startId)
    }
    return START_NOT_STICKY
  }

  private fun buildNotification(title: String, text: String): Notification {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = getSystemService(NotificationManager::class.java)
      val channel = NotificationChannel(CHANNEL_ID, "Wake word", NotificationManager.IMPORTANCE_LOW)
      manager.createNotificationChannel(channel)
    }
    val icon = applicationInfo.icon.takeIf { it != 0 } ?: android.R.drawable.ic_btn_speak_now
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(text)
      .setSmallIcon(icon)
      .setOngoing(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .build()
  }
}
