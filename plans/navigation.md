# Voice-controlled tabs and navigation

## Scope
Expo Router/React Navigation adapters; app-owned route registry, tab selection, route guards, Home tab end-to-end test.

## Dependencies
intent

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

## Current bounded slice

Implemented on top of the merged typed intent router: separate optional Expo
Router and bare React Navigation adapters for static app-owned destinations.
Route authorization defaults to deny; confirmation is scoped to the exact target,
permissions are checked again at execution, and app session generations invalidate
stale commands. External URLs, traversal, and unsupported parameters are rejected.
See `docs/NAVIGATION.md` for the API, lifecycle contract, and tested peer versions.

Tests exercise the real React Navigation TabRouter plus Expo's typed call boundary.
A rendered Expo app and a real microphone-to-Home device journey remain outstanding.
This slice does not satisfy those original device acceptance criteria.
