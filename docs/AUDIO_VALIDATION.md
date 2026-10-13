# Audio/VAD implementation and checks

This slice builds on foundation PR #2. It keeps the same public session API.

## Changes

- VAD uses the highest speech probability from every 512-sample frame inside an
  80 ms capture chunk. The previous implementation kept only the last score,
  losing speech detected earlier in that chunk.
- Fixed-size PCM accumulators retain fewer than one frame of partial audio and
  emit independently owned frames. Swift capture and both VAD paths use them.
- VAD warmup clears its recurrent state, partial frame and score history before
  real capture. An odd number of warmup chunks previously left 256 synthetic
  silence samples in the next live frame.
- Swift capture restarts reset inference windows. Conversion and inference
  failures stop capture, and remaining chunks from that old buffer are dropped.
- Tap-buffer overflow, failed buffer copies and in-stream format changes reset
  inference before the next accepted audio, rather than joining noncontiguous
  samples into one classifier window.
- Swift conversion honors each requested input frame count, advances a per-buffer
  offset, and drains available output. Giving the converter 48,000 frames when it
  requested 4,096 produced only 11 complete chunks in the one-second fixture;
  bounded input slices restore 12 without changing the test expectation.
- Swift normalized PCM maps to the same signed-int16 scale as Android capture.

The VAD history still spans 12 capture chunks, about 960 ms. It does not count
each shorter VAD subframe as a separate history entry.

## Reproducible checks

`npm run test:native:kotlin` compiles the production framing, VAD, output-validation
and microphone-ownership classes with the installed Kotlin compiler. Its 28
tests run on the host JVM without Android or ONNX substitutes. The earlier-peak
regression fails when maximum aggregation is replaced with last-score behavior.
For an embeddable compiler, set `KOTLIN_COMPILER_CLASSPATH` and `KOTLIN_STDLIB`.

`npm run test:native:swift` compiles and runs the Swift framing, VAD and ownership
classes. On macOS it also exercises AVAudioConverter using synthetic 48 kHz stereo
and 16 kHz mono buffers, tests copied buffer ownership, and typechecks capture
sources against the real iOS simulator SDK. It does not open a microphone.

The Native audio checks workflow runs these suites on the available hosted
toolchains and records their versions. Check its exact commit result before
claiming a pass. At commit `64cab104aa29aef5cc71f2df630657ed72af45ea`,
[host CI](https://github.com/mikevocalz/nitro-wakeword/actions/runs/38372644462)
and [native CI](https://github.com/mikevocalz/nitro-wakeword/actions/runs/38372644419)
passed: 29 host tests, 28 Kotlin tests, 25 Swift tests, and iOS simulator SDK
capture typechecking with Xcode 16.4 / Swift 6.1.2. Swift regressions cover
irregular input boundaries, repeated buffers, channel slicing and copied
ownership. This cloud executor has no local Swift/Xcode installation.

The converter input contract follows Apple's
[TN3136](https://developer.apple.com/documentation/technotes/tn3136-avaudioconverter-performing-sample-rate-conversions).
The normal priming mode is unchanged; no silence is fabricated to fill a test.

## Remaining platform and model gates

Synthetic PCM and probability sequences verify framing, scaling, VAD-history
policy and ownership. They do not measure a speech model's accuracy. Licensed
positive/negative/silence recordings and exact model hashes are still required
for real inference tests. No model weights are added here, and no WebRTC VAD
backend or Silero/WebRTC accuracy comparison is claimed.

Full React Native iOS/Android host builds, Expo prebuild, hardware route changes,
phone/Siri interruptions, permission revocation, background restrictions and
latency/battery measurements remain separate gates. SDK typechecking and host
unit tests do not establish those results.
