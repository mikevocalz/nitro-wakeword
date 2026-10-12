# Privacy, CI and performance validation

## Scope
CI for Nitro codegen, TypeScript, native builds, license/SBOM, device test protocol, latency/CPU/battery and privacy gates.

## Dependencies
foundation,audio-vad,stt,tts,ux

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
