package com.margelo.nitro.wakeword

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import ai.onnxruntime.TensorInfo
import java.nio.FloatBuffer
import java.nio.LongBuffer

/** Thin wrapper over an [OrtSession] for float32 models. */
internal class OnnxModel(private val env: OrtEnvironment, bytes: ByteArray, useXnnpack: Boolean = true) : AutoCloseable {
  // ONNX Runtime requires SessionOptions to outlive the sessions created from it.
  private val options = OrtSession.SessionOptions()
  private val session: OrtSession
  val inputNames: List<String>
  val outputNames: List<String>

  init {
    var created: OrtSession? = null
    try {
      options.setIntraOpNumThreads(1)
      options.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
      if (useXnnpack) {
        try {
          options.addXnnpack(mapOf("intra_op_num_threads" to "1"))
        } catch (_: Exception) {
          // Older runtimes without the XNNPACK EP fall back to the default CPU EP.
        }
      }
      val built = env.createSession(bytes, options)
      created = built
      session = built
      inputNames = built.inputNames.toList()
      outputNames = built.outputNames.toList()
    } catch (error: Throwable) {
      try {
        created?.close()
      } catch (cleanupError: Throwable) {
        error.addSuppressed(cleanupError)
      }
      try {
        options.close()
      } catch (cleanupError: Throwable) {
        error.addSuppressed(cleanupError)
      }
      throw error
    }
  }

  /** Declared shape of the first input, `-1` for symbolic dimensions. */
  fun firstInputShape(): LongArray? {
    val info = session.inputInfo.values.firstOrNull()?.info as? TensorInfo ?: return null
    return info.shape
  }

  fun floatTensor(values: FloatArray, shape: LongArray): OnnxTensor =
    OnnxTensor.createTensor(env, FloatBuffer.wrap(values), shape)

  fun int64Scalar(value: Long): OnnxTensor =
    OnnxTensor.createTensor(env, LongBuffer.wrap(longArrayOf(value)), longArrayOf())

  /** Single float input -> first output as flat floats. */
  fun run(input: FloatArray, shape: LongArray): FloatArray {
    val inputName = inputNames.firstOrNull() ?: throw WakeWordException("ONNX model has no input")
    floatTensor(input, shape).use { tensor ->
      session.run(mapOf(inputName to tensor)).use { result ->
        val out = result[0] as OnnxTensor
        return toFloatArray(out)
      }
    }
  }

  fun run(inputs: Map<String, OnnxTensor>): Map<String, FloatArray> {
    session.run(inputs).use { result ->
      val map = HashMap<String, FloatArray>()
      for ((name, value) in result) {
        map[name] = toFloatArray(value as OnnxTensor)
      }
      return map
    }
  }

  private fun toFloatArray(tensor: OnnxTensor): FloatArray {
    val buffer = tensor.floatBuffer
    val out = FloatArray(buffer.remaining())
    buffer.get(out)
    return out
  }

  override fun close() {
    try {
      session.close()
    } finally {
      options.close()
    }
  }
}
