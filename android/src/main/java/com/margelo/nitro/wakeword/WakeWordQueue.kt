package com.margelo.nitro.wakeword

import com.margelo.nitro.core.Promise
import java.util.concurrent.ExecutionException
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.asCoroutineDispatcher

/** One FIFO owner for lifecycle commands and inference. No operation may suspend. */
internal class WakeWordQueue {
  // An idle, unloaded instance must not keep a dedicated thread alive forever.
  private val executor = ThreadPoolExecutor(
    0, 1, 30L, TimeUnit.SECONDS, LinkedBlockingQueue<Runnable>(),
    { task -> Thread(task, "NitroWakeWord-owner").apply { isDaemon = true } },
  )
  private val scope = CoroutineScope(executor.asCoroutineDispatcher())

  fun <T> run(operation: () -> T): Promise<T> = Promise.async(scope) { operation() }

  fun execute(operation: () -> Unit) {
    executor.execute { operation() }
  }

  /**
   * Called only by the microphone reader. One outstanding frame gives backpressure
   * without an unbounded audio queue. stop() interrupts this wait before joining.
   */
  fun processAndWait(operation: () -> Unit) {
    val task = executor.submit { operation() }
    try {
      task.get()
    } catch (error: InterruptedException) {
      task.cancel(false)
      throw error
    } catch (error: ExecutionException) {
      throw error.cause ?: error
    }
  }
}
