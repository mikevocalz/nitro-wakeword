# Privacy, CI and performance validation

## Scope
CI for Nitro codegen, TypeScript, native builds, license/SBOM, device test protocol, latency/CPU/battery and privacy gates.

## Dependencies
foundation,audio-vad,stt,tts,ux

## Current slice

The draft adds a bare React Native host and CI compile/link gates for Android
arm64 and the iOS arm64 simulator. It consumes the real local Nitro package,
generated bindings and ONNX dependencies. Earlier helper tests remain separate.
Both native builds passed at `589ebd0` on 2026-10-13; see
`docs/NATIVE_HOST_BUILDS.md` for exact toolchain and run evidence.
Simulator execution, physical audio, Expo prebuild, model accuracy, SBOM/license
review and performance measurements remain open.

## Implementation
- Define documented public TypeScript interfaces and Nitro boundaries where needed.
- Implement actual functionality, lifecycle and explicit errors, not no-op placeholders.
- Add unit, integration, and device E2E tests with fixtures and negative cases.
- Verify Expo and bare React Native compatibility as applicable.
- Apply margelo/react-native-skills api-design, build-nitro-modules and Swift/Kotlin/C++ skills; REA source-first research.
- Document privacy, licensing, performance, limitations and fallback behavior.

## Acceptance
- Demonstrate the scoped user journey on real devices where native functionality is involved.
- Typecheck, lint, tests, codegen and relevant native builds pass.
- No proprietary DaVoice/Alan AI code or model assets copied.
- Do not merge until implementation and verification.
