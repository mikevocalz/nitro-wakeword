#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
output="$(mktemp -d "${TMPDIR:-/tmp}/nitro-kotlin-audio.XXXXXX")"
trap 'rm -rf "$output"' EXIT
sources=(android/src/main/java/com/margelo/nitro/wakeword/{ModelIntegrity,ModelReference,KeywordCooldown,PcmFrameAccumulator,VadGate,ModelOutputValidation,MicrophoneLease,WakeWordException}.kt tests/native/kotlin/*.kt)
if [[ -n "${KOTLIN_COMPILER_CLASSPATH:-}" ]]; then
  : "${KOTLIN_STDLIB:?Set KOTLIN_STDLIB alongside KOTLIN_COMPILER_CLASSPATH}"
  java -cp "$KOTLIN_COMPILER_CLASSPATH" org.jetbrains.kotlin.cli.jvm.K2JVMCompiler \
    -no-stdlib -no-reflect -classpath "$KOTLIN_STDLIB" -jvm-target 17 \
    "${sources[@]}" -d "$output/tests.jar"
  java -cp "$output/tests.jar:$KOTLIN_STDLIB" com.margelo.nitro.wakeword.NativeAudioTests
else
  kotlinc -jvm-target 17 "${sources[@]}" -include-runtime -d "$output/tests.jar"
  java -jar "$output/tests.jar"
fi
