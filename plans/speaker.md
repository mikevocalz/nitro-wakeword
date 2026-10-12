# Opt-in speaker verification

## Goal
ECAPA-TDNN model evaluation and licensing, enrollment/re-enrollment, encrypted local template storage, score calibration, delete/export consent; never use voiceprint as sole authentication for sensitive actions.

## Dependencies
audio-vad,custom-deca

## Deliverables
- Implementation and tests, not a placeholder API
- Updated README/JSDoc and compatibility notes
- Expo and bare React Native verification where applicable
- Security, privacy and licensing review

## Acceptance criteria
Authorized/unrecognized/noisy/replayed audio tests; false accept/reject metrics; explicit fallback and no lockscreen unlock promise.

## Engineering rules
- Use margelo/react-native-skills: api-design, build-nitro-modules and relevant Swift/Kotlin/C++ skills.
- Follow REA source-first guidance. Analyze available open source; use binary inspection only where necessary and authorized.
- Keep package independent of specific products and do not assume proprietary DaVoice/Alan AI SDK parity.
- Use latest verified compatible stable packages, regenerate Nitrogen bindings and report actual test results.
- No merging before implementation and review.
