#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../tests/native-host"
platform="${1:?Expected android or ios}"
logs="${NITRO_BUILD_LOGS:-$PWD/build-logs}"
mkdir -p "$logs"
{
  printf 'checkout=%s\n' "$(git rev-parse HEAD)"
  printf 'requested_head=%s\n' "${NITRO_PR_HEAD_SHA:-$(git rev-parse HEAD)}"
  printf 'platform=%s\n' "$platform"
  node --version
  npm --version
} | tee "$logs/build-metadata.log"
npm run typecheck
npx --no-install react-native config > "$logs/autolinking.json"
node - "$logs/autolinking.json" <<'JS'
const config = require(process.argv[2]);
for (const name of ['nitro-wakeword', 'react-native-nitro-modules']) {
  if (!config.dependencies[name]?.platforms.ios?.podspecPath || !config.dependencies[name]?.platforms.android?.sourceDir) {
    throw new Error(`Missing real native autolinking for ${name}`);
  }
}
JS
case "$platform" in
  android)
    java -version 2>&1 | tee -a "$logs/build-metadata.log"
    test -d "${ANDROID_HOME:?Android SDK is required}"
    cd android
    ./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon --stacktrace > "$logs/android-build.log" 2>&1 || {
      tail -200 "$logs/android-build.log"
      exit 1
    }
    test -s app/build/outputs/apk/release/app-release-unsigned.apk
    echo 'Android arm64 release APK compiled and linked (unsigned; not executed).'
    ;;
  ios)
    xcodebuild -version | tee -a "$logs/build-metadata.log"
    pod --version | tee -a "$logs/build-metadata.log"
    cd ios
    RCT_NEW_ARCH_ENABLED=1 pod install > "$logs/pod-install.log" 2>&1 || {
      tail -200 "$logs/pod-install.log"
      exit 1
    }
    cp Podfile.lock "$logs/Podfile.lock"
    xcodebuild -workspace NitroWakeWordHost.xcworkspace -scheme NitroWakeWordHost \
      -configuration Release -sdk iphonesimulator \
      -destination 'generic/platform=iOS Simulator' \
      -derivedDataPath "$logs/DerivedData" \
      CODE_SIGNING_ALLOWED=NO ARCHS=arm64 ONLY_ACTIVE_ARCH=YES \
      build > "$logs/ios-build.log" 2>&1 || {
      tail -200 "$logs/ios-build.log"
      exit 1
    }
    test -d "$logs/DerivedData/Build/Products/Release-iphonesimulator/NitroWakeWordHost.app"
    echo 'iOS simulator arm64 app compiled and linked (not launched).'
    ;;
  *) echo "Unknown platform: $platform" >&2; exit 2 ;;
esac
