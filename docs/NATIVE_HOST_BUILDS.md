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
seven-day artifacts. CocoaPods and Maven dependency resolution are reported by
the build; this fixture does not establish a frozen native dependency graph.
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
