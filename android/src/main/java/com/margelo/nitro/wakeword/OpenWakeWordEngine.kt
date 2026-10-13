package com.margelo.nitro.wakeword

import ai.onnxruntime.OrtEnvironment
import android.os.SystemClock

/**
 * openWakeWord inference pipeline (see NOTICE).
 *
 * 16 kHz mono int16-scaled float audio, processed in 80 ms chunks (1280 samples).
 * Each chunk: melspectrogram over the last 1760 samples -> 8 new mel frames (32 bins),
 * transformed `x / 10 + 2`; the last 76 mel frames -> one 96-dim speech embedding;
 * the last `N` embeddings (`N` = classifier window, usually 16) -> keyword score.
 * Optionally gated by Silero VAD.
 */
internal class OpenWakeWordEngine(
  melBytes: ByteArray,
  embeddingBytes: ByteArray,
  vadBytes: ByteArray?,
  vadThreshold: Float,
  keywordSpecs: List<WakeWordKeywordSpec>,
) : AutoCloseable {
  companion object {
    const val SAMPLE_RATE = 16000
    const val CHUNK_SIZE = 1280
    const val MEL_CONTEXT = 480
    const val MEL_WINDOW = 76
    const val MEL_BINS = 32
    const val EMBEDDING_DIM = 96
    const val MAX_CLASSIFIER_WINDOW = 1024
    const val VAD_FRAME = 512
    const val VAD_HISTORY = 12
  }

  private val env: OrtEnvironment = OrtEnvironment.getEnvironment()
  private val models = ArrayList<OnnxModel>()
  private val melModel: OnnxModel
  private val embeddingModel: OnnxModel
  private val vadModel: OnnxModel?
  private val keywords: List<WakeWordKeyword>
  private val maxWindow: Int

  private val raw = FloatArray(CHUNK_SIZE + MEL_CONTEXT)
  private val mel = FloatArray(MEL_WINDOW * MEL_BINS) { 1f }
  private var melFramesSeen = 0
  private val features: FloatArray
  private var featuresSeen = 0

  private var vadH = FloatArray(2 * 64)
  private var vadC = FloatArray(2 * 64)
  private val vadFrames = PcmFrameAccumulator(VAD_FRAME)
  private val vadGate = VadGate(VAD_HISTORY, vadThreshold)

  init {
    try {
      melModel = openModel(melBytes)
      embeddingModel = openModel(embeddingBytes)
      vadModel = if (vadThreshold > 0f && vadBytes != null) openModel(vadBytes) else null
      keywords = keywordSpecs.map { spec ->
        val model = openModel(spec.bytes)
        WakeWordKeyword(spec.keyword, model, resolveWindow(model, spec.keyword), spec.threshold, spec.patience, spec.refractoryMs)
      }
      maxWindow = keywords.maxOfOrNull { it.window } ?: 16
      features = FloatArray(maxWindow * EMBEDDING_DIM)
      warmUp()
    } catch (error: Throwable) {
      try {
        close()
      } catch (cleanupError: Throwable) {
        error.addSuppressed(cleanupError)
      }
      throw error
    }
  }

  private fun openModel(bytes: ByteArray): OnnxModel {
    val model = OnnxModel(env, bytes)
    models.add(model)
    return model
  }

  private fun resolveWindow(model: OnnxModel, name: String): Int {
    val shape = model.firstInputShape()
    require(shape != null && shape.size == 3 &&
      (shape[0] == 1L || shape[0] == -1L) &&
      (shape[2] == EMBEDDING_DIM.toLong() || shape[2] == -1L)) {
      "Classifier '$name' must accept [1, N, 96]"
    }
    if (shape[1] != -1L) {
      require(shape[1] in 1L..MAX_CLASSIFIER_WINDOW.toLong()) {
        "Classifier '$name' input window must be in [1, $MAX_CLASSIFIER_WINDOW]"
      }
      val window = shape[1].toInt()
      val output = model.run(FloatArray(window * EMBEDDING_DIM), longArrayOf(1, window.toLong(), EMBEDDING_DIM.toLong()))
      WakeWordKeyword.validatedScore(output, name)
      return window
    }
    // Probe symbolic dimensions, then validate output even when VAD would gate warmup.
    for (window in intArrayOf(16, 28, 20, 24, 32, 12, 36, 40, 48, 64, 8)) {
      val output = try {
        model.run(FloatArray(window * EMBEDDING_DIM), longArrayOf(1, window.toLong(), EMBEDDING_DIM.toLong()))
      } catch (_: Exception) {
        continue
      }
      WakeWordKeyword.validatedScore(output, name)
      return window
    }
    throw WakeWordException("Could not determine input window of classifier '$name'. Expected [1, N, 96].")
  }

  private fun warmUp() {
    val zeros = FloatArray(CHUNK_SIZE)
    repeat(MEL_WINDOW / 8 + maxWindow + 2) { processChunk(zeros, emit = false) }
    keywords.forEach { it.consecutive = 0; it.cooldown.reset() }
    // Warmup may end on a partial VAD frame. Real capture starts with fresh VAD state.
    resetVad()
  }

  /**
   * Flushes every buffer back to "silence". Call before (re)starting capture:
   * the mel/embedding windows still hold the audio that triggered the last
   * detection, and would fire again on the first chunk after a stop/start.
   */
  fun reset() {
    raw.fill(0f)
    mel.fill(1f)
    melFramesSeen = 0
    features.fill(0f)
    featuresSeen = 0
    resetVad()
    warmUp()
  }

  private fun resetVad() {
    vadH.fill(0f)
    vadC.fill(0f)
    vadFrames.reset()
    vadGate.reset()
  }

  fun setThreshold(keyword: String, threshold: Float) {
    val target = keywords.firstOrNull { it.keyword == keyword }
      ?: throw WakeWordException("Unknown keyword: $keyword")
    target.threshold = threshold
  }

  /** Processes exactly one 1280-sample chunk. Must be called from a single thread. */
  fun process(chunk: FloatArray): WakeWordFrameResult = processChunk(chunk, emit = true)

  private fun processChunk(chunk: FloatArray, emit: Boolean): WakeWordFrameResult {
    require(chunk.size == CHUNK_SIZE) { "chunk must be 1280 samples" }

    if (vadModel != null) runVad(chunk)

    // Sliding raw buffer: [ previous 480 | new 1280 ]
    System.arraycopy(raw, raw.size - MEL_CONTEXT, raw, 0, MEL_CONTEXT)
    System.arraycopy(chunk, 0, raw, MEL_CONTEXT, CHUNK_SIZE)

    val melOut = melModel.run(raw, longArrayOf(1, raw.size.toLong()))
    ModelOutputValidation.finite(melOut, 8 * MEL_BINS, "mel")
    val newFrames = 8
    for (i in melOut.indices) melOut[i] = melOut[i] / 10f + 2f
    appendFrames(melOut, newFrames * MEL_BINS, mel)
    melFramesSeen = minOf(MEL_WINDOW, melFramesSeen + newFrames)
    if (melFramesSeen < MEL_WINDOW) return WakeWordFrameResult(emptyList(), emptyList())

    val embedding = embeddingModel.run(mel, longArrayOf(1, MEL_WINDOW.toLong(), MEL_BINS.toLong(), 1))
    ModelOutputValidation.finite(embedding, EMBEDDING_DIM, "embedding")
    appendFrames(embedding, EMBEDDING_DIM, features)
    featuresSeen = minOf(maxWindow, featuresSeen + 1)

    val scores = ArrayList<Pair<String, Float>>(keywords.size)
    val detections = ArrayList<WakeWordDetectionResult>(0)
    val speech = vadModel == null || vadGate.isSpeech
    val now = SystemClock.elapsedRealtime() / 1000.0

    for (keyword in keywords) {
      if (featuresSeen < keyword.window) continue
      // VAD gate closed: the score would be forced to 0 anyway, skip the classifier.
      val score = if (!speech) 0f else {
        val length = keyword.window * EMBEDDING_DIM
        val slice = features.copyOfRange(features.size - length, features.size)
        val output = keyword.model.run(slice, longArrayOf(1, keyword.window.toLong(), EMBEDDING_DIM.toLong()))
        WakeWordKeyword.validatedScore(output, keyword.keyword)
      }
      scores.add(keyword.keyword to score)
      if (!emit) continue
      if (!speech) {
        keyword.consecutive = 0
        continue
      }

      if (score >= keyword.threshold) {
        if (keyword.consecutive < keyword.patience) keyword.consecutive += 1
      } else {
        keyword.consecutive = 0
      }
      if (keyword.consecutive >= keyword.patience && keyword.cooldown.accept(now)) {
        keyword.consecutive = 0
        detections.add(WakeWordDetectionResult(keyword.keyword, score, System.currentTimeMillis().toDouble()))
      }
    }
    return WakeWordFrameResult(scores, detections)
  }

  /** Shifts `buffer` left by `count` and appends the first `count` values of `values`. */
  private fun appendFrames(values: FloatArray, requested: Int, buffer: FloatArray) {
    val count = minOf(requested, values.size)
    if (count <= 0) return
    if (count >= buffer.size) {
      System.arraycopy(values, count - buffer.size, buffer, 0, buffer.size)
      return
    }
    System.arraycopy(buffer, count, buffer, 0, buffer.size - count)
    System.arraycopy(values, 0, buffer, buffer.size - count, count)
  }

  private fun runVad(chunk: FloatArray) {
    val vad = vadModel ?: return
    val probabilities = ArrayList<Float>(3)
    vadFrames.append(chunk) { input ->
      // Silero expects audio normalised to [-1, 1]. The emitted frame is owned here.
      for (i in input.indices) input[i] /= 32768f
      vad.floatTensor(input, longArrayOf(1, VAD_FRAME.toLong())).use { inputTensor ->
        vad.int64Scalar(SAMPLE_RATE.toLong()).use { srTensor ->
          vad.floatTensor(vadH, longArrayOf(2, 1, 64)).use { hTensor ->
            vad.floatTensor(vadC, longArrayOf(2, 1, 64)).use { cTensor ->
              val outputs = vad.run(mapOf("input" to inputTensor, "sr" to srTensor, "h" to hTensor, "c" to cTensor))
              val nextH = ModelOutputValidation.finite(outputs["hn"], 128, "VAD hn")
              val nextC = ModelOutputValidation.finite(outputs["cn"], 128, "VAD cn")
              val probability = ModelOutputValidation.probability(outputs["output"], "VAD output")
              vadH = nextH
              vadC = nextC
              probabilities.add(probability)
            }
          }
        }
      }
    }
    vadGate.recordChunk(probabilities.toFloatArray())
  }

  override fun close() {
    val closing = models.toList().asReversed()
    models.clear()
    var failure: Throwable? = null
    for (model in closing) {
      try {
        model.close()
      } catch (error: Throwable) {
        val previous = failure
        if (previous == null) failure = error else previous.addSuppressed(error)
      }
    }
    failure?.let { throw it }
  }
}
