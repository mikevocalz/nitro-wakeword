# Voice search over app-owned lists

## Implemented slice

The `nitro-wakeword/search` entry implements app-owned asynchronous providers,
bounded in-memory global ranking, page-bound selection and pagination. It checks
scope permissions, account generations, cancellation and a whole-query deadline.
Old results cannot replace newer searches or be selected through a delayed
confirmation. The original plan below is retained.

See [the public API and limitations](../docs/SEARCH.md). Host and package tests
cover providers and real command-router composition. This slice does not add
STT, a rendered list UI or physical microphone-to-list validation. Native build
checks remain separate evidence; there is no new native bridge for these JS APIs.

## Scope
Typed data providers, async search, ranking, disambiguation, selection, pagination, stale results, scoped permissions.

## Dependencies
intent,navigation

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
