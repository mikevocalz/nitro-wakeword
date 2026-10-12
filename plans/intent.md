# Typed intents and local command parser

## Goal
Deterministic registry with typed schemas, slot extraction, confidence/ambiguity, safe dispatch, authorization and confirmations; no arbitrary generated JS execution.

## Dependencies
stt

## Deliverables
- Implementation and tests, not a placeholder API
- Updated README/JSDoc and compatibility notes
- Expo and bare React Native verification where applicable
- Security, privacy and licensing review

## Acceptance criteria
Utterance suite maps open home/search list reliably; unknown and ambiguous commands fail safely.

## Engineering rules
- Use margelo/react-native-skills: api-design, build-nitro-modules and relevant Swift/Kotlin/C++ skills.
- Follow REA source-first guidance. Analyze available open source; use binary inspection only where necessary and authorized.
- Keep package independent of specific products and do not assume proprietary DaVoice/Alan AI SDK parity.
- Use latest verified compatible stable packages, regenerate Nitrogen bindings and report actual test results.
- No merging before implementation and review.
