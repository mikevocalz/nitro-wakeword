# App-owned list search

`nitro-wakeword/search` is a native-free TypeScript entry point. It executes app-provided searches, returns display choices, paginates and selects an exact result. It does not capture audio, transcribe speech, fetch remote data automatically or decide which records a user may access.

## Create, search and clean up

```ts
import {createInMemoryListProvider, createListSearch} from 'nitro-wakeword/search';

const search = createListSearch({
  scope: 'books',
  // A new, never-reused generation for every account/permission session.
  getSessionKey: () => account.sessionGeneration,
  provider: createInMemoryListProvider({
    items: visibleBooks.map(book => ({
      id: book.id,
      label: book.title,
      description: book.author,
      value: {bookId: book.id},
    })),
  }),
  authorize: request => permissions.allow(request.action, request.scope),
  onSelect: async (item, context) => {
    // Values are app-owned references. Resolve current data and permissions again.
    const book = await books.readAuthorized(item.value.bookId);
    context.throwIfStopped();
    openBook(book);
  },
  pageSize: 10,
});

try {
  const result = await search.search('blue');
  if (result.status === 'results') {
    showChoices(result.page.choices);
    // Keep this exact page and use an explicitly chosen choice.id.
    // await search.select(result.page, choice.id);
    // await search.next(result.page);
  } else {
    showSearchStatus(result.status);
  }
} catch (error) {
  showSearchError(error);
}

// On logout, account changes or loss of the screen's authority:
search.cancelAll();
// When the owning screen/service is destroyed:
search.dispose();
```

The example's account, permissions, books and UI callbacks belong to the consuming app. Scope is an app-defined identifier passed to its provider and permission guard. Omitted `authorize`, false and non-boolean truthy values deny access. Providers must enforce row-level visibility; the session cannot infer it from a result label.

Custom `provider(request, context)` callbacks may return a page or a promise. Requests contain `scope`, `query`, `pageSize` and an optional private pagination cursor. Return `{items, nextCursor?}` with stable unique item IDs and globally ordered results. Observe `context.signal`, and call `context.throwIfStopped()` after your own awaits and before side effects. No new network or data recipient is configured by this package.

## Matching and disambiguation

The in-memory provider snapshots at most 10,000 items. It normalizes case and whitespace and ranks the whole list before paging: exact label, whole-query label prefix, then all query terms present in the label/description. Ties retain input order. It does not implement fuzzy matching or confidence scores. Custom providers own their own global ordering; the session preserves page order.

Duplicate labels remain separate choices. Nothing is selected automatically, including a single or top-ranked result. Selection uses an exact ID on the original page object. IDs are opaque app identifiers, never evaluated as code, URLs or routes. Public pages expose only the query, display choices and `hasNextPage`; values and cursors stay private.

Item wrappers and display strings are snapshotted. Generic `value` is neither deep-cloned nor deep-frozen. Prefer a stable ID payload and resolve current app data on selection. Do not treat returned display data as proof of current authorization.

## Voice command composition

Use the command router's bounded text slot for a search and pass its execution context into the search session:

```ts
const searchCommand = defineCommand({
  id: 'search-books',
  patterns: ['search books :query'],
  slots: {query: {kind: 'text', maxLength: 256}},
  requireConfirmation: false,
  execute: async ({query}, context) => {
    const result = await search.search(query, context);
    if (result.status !== 'results') throw new Error(`Search ${result.status}`);
    presentPage(result.page);
  },
});

// Create these commands for one displayed page. Dispose the owning router
// when that page is replaced. Never read a mutable currentPage after confirming.
function selectFirstCommand(page: ListSearchPage) {
  const first = page.choices[0];
  if (!first) return undefined;
  return defineCommand({
    id: 'select-first-book',
    patterns: ['select first book'],
    slots: {},
    execute: async (_slots, context) => {
      const result = await search.select(page, first.id, context);
      if (result.status !== 'selected') throw new Error(`Selection ${result.status}`);
    },
  });
}
```

Import `defineCommand` from `nitro-wakeword/commands` and the `ListSearchPage` type from `nitro-wakeword/search`. Configure the command router's own authorization and confirmation callbacks. Selection commands require confirmation by default; the list session does not add a second confirmation UI. Both the command candidate and exact result page must remain current. An old confirmation cannot select a newer page even if both contain the same ID. A command's `executed` status means its callback returned; handle a rejected list result explicitly as above.

## Lifetime, bounds and errors

- Valid new searches cancel pending work and invalidate old pages immediately, even if the new search later fails or is denied. Invalid query input does not invalidate a usable page.
- Permission checks run before fetching and again before exposing results. Selection checks permission immediately before calling the app. Session generations and monotonic deadlines are checked around asynchronous boundaries and through `throwIfStopped`.
- Call `cancelAll()` immediately on session changes. A generation is observed at API/callback boundaries, not continuously while a provider hangs. Never reuse an old generation, including an A → B → A account switch.
- A query and all its pages share one lifetime: 30 seconds by default, configurable from 1 to 300,000 milliseconds. Pagination does not renew it. Passing a command context also enforces the outer command's earlier cancellation/deadline.
- `next` and `select` return `busy` during another operation on the current page. A valid selection attempt consumes its page, including denial, failure or cancellation. An unknown ID does not consume it. Failed pagination leaves the previous page retryable; successful pagination makes it stale.
- Copied, forged and cross-session-object pages return `invalid-page`. Older query/pages return `stale`, consumed pages `already-used`, and exhausted pagination `end`. Account changes cancel the operation. Disposed sessions call no app callbacks.
- Cancellation stops waiting even if a provider/selector ignores its signal. It cannot undo started side effects, and ignored old callbacks may overlap newer operations. Apps must check the context before late side effects; this is not an underlying-operation mutex or a transaction.
- Queries are nonblank, at most 256 UTF-16 code units; IDs and scopes at most 256 without surrounding whitespace; labels 512; optional descriptions 1,024; cursors 2,048. Control and invisible directional formatting characters, including U+061C, are rejected. Page size is an integer from 1 to 50, at most 100 pages per query. Provider IDs must be unique across those pages; repeated cursors are rejected.
- Invalid options/input throw `TypeError` or `RangeError`. Invalid provider pages reject with `ListSearchError` code `invalid-provider-result`; the in-memory provider rejects invalid cursors with `invalid-cursor`; exceeding 100 pages rejects with `page-limit`. App callback errors propagate unchanged. Expected permission/lifetime/replay outcomes use the typed result union.

The in-memory provider does not query a live database. Recreate it when the visible list changes; recheck live permissions/data on selection. Cursor binding prevents accidental query/scope/page-size mixing, not forgery or unauthorized access. Sessions retain private item references while their page handles remain reachable; dispose the session and release old pages when the UI no longer needs them.

## Verification scope

Host tests exercise real providers, global ranking, pagination, command composition, delayed confirmations, permission/session races, synchronous deadlines and cancellation. The built entry is smoke-tested in Node without loading the microphone module. This does not demonstrate microphone-to-list interaction or a rendered UI on a physical device. No voice recording, model weight, external provider or private app data is bundled.
