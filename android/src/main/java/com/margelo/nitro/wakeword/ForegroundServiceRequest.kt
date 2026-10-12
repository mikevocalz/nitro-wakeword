package com.margelo.nitro.wakeword

import java.util.concurrent.CompletableFuture

/** Correlates an asynchronous Android service callback with one start command. */
internal class ForegroundServiceRequest(val id: Long) {
  val ready = CompletableFuture<Unit>()
}
