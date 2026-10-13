# Foundation verification

This draft is not ready to merge or release. JavaScript tests and generated
bindings cannot prove native audio behavior.

## Host validation on October 13, 2026

- Passed: `npm test`, 29 cases across three suites. These cover factory creation,
  setup failure/cleanup, API signatures, plugin options/resource copying, and
  package-name resolution through Expo's real plugin resolver.
- Passed: `npm run lint`, `npm run typecheck`, `npm run plugin:check`, and
  `npm run build` (Bob JavaScript compilation, declarations, and Nitrogen).
- Passed: generated bindings match the committed files after the build.
- Passed: `npm pack --dry-run --ignore-scripts` lists 133 files, including built
  entry points, native source/bindings, and license notices. No model weights,
  test files, or local build artifacts are included. A copy of those package
  files loads its plugin through Expo's resolver from a separate host directory.

The first lint run found five imports used only by documentation links. Removing
those imports fixed lint without weakening its rules. An Expo resolution
regression then reproduced a fallback to the native runtime entry point;
exporting both plugin subpaths fixed it. `plugin:check` now resolves the package
name instead of importing a relative file directly.

The foundation workflow runs the host checks on pull requests and foundation/main
pushes. Its results must be checked on the published commit; a local pass is not a
CI result.

## Earlier source-stage results

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
- Native platform builds, Expo prebuild, and physical-device tests remain unrun.

Source review fixed unsafe iOS ONNX metadata lifetime/type interpretation,
native lifecycle races, model-output validation, interruption recovery, URI
handling, and monotonic cooldown timing. Those fixes still need the native
runtime regressions below.

## Host checks

The final PR description records exact command results and the tested commit.
The initial source/compiler review checks independent factory creation,
readiness/error cleanup, Promise-returning lifecycle signatures, model input
types, plugin opt-in behavior, and generated Swift/Kotlin/C++ contracts.

Factory tests mock only the external Nitro runtime. Plugin option tests mock Expo
mod registration; the package-resolution tests use the installed Expo resolver.
These checks do not execute ONNX inference or microphone hardware.

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
