# Native audio capture and VAD

## Goal

Shared mic ownership; iOS AVAudioEngine and Android AudioRecord; resampling, ring buffer, Silero/WebRTC VAD evaluation, route changes, interruptions, permissions, Android foreground service, OS-compliant iOS behavior.

## Dependencies

foundation

## Implementation status

The branch is stacked on the verified foundation. Native PCM framing, VAD peak
preservation, warmup reset, Swift failure cleanup and stream-restart reset are
implemented. See [audio validation](../docs/AUDIO_VALIDATION.md) for runnable
checks and the remaining platform/model/device gates. This does not complete
the Silero/WebRTC comparison or claim device validation.

## Deliverables

- Implementation and tests, not a placeholder API
- Updated README/JSDoc and compatibility notes
- Expo and bare React Native verification where applicable
- Security, privacy and licensing review

## Acceptance criteria

No duplicate capture, no audio emitted to JS by default; stop/dispose cleans up; silence/speech fixture and interruption tests.

## Engineering rules

- Use margelo/react-native-skills: api-design, build-nitro-modules and relevant Swift/Kotlin/C++ skills.
- Follow REA source-first guidance. Analyze available open source; use binary inspection only where necessary and authorized.
- Keep package independent of specific products and do not assume proprietary DaVoice/Alan AI SDK parity.
- Use latest verified compatible stable packages, regenerate Nitrogen bindings and report actual test results.
- No merging before implementation and review.
