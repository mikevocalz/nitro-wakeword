# Custom Hey Deca model and multi-keyword

## Goal
Document licensed training pipeline, dataset consent, phonetic variants, noisy speech/negative samples, ONNX export, threshold/patience tuning, per-model refractory period, model manifest and downloads.

## Dependencies
foundation,audio-vad

## Deliverables
- Implementation and tests, not a placeholder API
- Updated README/JSDoc and compatibility notes
- Expo and bare React Native verification where applicable
- Security, privacy and licensing review

## Acceptance criteria
Hey Deca works on iOS/Android devices; measure false accepts/hour and false rejects across voices/noise; no fabricated accuracy claims.

## Engineering rules
- Use margelo/react-native-skills: api-design, build-nitro-modules and relevant Swift/Kotlin/C++ skills.
- Follow REA source-first guidance. Analyze available open source; use binary inspection only where necessary and authorized.
- Keep package independent of specific products and do not assume proprietary DaVoice/Alan AI SDK parity.
- Use latest verified compatible stable packages, regenerate Nitrogen bindings and report actual test results.
- No merging before implementation and review.
