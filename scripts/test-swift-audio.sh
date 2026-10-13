#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
output="$(mktemp -d "${TMPDIR:-/tmp}/nitro-swift-audio.XXXXXX")"
trap 'rm -rf "$output"' EXIT
platform_sources=()
if [[ "$(uname -s)" == Darwin ]]; then
  platform_sources+=(ios/AudioChunkStream.swift ios/AVAudioPCMBuffer+ownedCopy.swift tests/native/swift/AudioConversionChecks.swift)
fi
swiftc -swift-version 5 \
  ios/WakeWordError.swift ios/PcmFrameAccumulator.swift ios/VadGate.swift \
  ios/AudioBufferAdmission.swift ios/AudioBufferBacklog.swift \
  ios/WakeWordAudioFormat.swift ios/MicrophoneOwnership.swift \
  "${platform_sources[@]}" tests/native/swift/main.swift \
  -o "$output/native-audio-tests"
"$output/native-audio-tests"
if [[ "$(uname -s)" == Darwin ]]; then
  xcrun swiftc -swift-version 5 \
    -sdk "$(xcrun --sdk iphonesimulator --show-sdk-path)" \
    -target arm64-apple-ios15.1-simulator -typecheck \
    ios/WakeWordError.swift ios/WakeWordAudioFormat.swift \
    ios/AudioBufferAdmission.swift ios/AudioBufferBacklog.swift \
    ios/PcmFrameAccumulator.swift ios/MicrophoneOwnership.swift \
    ios/AVAudioPCMBuffer+ownedCopy.swift ios/AudioChunkStream.swift ios/AudioCapture.swift
fi
