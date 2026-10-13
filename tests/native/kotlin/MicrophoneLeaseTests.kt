package com.margelo.nitro.wakeword

import com.margelo.nitro.wakeword.NativeAudioTests.expectFailure
import com.margelo.nitro.wakeword.NativeAudioTests.test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

internal object MicrophoneLeaseTests {
  fun run() {
    test("a second microphone owner is rejected until the first releases") {
      val first = Any()
      val second = Any()
      try {
        MicrophoneLease.claim(first)
        expectFailure<WakeWordException> { MicrophoneLease.claim(second) }
        MicrophoneLease.release(first)
        MicrophoneLease.claim(second)
      } finally {
        MicrophoneLease.release(first)
        MicrophoneLease.release(second)
      }
    }
    test("a stale or duplicate release cannot release another owner's microphone") {
      val first = Any()
      val second = Any()
      try {
        MicrophoneLease.claim(first)
        MicrophoneLease.release(second)
        expectFailure<WakeWordException> { MicrophoneLease.claim(second) }
        MicrophoneLease.release(first)
        MicrophoneLease.claim(second)
        MicrophoneLease.release(first)
        MicrophoneLease.release(first)
        expectFailure<WakeWordException> { MicrophoneLease.claim(first) }
      } finally {
        MicrophoneLease.release(first)
        MicrophoneLease.release(second)
      }
    }
    test("simultaneous microphone claims produce exactly one owner") {
      val ready = CountDownLatch(8)
      val start = CountDownLatch(1)
      val finished = CountDownLatch(8)
      val owners = AtomicInteger()
      val rejected = AtomicInteger()
      val tokens = List(8) { Any() }
      val threads = tokens.map { token ->
        Thread {
          ready.countDown()
          try {
            check(start.await(5, TimeUnit.SECONDS))
            try {
              MicrophoneLease.claim(token)
              owners.incrementAndGet()
            } catch (_: WakeWordException) {
              rejected.incrementAndGet()
            }
          } finally {
            finished.countDown()
          }
        }.also { it.start() }
      }
      try {
        check(ready.await(5, TimeUnit.SECONDS))
        start.countDown()
        check(finished.await(5, TimeUnit.SECONDS))
        check(owners.get() == 1 && rejected.get() == 7)
      } finally {
        start.countDown()
        for (thread in threads) thread.join(5000)
        for (token in tokens) MicrophoneLease.release(token)
      }
    }
  }
}
