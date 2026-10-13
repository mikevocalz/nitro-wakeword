#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
output="$(mktemp -d "${TMPDIR:-/tmp}/nitro-onnx-bridge.XXXXXX")"
trap 'rm -rf "$output"' EXIT
# Microsoft ONNX Runtime v1.22.0 headers, pinned to the annotated tag's commit.
revision=f217402897f40ebba457e2421bc0a4702771968e
for header in onnxruntime_c_api.h onnxruntime_cxx_api.h onnxruntime_cxx_inline.h onnxruntime_float16.h; do
  curl --fail --silent --show-error --location \
    "https://raw.githubusercontent.com/microsoft/onnxruntime/$revision/include/onnxruntime/core/session/$header" \
    --output "$output/$header"
done
sdk="$(xcrun --sdk iphonesimulator --show-sdk-path)"
xcrun clang++ -fsyntax-only -fobjc-arc -std=c++17 -x objective-c++ \
  -isysroot "$sdk" -target arm64-apple-ios15.1-simulator -I "$output" ios/OnnxSession.mm
xcrun swiftc -swift-version 5 -sdk "$sdk" -target arm64-apple-ios15.1-simulator \
  -typecheck -import-objc-header ios/OnnxSession.h \
  ios/ModelIntegrity.swift ios/ModelReference.swift ios/ModelResolver.swift \
  ios/ResolvedModelAsset.swift ios/OnnxModel.swift ios/WakeWordError.swift \
  ios/WakeWordAudioFormat.swift ios/KeywordConfiguration.swift ios/KeywordClassifier.swift \
  ios/KeywordCooldown.swift ios/KeywordDetection.swift ios/PcmFrameAccumulator.swift \
  ios/VadGate.swift ios/ModelOutputValidation.swift ios/OpenWakeWordEngine.swift
