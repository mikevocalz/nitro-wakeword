# Native host build gates

The `tests/native-host` fixture uses React Native 0.87.1, React 19.2.3 and Nitro
0.37.1. Its npm lockfile pins JavaScript dependencies, and its Gradle wrapper pins
9.4.1 with the official distribution SHA-256. Native projects come from React
Native Community template 0.87.1, with its MIT license preserved.

## Commands

```sh
npm ci --ignore-scripts
npm run build
npm ci --ignore-scripts --prefix tests/native-host
scripts/build-native-host.sh android
# On a Mac with Xcode and CocoaPods:
scripts/build-native-host.sh ios
```

The script first checks fixture types and actual React Native autolinking for
both Nitro Wakeword and Nitro Modules. No generated binding is replaced by a
stub. Android assembles an unsigned arm64 release APK with SDK 37 and NDK
27.3.13750724. iOS builds an arm64 simulator Release app without signing. Neither
command launches the application or requests microphone access.

CI uses the hosted Ubuntu 24.04 and macOS 15 toolchains. It records Java/Xcode/
CocoaPods versions, autolinking, build logs and the resolved Podfile.lock in
seven-day artifacts. The tested Podfile.lock is committed, and `pod install
--deployment` rejects lockfile drift. Maven resolution is not dependency-locked,
so the complete native dependency graph is not frozen.
The package's native requirements and actual successful build versions must be
reported separately from the fixture's requested inputs.

## What each result means

- TypeScript, Jest and pure Kotlin/Swift helper tests cover their stated source
  behavior. They cannot prove native registration or linkage.
- The native host gate must compile and link the real Swift, Objective-C++,
  Kotlin, C++, Nitro bindings, ONNX dependency and React Native application.
- A successful build does not mean its JavaScript ran. The host has a small
  invalid-configuration/cleanup check that can be run later in a simulator;
  report that execution only after observing its result.
- Simulator execution does not establish physical microphone behavior, phone
  interruptions, hardware routes, speech accuracy, latency or battery use.

No model weights, datasets, app-store signing identities, credentials or private
app data are included. The test screen is not the planned product example UI.
Expo prebuild/native integration remains a separate compatibility gate.

## Verified build evidence

On 2026-10-13, [run 38378916057](https://github.com/mikevocalz/nitro-wakeword/actions/runs/38378916057)
passed both full native builds for PR head `589ebd0b6cfbe117b50abc9ba8b38ee4b133d80a`
(merge checkout `003ed6c33a546cb3055727364930ea62329ef67d`).

- Android: unsigned arm64 release APK, Java 17.0.20.1, Gradle 9.4.1,
  SDK 37 / NDK 27.3.13750724, configured ONNX Runtime 1.22.0. Logs include
  the actual package's Kotlin and C++ compile tasks and successful assembly.
- iOS: arm64 simulator Release app, Xcode 16.4 / iOS Simulator SDK 18.5,
  CocoaPods 1.17.0, resolved ONNX Runtime 1.30.0. Logs include Swift,
  Objective-C++, generated C++ bindings and successful linking.
- Both: Node 24.18.0, npm 11.16.0, React Native 0.87.1 and Nitro 0.37.1.
  Neither application was launched.

The iOS artifact SHA-256 was
`b13b5e1ed90a654adddf7b096652e26429b4f72f288cf56d9b9286caab84f3f6`;
Android was `a8c2ef4ba4cd9d923f49830ec9d8a6a85cdfa1f74fa9a6fccbfe47febf42fec0`.
Artifacts expire after seven days; the tested CocoaPods resolution is preserved
in the fixture. This run establishes coverage only for the stated fixture.

The fixture's 2026-10-13 npm audit reports 20 propagated high-severity entries
from [the braces nested-pattern advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
through React Native's CLI/Metro dependency graph, even with `--omit=dev`.
The affected pattern-processing tools run during development/build; these
results are not a native ONNX or shipped-app exploit assessment. npm proposes
incompatible React Native/CLI downgrades, which were not applied. The broader
native dependency/SBOM audit remains open.
