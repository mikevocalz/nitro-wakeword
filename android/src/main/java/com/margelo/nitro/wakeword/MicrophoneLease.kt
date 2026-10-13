package com.margelo.nitro.wakeword

import java.util.concurrent.atomic.AtomicReference

/** Arbitration only; engines and listeners remain owned by individual instances. */
internal object MicrophoneLease {
  private val owner = AtomicReference<Any?>(null)

  fun claim(token: Any) {
    if (!owner.compareAndSet(null, token)) {
      throw WakeWordException("The microphone is already in use by another wake word instance")
    }
  }

  fun release(token: Any) {
    owner.compareAndSet(token, null)
  }
}
