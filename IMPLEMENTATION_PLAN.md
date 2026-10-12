# Nitro Wakeword — capability plan

Use [FerRiv3ra/react-native-nitro-wakeword](https://github.com/FerRiv3ra/react-native-nitro-wakeword) as the **MIT-licensed implementation foundation**. Preserve attribution and third-party model licenses. Port and adapt its actual Nitro/ONNX native code and tests, rather than writing a stub or pretending that an API-only scaffold detects speech.

## Foundation
- Native iOS/Android microphone capture; ONNX openWakeWord mel → embedding → classifier pipeline; optional Silero VAD
- Multiple custom classifiers on a shared audio frontend; per-keyword thresholds, patience, refractory period
- Native lifecycle, interruptions, route changes, backpressure, Expo config plugin, bare RN autolinking, sample app
- Upgrade Nitrogen/Nitro and other dependencies to verified compatible current stable releases, regenerate bindings, validate native builds

## DaVoice-inspired capabilities (independent implementation)
- Custom wake word model import/training documentation, multilingual model support
- Speaker enrollment and verification with explicit consent and locally managed templates; speaker-aware gating
- Speech-to-intent for short local commands, with confidence thresholds and action dispatch
- Optional local STT/TTS, VAD and voice isolation adapters; avoid bundling large models into core
- Foreground/background behavior only where OS policies permit; no unsupported always-on claims

## Alan AI-inspired capabilities (independent implementation)
- Typed intent registry, contextual slots, multi-turn dialogue state, command routing to app actions
- Barge-in, follow-up windows, session cancellation and handoff to an app's existing ASR/LLM/TTS
- Optional visual assistant controller and hooks, test fixtures and opt-in local analytics
- Never couple the core library to Alan Cloud or Alan SDK

## Architecture
- Standalone package, no Moyo or other app imports
- Nitro HybridObject factory and independent native-owned session handles; explicit dispose, no global singleton
- Capability negotiation and backend adapter interfaces; model format validation and clear unsupported errors
- Privacy: no raw audio transmission by default, no silent background mic access, speaker profiles opt-in
- Shared capture ownership arbitration, one hardware microphone session per process
- Web implementation as separate capability-limited adapter, not fake native parity

## Definition of done
- Source implementation and proper attribution committed
- Nitrogen codegen passes; TypeScript, lint, tests and Android/iOS builds verified in CI
- Physical device wake-word, false-positive, latency, CPU/battery, interruption and multi-model tests
- README API examples, model licensing, Expo/bare installation and compatibility matrix
- No copied proprietary DaVoice/Alan SDK binaries, weights, or undocumented internals
