package com.margelo.nitro.wakeword

import android.util.Log
import androidx.annotation.Keep
import com.facebook.proguard.annotations.DoNotStrip
import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.Promise
import java.util.concurrent.atomic.AtomicBoolean

@DoNotStrip
@Keep
class HybridWakeWord : HybridWakeWordSpec() {
  private val context
    get() = NitroModules.applicationContext ?: throw WakeWordException("React context unavailable")

  private val queue = WakeWordQueue()
  private val microphoneToken = Any()
  private val disposed = AtomicBoolean(false)
  // All native resource access, including inference, belongs to queue.
  private var engine: OpenWakeWordEngine? = null
  @Volatile private var capture: AudioCapture? = null
  private var generation = 0L
  private var foregroundService = false
  private var serviceStarted = false
  private var notificationTitle = "Listening"
  private var notificationText = "Wake word detection is active"

  @Volatile private var loaded = false
  @Volatile private var listening = false
  @Volatile private var resourceBytes = 0L
  @Volatile private var detectionListener: ((WakeWordDetection) -> Unit)? = null
  @Volatile private var scoreListener: ((String, Double) -> Unit)? = null
  @Volatile private var errorListener: ((String) -> Unit)? = null

  override val isLoaded: Boolean
    get() = loaded
  override val isListening: Boolean
    get() = listening && capture?.isRunning == true
  // Lower-bound estimate of model bytes, excluding ONNX Runtime's internal arena.
  override val memorySize: Long
    get() = resourceBytes

  override fun load(config: WakeWordConfig): Promise<Unit> = command {
    try {
      stopCapture()
    } finally {
      closeEngine()
    }
    WakeWordConfigValidation.validate(config)
    val ctx = context
    val vadThreshold = (config.vadThreshold ?: 0.3).toFloat()
    val specs = config.models.map { model ->
      WakeWordKeywordSpec(
        keyword = model.keyword ?: ModelResolver.defaultKeyword(model.model),
        bytes = ModelResolver.load(ctx, model.model),
        threshold = (model.threshold ?: 0.5).toFloat(),
        patience = (model.patience ?: 1.0).toInt(),
      )
    }
    val mel = ModelResolver.load(ctx, "melspectrogram.onnx")
    val embedding = ModelResolver.load(ctx, "embedding_model.onnx")
    val vad = if (vadThreshold > 0f) ModelResolver.load(ctx, "silero_vad.onnx") else null
    engine = OpenWakeWordEngine(
      melBytes = mel,
      embeddingBytes = embedding,
      vadBytes = vad,
      vadThreshold = vadThreshold,
      refractoryMs = config.refractoryMs ?: 1000.0,
      keywordSpecs = specs,
    )
    foregroundService = config.foregroundService ?: false
    notificationTitle = config.notificationTitle ?: "Listening"
    notificationText = config.notificationText ?: "Wake word detection is active"
    resourceBytes = mel.size.toLong() + embedding.size + (vad?.size ?: 0) + specs.sumOf { it.bytes.size.toLong() }
    loaded = true
  }

  override fun unload(): Promise<Unit> = command {
    try {
      stopCapture()
    } finally {
      detectionListener = null
      scoreListener = null
      errorListener = null
      closeEngine()
    }
  }

  override fun start(): Promise<Unit> = command {
    if (listening && capture?.isRunning == true) return@command
    val loadedEngine = engine ?: throw WakeWordException("Call load() before start()")
    if (!hasMicrophonePermission()) throw WakeWordException("Microphone permission not granted")
    // A failed recorder may have posted cleanup behind this start request.
    stopCapture()
    MicrophoneLease.claim(microphoneToken)
    val currentGeneration = ++generation
    try {
      loadedEngine.reset()
      val newCapture = AudioCapture(
        chunkSize = OpenWakeWordEngine.CHUNK_SIZE,
        onChunk = { chunk -> queue.processAndWait { processChunk(currentGeneration, chunk) } },
        onError = { message -> queue.execute { captureFailed(currentGeneration, message) } },
      )
      capture = newCapture
      if (foregroundService) {
        // Set before dispatch so even a partially-started service is stopped on failure.
        serviceStarted = true
        WakeWordForegroundService.start(context, notificationTitle, notificationText)
      }
      newCapture.start()
      listening = true
    } catch (error: Throwable) {
      try {
        stopCapture()
      } catch (cleanupError: Throwable) {
        error.addSuppressed(cleanupError)
      }
      throw error
    }
  }

