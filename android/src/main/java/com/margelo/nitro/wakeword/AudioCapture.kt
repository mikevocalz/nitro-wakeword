package com.margelo.nitro.wakeword

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Process

/**
 * A single-use reader. Lifecycle calls come from the owning queue; the reader
 * owns release after thread startup. stop() always unblocks read/queued inference
 * before joining, and never holds an engine or callback lock.
 */
internal class AudioCapture(
  private val chunkSize: Int,
  private val onChunk: (FloatArray) -> Unit,
  private val onError: (String) -> Unit,
) {
  @Volatile var isRunning = false
    private set
  private var thread: Thread? = null
  private var record: AudioRecord? = null

  @SuppressLint("MissingPermission")
  fun start() {
    check(record == null && thread == null) { "AudioCapture instances are single-use" }
    val sampleRate = OpenWakeWordEngine.SAMPLE_RATE
    val minBuffer = AudioRecord.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
    if (minBuffer <= 0) throw WakeWordException("AudioRecord.getMinBufferSize failed ($minBuffer)")
    val recorder = AudioRecord(
      MediaRecorder.AudioSource.VOICE_RECOGNITION, sampleRate,
      AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT,
      maxOf(minBuffer, chunkSize * 2 * 10),
    )
    record = recorder
    try {
      if (recorder.state != AudioRecord.STATE_INITIALIZED) {
        throw WakeWordException("AudioRecord failed to initialize")
      }
      recorder.startRecording()
      if (recorder.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
        throw WakeWordException("AudioRecord failed to start recording")
      }
      isRunning = true
      val reader = Thread({ loop(recorder) }, "NitroWakeWord-audio")
      thread = reader
      reader.start()
    } catch (error: Throwable) {
      isRunning = false
      thread = null
      record = null
      try {
        release(recorder)
      } catch (cleanupError: Throwable) {
        error.addSuppressed(cleanupError)
      }
      throw error
    }
  }

  private fun loop(recorder: AudioRecord) {
    var failure: String? = null
    try {
      Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO)
      val shorts = ShortArray(chunkSize)
      while (isRunning) {
        var filled = 0
        while (filled < chunkSize && isRunning) {
          val read = recorder.read(shorts, filled, chunkSize - filled, AudioRecord.READ_BLOCKING)
          if (read <= 0) throw WakeWordException("AudioRecord.read failed ($read)")
          filled += read
        }
        if (!isRunning) break
        // The owner queue can outlive an interrupted reader wait. Give it an owned buffer.
        onChunk(FloatArray(chunkSize) { shorts[it].toFloat() })
      }
    } catch (error: Throwable) {
      if (isRunning) failure = error.message ?: "Audio capture or inference failed"
    } finally {
      isRunning = false
      try {
        release(recorder)
      } catch (error: Exception) {
        failure = "${failure ?: "Audio capture cleanup failed"}: ${error.message}"
      }
      failure?.let(onError)
    }
  }

  fun stop() {
    isRunning = false
    val reader = thread
    // The reader may be blocked on the owner queue, which is executing this stop.
    reader?.interrupt()
    try {
      record?.stop() // Unblocks READ_BLOCKING before join.
    } catch (_: IllegalStateException) {
      // A read-error path may already have released the recorder.
    }
    if (reader != null && reader !== Thread.currentThread()) reader.join()
    thread = null
    record = null
  }

  private fun release(recorder: AudioRecord) {
    try {
      recorder.stop()
    } catch (_: IllegalStateException) {
      // Already stopped, or startup failed before recording began.
    } finally {
      recorder.release()
    }
  }
}
