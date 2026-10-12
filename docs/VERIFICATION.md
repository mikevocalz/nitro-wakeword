# Foundation verification

This draft is not ready to merge or release. JavaScript tests and generated
bindings cannot prove native audio behavior.

## Recorded source-stage results

On October 12, 2026:

- Passed: TypeScript 5.9.3 no-emit checking, including test types.
- Passed: declaration-only TypeScript emission for the package surface.
- Passed: Nitrogen 0.37.1 generation of 45 binding files; a second generation
  produced byte-identical output.
- Passed: formatting checks and source whitespace checks.
- Passed with a limited harness: Kotlin compiler 2.3.20 syntax/type checking
  against explicit Android/ONNX/Nitro stubs and cached coroutines 1.8.0. This
  does not validate the Android SDK, actual dependency APIs, Gradle, linking,
  or the declared Kotlin 2.1.20/coroutines 1.10.2 build combination.
- Not run: Jest runtime suites, ESLint configuration execution, full Bob build,
  native platform builds, Expo prebuild, and physical-device tests.

Source review fixed unsafe iOS ONNX metadata lifetime/type interpretation,
native lifecycle races, model-output validation, interruption recovery, URI
handling, and monotonic cooldown timing. Those fixes still need the native
runtime regressions below.

## Host checks

The final PR description records exact command results and the tested commit.
The initial source/compiler review checks independent factory creation,
readiness/error cleanup, Promise-returning lifecycle signatures, model input
types, plugin opt-in behavior, and generated Swift/Kotlin/C++ contracts.

Factory tests mock only the external Nitro runtime. Plugin tests mock Expo mod
registration. They do not execute ONNX inference or microphone hardware.

## Dependency audit

An October 12, 2026 npm audit after moving Jest/Babel-Jest to 30.5.2 and Bob to
0.43.2 still reports three underlying advisory families in development tooling:

- [braces nested-pattern denial of service](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), through Metro and other file-matching tools.
- [sprintf-js precision denial of service](https://github.com/advisories/GHSA-hp3w-g68c-fv3c), through Jest coverage configuration parsing.
- [uuid buffer bounds checking](https://github.com/advisories/GHSA-w5hq-g745-h8pq), through Expo's Xcode project tooling.

The dependency graph has 35 affected entries (13 high, 22 moderate), many inherited
from those same three root advisories. This is not a clean security-audit result.
The current stable toolchain does not supply a compatible automatic fix for all
of them. Do not downgrade React Native to an obsolete release or force a new
major transitive API solely to make the audit count disappear. Recheck before
release and evaluate reachable inputs, upstream patches, and compatible updates.

## Native build gates

- Install the package into a bare React Native host and an Expo development host.
- Run iOS CocoaPods/Xcode builds and Android Gradle builds against the recorded
  Nitro/RN/ONNX versions and generated bindings.
- Check actual model tensor metadata and malformed/missing model errors.
- Validate foreground-service declarations and runtime restrictions against the
  host target SDK; validate iOS usage strings and audio-session ownership.
- Verify package contents include source, generated bindings and notices, and
  exclude model binaries and local artifacts.

## Device gates

- Permission granted, denied, revoked, and repeated requests.
- Start/stop/unload repeated and interleaved; two competing sessions; failed
  capture startup and recovery without a leaked microphone or foreground service.
- Audio route changes, Bluetooth, phone/Siri interruptions, media-service resets,
  background/foreground transitions, and host-owned audio-session configuration.
- Callbacks queued before stop; unload while inference is active; slow inference
  backpressure; malformed model outputs and low-memory cleanup.
- Known positive, negative, and silence fixtures; false accepts per hour and
  false rejects across voices and realistic noise. Record model hashes.
- Cold/warm latency, CPU, peak/resident memory, thermal behavior, and battery on
  named physical devices. Do not fabricate or extrapolate numbers from mocks.

The current cloud executor has no Xcode, Swift compiler, Android SDK/Gradle host,
simulator, or attached physical device. Those checks remain unrun. Reading the
Callstack device skill is not a device test.