  override fun stop(): Promise<Unit> = command { stopCapture() }

  override fun setThreshold(keyword: String, threshold: Double): Promise<Unit> = command {
    WakeWordConfigValidation.threshold(threshold)
    val loadedEngine = engine ?: throw WakeWordException("Call load() before setThreshold()")
    loadedEngine.setThreshold(keyword, threshold.toFloat())
  }

  private fun command(operation: () -> Unit): Promise<Unit> {
    if (disposed.get()) return Promise.rejected(WakeWordException("Wake word instance is disposed"))
    return queue.run {
      check(!disposed.get()) { "Wake word instance is disposed" }
      operation()
    }
  }

  private fun stopCapture() {
    ++generation
    listening = false
    val previous = capture
    capture = null
    try {
      previous?.stop()
    } finally {
      try {
        if (serviceStarted) WakeWordForegroundService.stop(context)
      } finally {
        serviceStarted = false
        MicrophoneLease.release(microphoneToken)
      }
    }
  }

  private fun closeEngine() {
    val previous = engine
    engine = null
    loaded = false
    resourceBytes = 0L
    previous?.close()
  }

  private fun captureFailed(currentGeneration: Long, message: String) {
    if (generation != currentGeneration || disposed.get()) return
    val detail = try {
      stopCapture()
      message
    } catch (error: Exception) {
      "$message; cleanup failed: ${error.message}"
    }
    try {
      errorListener?.invoke(detail)
    } catch (error: Exception) {
      Log.e("NitroWakeWord", "Could not deliver capture error", error)
    }
  }

  private fun processChunk(currentGeneration: Long, chunk: FloatArray) {
    if (generation != currentGeneration || !listening || disposed.get()) return
    val result = engine?.process(chunk) ?: return
    // No locks are held while entering Nitro/JS. stop() is queued after this frame.
    val score = scoreListener
    if (score != null) {
      for ((keyword, value) in result.scores) {
        if (disposed.get()) return
        score(keyword, value.toDouble())
      }
    }
    val detection = detectionListener
    if (detection != null) {
      for (value in result.detections) {
        if (disposed.get()) return
        detection(WakeWordDetection(value.keyword, value.score.toDouble(), value.timestamp))
      }
    }
  }

  override fun setDetectionListener(listener: (detection: WakeWordDetection) -> Unit) { detectionListener = listener }
  override fun clearDetectionListener() { detectionListener = null }
  override fun setScoreListener(listener: (keyword: String, score: Double) -> Unit) { scoreListener = listener }
  override fun clearScoreListener() { scoreListener = null }
  override fun setErrorListener(listener: (message: String) -> Unit) { errorListener = listener }
  override fun clearErrorListener() { errorListener = null }

  override fun hasMicrophonePermission(): Boolean = MicrophonePermission.isGranted()
  override fun requestMicrophonePermission(): Promise<Boolean> = MicrophonePermission.request()

  override fun dispose() {
    if (disposed.compareAndSet(false, true)) {
      detectionListener = null
      scoreListener = null
      errorListener = null
      queue.execute {
        try {
          try {
            stopCapture()
          } finally {
            closeEngine()
          }
        } catch (error: Exception) {
          Log.e("NitroWakeWord", "Failed to dispose native resources", error)
        }
      }
    }
    super.dispose()
  }
}
