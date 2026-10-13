# Typed intents and local command parser

## Goal
Deterministic registry with typed schemas, slot extraction, confidence/ambiguity, safe dispatch, authorization and confirmations; no arbitrary generated JS execution.

## Dependencies
stt

## Current implementation slice

The local TypeScript router accepts app-supplied transcript text. It implements
bounded literal/typed-slot patterns, unknown and ambiguous results, immutable
one-shot candidates, default-deny authorization, per-invocation confirmation,
expiry and session cancellation. It never evaluates generated code or executes
arbitrary routes. See `docs/COMMANDS.md` for the supported grammar and limits.

STT integration and physical voice-to-action validation remain open. The
`nitro-wakeword/commands` entry works without loading a native module.

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
