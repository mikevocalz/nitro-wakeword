# Static voice navigation

The navigation adapters map exact command patterns to an app-owned destination.
They consume transcripts supplied by the app; they do not capture or transcribe
speech. Every route is denied unless its authorization callback returns `true`.
Confirmation is required by default.

## Expo Router

Import the optional adapter rather than the package root:

```ts
import {router} from 'expo-router';
import {createExpoNavigationRouter} from 'nitro-wakeword/navigation/expo';

const voice = createExpoNavigationRouter({
  router,
  getSessionKey: () => appSession.generation,
  routes: [{
    commandId: 'open-home',
    patterns: ['open home', 'go home'],
    target: '/(tabs)/home',
    authorize: ({signal}) => !signal.aborted && appSession.canOpenHome(),
  }],
  confirm: (request, {signal}) =>
    showNavigationConfirmation(request.target, signal),
});

async function onTranscript(text: string) {
  const match = voice.match(text);
  if (match.status !== 'matched') return;
  try {
    const result = await voice.dispatch(match.candidate);
    showCommandStatus(result.status);
  } catch (error) {
    showNavigationFailure(error);
  }
}

// Call when the owning screen/session closes, then remove its transcript listener.
voice.dispose();
```

The app supplies `appSession`, confirmation UI, transcript subscription, and error
presentation. Route permissions must read current state, not a captured login
snapshot. The confirmation receives a frozen `{commandId, target}` bound to the
registered destination. The adapter calls Expo's `navigate`, which can reuse an
existing route instead of always pushing another copy.

Targets are `/` or slash-separated ASCII alphanumeric, underscore, or hyphen
segments. Parenthesized route groups such as `/(tabs)/home` are allowed. External
URLs, protocol-relative paths, backslashes, percent escapes, traversal, queries,
fragments, and dynamic `[id]` segments are rejected. No parameters are extracted
from speech or silently discarded. The configured screen must exist in the app;
Expo's generated typed routes can narrow valid paths at compile time.

## Bare React Navigation

Use a navigation object for the navigator that actually owns the registered
screens. Nested navigator traversal and parameterized screens are not supported
by this first slice.

```ts
import type {NavigationProp} from '@react-navigation/native';
import {createReactNavigationRouter} from 'nitro-wakeword/navigation/react-navigation';

type Screens = {
  Home: undefined;
  Profile: {id: string};
};

function bindVoice(navigation: NavigationProp<Screens>) {
  return createReactNavigationRouter<Screens>({
    navigation,
    getSessionKey: () => appSession.generation,
    routes: [{
      commandId: 'open-home',
      patterns: ['open home'],
      target: 'Home',
      authorize: () => appSession.canOpenHome(),
      requireConfirmation: false,
    }],
  });
}
```

`Profile` is a type error as a target because it requires parameters. Unknown
names are also rejected by the typed registry. At runtime, targets must be
1–128-character ASCII screen names starting with a letter; subsequent letters,
digits, spaces, underscores, and hyphens are allowed. URL and parameter syntax is
rejected. Immediately before dispatch the adapter checks the current navigator's
`routeNames`, then sends `CommonActions.navigate(target)`.

## Session changes, cancellation, and errors

- `getSessionKey` returns a stable string, finite number, or `null`. Use a unique
  generation for each authentication or app-context transition. Never reuse an
  earlier generation: an unseen A-to-B-to-A change cannot be detected. Do not
  return a password, access token, or other credential.
- Session identity is checked at match, dispatch, and around asynchronous guards.
  A changed generation invalidates previous candidates and aborts pending work.
  Call `cancelAll()` immediately when the app observes a session change so a
  confirmation that never settles can close promptly. There is no polling.
- Authorization is checked before confirmation, after confirmation, and again
  at execution. Before calling navigation, the adapter synchronously checks the
  command deadline, cancellation, and disposal even if its timer has not run yet.
  Callbacks must tolerate repeated checks and use the supplied abort signal. Missing callbacks and non-`true` results deny access.
- `NavigationError` has code `authorization-changed` if the final execution guard
  revokes permission, or `route-unavailable` if a React Navigation screen is no
  longer registered. App callback and navigation errors reject `dispatch` and
  must be handled by the host.
- Matching does not navigate. The command router's exact-match, ambiguity,
  expiration, one-shot candidate, and cancellation rules still apply. See
  [command routing](COMMANDS.md). Registry targets and patterns are snapshotted;
  create a new adapter when they change.
- Cancellation cannot undo a navigation action already dispatched. It also
  cannot stop side effects inside an app callback that ignores its abort signal.
  The `executed` status means the navigation call returned, not that a transition
  visibly finished. App-level navigation blockers can still refuse an action.

## Dependencies and verification

The two adapters are separate optional subpaths. The Expo adapter imports only
Expo peer types; it does not load React Navigation into Expo apps. The bare
adapter uses `@react-navigation/routers` at runtime and native navigation types.
Core wake-word and command imports do not load either optional adapter.

Local checks use `expo-router` 57.0.26, `@react-navigation/native` 7.5.0, and
`@react-navigation/routers` 7.6.4. Other versions are not compatibility claims.
Tests include the real React Navigation `TabRouter` selecting Home, type-level
required-parameter rejection, unsafe targets, session changes during confirmation
and final authorization, interrupted confirmation, default denial, and replay.
The Expo call boundary is tested without rendering an Expo app.

No microphone-to-Home device journey, Expo app render, or navigation animation was
run for this slice. Those remain prerequisites for closing the original plan's
end-to-end acceptance criteria.
