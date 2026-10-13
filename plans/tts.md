# Speech synthesis and barge-in

## Goal
OS TTS baseline and optional neural TTS adapter; queue/cancel, audio focus/ducking, wake during speech, echo suppression and interruption recovery.

## Dependencies
audio-vad

## Deliverables
- Implementation and tests, not a placeholder API
- Updated README/JSDoc and compatibility notes
- Expo and bare React Native verification where applicable
- Security, privacy and licensing review

## Acceptance criteria
Spoken answers, cancellation, no self-trigger, audio route changes tested on both OSes.

## Engineering rules
- Use margelo/react-native-skills: api-design, build-nitro-modules and relevant Swift/Kotlin/C++ skills.
- Follow REA source-first guidance. Analyze available open source; use binary inspection only where necessary and authorized.
- Keep package independent of specific products and do not assume proprietary DaVoice/Alan AI SDK parity.
- Use latest verified compatible stable packages, regenerate Nitrogen bindings and report actual test results.
- No merging before implementation and review.
