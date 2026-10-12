# Optional ExecuTorch on-device reasoning backend

## Scope
Implement an opt-in, standalone on-device language reasoning adapter. Keep openWakeWord, VAD, and streaming STT on ONNX; ExecuTorch must not be a mandatory dependency.

## API
Capability-negotiated inference backend: load(model), generate(messages, options), streamTokens, cancel, unload, memory metrics, support checks. No arbitrary app actions: return typed intent proposals through the app-owned action registry.

## Dependencies
Typed intents, dialogue orchestration, device benchmarks.

## Acceptance
Verify compatible model conversion and licensing, iOS/Android build, cold/warm latency, memory, thermal and battery impact, offline operation, cancellation, fallback, no extra core package weight when not installed. No fabricated benchmark numbers. Native implementation required before ready for review.
