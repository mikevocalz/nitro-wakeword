# Local typed commands

The command router consumes transcript text supplied by your app. It does not
record audio, transcribe speech, call an LLM, access app data, or navigate on its
own. Import `nitro-wakeword/commands` to use it without loading React Native or
Nitro. The same exports are available from the package root.

## Define app-owned commands

```ts
import {createCommandRouter, defineCommand} from 'nitro-wakeword/commands';

const openTab = defineCommand({
  id: 'open-tab',
  patterns: ['open :tab', 'show :tab'],
  slots: {tab: {kind: 'choice', values: ['home', 'saved']}},
  requireConfirmation: false,
  execute: ({tab}, {signal}) => {
    if (signal.aborted) return;
    // tab has type 'home' | 'saved'. The app owns this route mapping.
    selectAppTab(tab);
  },
});

const router = createCommandRouter({
  commands: [openTab],
  authorize: candidate =>
    candidate.commandId === 'open-tab' && appSession.canNavigate,
});

const result = router.match('open home');
if (result.status === 'matched') {
  const dispatch = await router.dispatch(result.candidate);
  // Handle denied, expired, cancelled, busy, etc. as well as executed.
  showCommandResult(dispatch.status);
}

// On logout, a new dialogue session, or a change in the current app context:
router.cancelAll();
// When this owner is finished:
router.dispose();
```

`selectAppTab`, `appSession` and `showCommandResult` above belong to the host app.
The router has no route names or authentication state built in.

For an app-owned list, use a bounded text slot:

```ts
const searchList = defineCommand({
  id: 'search-list',
  patterns: ['search list :query'],
  slots: {query: {kind: 'text', minLength: 2, maxLength: 120}},
  execute: async ({query}, {signal}) => {
    await searchCurrentList(query, {signal});
  },
});

const router = createCommandRouter({
  commands: [searchList],
  authorize: candidate =>
    candidate.commandId === 'search-list' && appSession.canSearch,
  confirm: (candidate, {signal}) =>
    askUserToConfirm(candidate.commandId, candidate.slots, {signal}),
});
```

The host must display the exact command and slot values being confirmed and
return `true` only after that invocation is approved. A transcript containing
“yes”, an LLM's assertion of consent, or an old dialog result is not permission.
The app owns the confirmation UI, list provider and its cancellation behavior.

## Matching and types

- Patterns are space-separated literals and named `:slots`. Literals and choice
  values match case-insensitively, with whitespace collapsed. Punctuation is
  significant. There is no fuzzy matching or regex supplied by the caller.
- Choice slots consume one word and return the original declared choice value.
  TypeScript infers the choice union in the command's execute callback.
- A text slot consumes the remaining words and must be last. Its case is
  preserved, whitespace is collapsed, and its length is checked in UTF-16 code
  units. Every pattern must contain every declared slot exactly once.
- Input is capped at 4096 code units. Empty, oversized, control-character or
  directional-formatting input is unmatched. Invalid configuration throws.
- Limits: 100 commands, 32 patterns per command, 256 code units per pattern,
  8 slots, 64 choices per slot, and 64 code units per choice.
- A unique match returns `{status: 'matched', candidate}`. The candidate's
  `match: 'exact'` describes this grammar match, not ASR confidence or a calibrated
  probability. Unknown input returns `unmatched`.
- Overlapping commands, or distinct slot interpretations for the same command,
  return `ambiguous` with immutable suggestions. Suggestions cannot be
  dispatched. Resolve the ambiguity in the app and obtain a fresh unique match;
  registry order never chooses a winner. Equivalent aliases are deduplicated.

## Dispatch and lifetime

Matching never triggers an action. Dispatch accepts only the original immutable
candidate produced by that router's unique match. Copies, forged slot values,
other routers' candidates and ambiguous suggestions return `invalid-candidate`.

Authorization is required even when confirmation is disabled. Missing
`authorize`, or a result other than literal `true`, returns `denied`. Commands
require confirmation by default; omitting `confirm` returns
`confirmation-required`, and anything other than `true` returns `declined`.
After confirmation the router calls authorization again, then checks session
validity immediately before calling the app handler.

Candidates expire 30 seconds after matching. `maxAgeMs` can set 1..300000
milliseconds. A candidate is consumed once dispatch starts, including denial,
error or cancellation; replay returns `already-dispatched`. Only one dispatch
may be active per router. A competing candidate returns `busy` without being
consumed. Callback errors reject the dispatch promise and release that slot.

`cancelAll()` invalidates all existing candidates and aborts pending callbacks.
`dispose()` does the same and permanently closes the router. Cancellation and
expiry stop waiting even if an app callback never settles. They are checked
around every async boundary; a late approval cannot dispatch a stale action.

App callbacks receive an `AbortSignal` and must stop their own work when it is
aborted. Once an execute callback has started, cancellation cannot undo its
side effects. The router's `cancelled`, `expired` or `disposed` result must not be
interpreted as rollback. Cancellation releases the router's dispatch slot even
if the old callback ignores its signal and keeps running; a later dispatch can
then overlap that ignored work. Apps needing underlying-operation mutual
exclusion must enforce it in their handlers. App-level permission checks and
atomicity remain the handler's responsibility, especially after its own awaits.

No transcript or slot is logged or sent over the network by the router. This
slice is tested with deterministic transcript fixtures and compiled-package
resolution. Real speech recognition, voice-to-navigation device tests and
framework-specific navigation adapters remain separate work.
