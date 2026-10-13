# Nitro Wakeword engineering

This is a standalone React Native package. Keep app routes, user data, assistant names, and model assets outside the core. “Hey Deca” is an example configuration, not a required namespace or bundled model.

## Before changing code

1. Read the affected plan and `docs/PLAN_REVIEW.md`. Work one dependency-ordered slice at a time.
2. Read `.agents/skills/nitro-wakeword-review/SKILL.md` and the relevant pinned upstream documents in `docs/skill-sources.json`. A link in a manifest does not mean a skill or tool has run.
3. Inspect the current diff, generated types, native ownership, and tests. Preserve concurrent changes.

## Required review stack

- Code cleanup: Cursor `deslop`; `gg-mo/repo-hygiene` → `cleaning-existing-codebase`. Preserve meaningful native boundary validation; avoid unrelated cleanup.
- Documentation: `petergyang/no-ai-slop`. State what works, what was measured, and what is still unverified.
- Public TypeScript API: Margelo `api-design`; Matt Pocock `code-review` and `tdd` for behavioral regression tests.
- Native work: Margelo `build-nitro-modules` plus `swift` for Apple code, `kotlin` for Android code, and `cpp` for C++/Objective-C++ ownership or build glue. Generic React guidance does not replace these native skills.
- Expo integration: current relevant `expo/skills` documents. This custom native module requires a development build, not Expo Go.
- Device work: Callstack `agent-device` plus its platform skill, only when the CLI and a real target are available. Do not infer a device pass from JavaScript mocks.
- Example UI: Expo native UI/router guidance, Mobbin references when design research is useful, and Impeccable native audit. Keep website/marketing advice out of core native code.
- REA: read its source-first routing guidance. With a complete source repository, use normal repository tools. Do not install engines or decompile binaries without a concrete need and appropriate authorization.

## Architecture and verification

- Keep wake-word/VAD inference native and offline. Optional STT and ExecuTorch reasoning are separate planned work. ExecuTorch must not become a core dependency.
- Every session owns its model lifetime. Arbitrate process-wide microphone ownership. Serialize lifecycle and inference; never hold locks while calling JavaScript or user callbacks.
- Use finite/range checks at native input boundaries. Do not hide failures behind no-op implementations.
- Edit Nitro specifications, then regenerate bindings. Do not hand-edit generated files.
- Do not copy model weights or claim a model license from a wrapper README. Verify each exact asset and its training-data restrictions.
- Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run nitrogen`, and `npm run build` after relevant changes. Regeneration must be deterministic.
- Record native iOS/Android build and physical-device results separately. Host tests, mock tests, source checks, and codegen do not prove audio detection, native builds, accuracy, background behavior, or battery performance.
- Keep incomplete work in draft pull requests. Do not merge, deploy, publish a package, change credentials, or migrate live data as part of this workflow.
