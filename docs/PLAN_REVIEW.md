# Dependency and review status

Reviewed October 12, 2026 before the foundation port. `main` contained only a README. Pull requests #1–#14 contained planning documents, not implementations. The existing `plan/intent` branch had no pull request; [#15](https://github.com/mikevocalz/nitro-wakeword/pull/15) restores that missing dependency.

## Implementation order

1. [#2 foundation](https://github.com/mikevocalz/nitro-wakeword/pull/2): licensed source port, independent sessions, native ownership, model loading, codegen, host checks, then native/device verification.
2. [#3 audio/VAD](https://github.com/mikevocalz/nitro-wakeword/pull/3): complete capture arbitration, interruption/route validation, and measured VAD behavior. The foundation necessarily contains basic capture; extend it rather than create a second microphone pipeline.
3. [#4 custom models](https://github.com/mikevocalz/nitro-wakeword/pull/4), [#6 STT](https://github.com/mikevocalz/nitro-wakeword/pull/6), and [#7 TTS](https://github.com/mikevocalz/nitro-wakeword/pull/7) build on those native boundaries. Validate model assets and each runtime separately.
4. [#15 intents](https://github.com/mikevocalz/nitro-wakeword/pull/15), then [#8 navigation](https://github.com/mikevocalz/nitro-wakeword/pull/8) and [#9 list search](https://github.com/mikevocalz/nitro-wakeword/pull/9). Intent tests can use transcript fixtures before STT integration exists.
5. [#10 Q&A](https://github.com/mikevocalz/nitro-wakeword/pull/10), [#11 dialogue](https://github.com/mikevocalz/nitro-wakeword/pull/11), and [#12 example UX](https://github.com/mikevocalz/nitro-wakeword/pull/12) compose those features.

[#5 speaker verification](https://github.com/mikevocalz/nitro-wakeword/pull/5) and [#14 ExecuTorch](https://github.com/mikevocalz/nitro-wakeword/pull/14) are optional. Neither blocks a wake-word-only host. [#13 CI/privacy/performance](https://github.com/mikevocalz/nitro-wakeword/pull/13) supplies gates throughout this order, not only after UI completion. [#1](https://github.com/mikevocalz/nitro-wakeword/pull/1) remains the umbrella plan.

## Findings applied to the work

- Replace vague “native skills” references with actual Swift, Kotlin, C++ and Nitro sources in `AGENTS.md` and `skill-sources.json`.
- Preserve standalone identity. Deca is sample branding; app route registries and list data are injected by the host.
- Treat ONNX wake-word/VAD/STT and optional ExecuTorch reasoning as different capabilities. An LLM may propose typed intents; it cannot execute arbitrary actions.
- Do not substitute generic acceptance boilerplate for behavior tests. Cover denied permission, missing models, invalid numeric options, partial native startup, concurrent instances, repeated stop/unload, and stale callbacks.
- Navigation and list search must reject unknown/unauthorized routes and stale selections. Their plans do not authorize reading private host data automatically.
- Q&A needs an explicit network/data-sharing choice, citations, and an honest offline/no-result state. There is no factual-answer implementation in the foundation.
- Speaker verification remains opt-in and cannot be sole authentication for sensitive actions.
- UI/device/marketing skill tools are conditional. There is no app design or device test result to claim during this foundation-only slice.

No planning document establishes that a feature is implemented or ready to merge. Record actual evidence with each implementation PR.
