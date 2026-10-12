# Offline streaming STT adapters

## Goal
Pluggable Sherpa-ONNX/Vosk/Whisper evaluation; native streaming and partial/final transcripts, endpointing, language selection, model lifecycle and memory budgets; local-only default.

## Dependencies
audio-vad

## Deliverables
- Implementation and tests, not a placeholder API
- Updated README/JSDoc and compatibility notes
- Expo and bare React Native verification where applicable
- Security, privacy and licensing review

## Acceptance criteria
Speech fixtures and multilingual evaluation; transcript ordering; cancellation; low-memory tests; no cloud dependency.

## Engineering rules
- Use margelo/react-native-skills: api-design, build-nitro-modules and relevant Swift/Kotlin/C++ skills.
- Follow REA source-first guidance. Analyze available open source; use binary inspection only where necessary and authorized.
- Keep package independent of specific products and do not assume proprietary DaVoice/Alan AI SDK parity.
- Use latest verified compatible stable packages, regenerate Nitrogen bindings and report actual test results.
- No merging before implementation and review.
