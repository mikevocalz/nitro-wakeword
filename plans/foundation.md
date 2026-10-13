# Port MIT Nitro wake-word foundation

## Goal
Adapt FerRiv3ra/react-native-nitro-wakeword with license/NOTICE and source provenance. Native ONNX/openWakeWord pipeline, Nitro codegen, Expo/bare RN, model loader, multi-keyword and lifecycle. Do not copy vendor binaries.

## Dependencies
none

## Deliverables
- Implementation and tests, not a placeholder API
- Updated README/JSDoc and compatibility notes
- Expo and bare React Native verification where applicable
- Security, privacy and licensing review

## Acceptance criteria
Builds iOS/Android; reproducible model detection fixture; lint/typecheck/codegen pass; license audit.

## Engineering rules
- Use margelo/react-native-skills: api-design, build-nitro-modules and relevant Swift/Kotlin/C++ skills.
- Follow REA source-first guidance. Analyze available open source; use binary inspection only where necessary and authorized.
- Keep package independent of specific products and do not assume proprietary DaVoice/Alan AI SDK parity.
- Use latest verified compatible stable packages, regenerate Nitrogen bindings and report actual test results.
- No merging before implementation and review.
