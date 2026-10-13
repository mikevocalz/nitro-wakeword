import {createListSearch} from '../../search/createListSearch';
import type {ListSearchPage} from '../../search/ListSearchPage';
import type {ListProviderPage} from '../../search/ListSearchProvider';
import type {ListSearchResult} from '../../search/ListSearch';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return {promise, resolve, reject};
}
const item = (id = 'a') => ({id, label: 'Same label', value: {recordId: id}});
const setup = () => {
  const provider = jest.fn(() => ({items: [item()]}));
  const onSelect = jest.fn();
  const authorize = jest.fn(() => true);
  const options = {
    scope: 'books',
    getSessionKey: () => 'session-1',
    provider,
    onSelect,
    authorize,
  };
  return {provider, onSelect, authorize, options};
};
async function pageOf(
  result: Promise<{status: string; page?: ListSearchPage}>,
) {
  const value = await result;
  if (!value.page) throw new Error(`Expected page, received ${value.status}`);
  return value.page;
}

it('denies by default and never loads or selects unapproved data', async () => {
  const {options, provider, onSelect} = setup();
  const search = createListSearch({...options, authorize: undefined});
  expect(await search.search('book')).toEqual({status: 'denied'});
  expect(provider).not.toHaveBeenCalled();
  expect(onSelect).not.toHaveBeenCalled();
});

it('publishes immutable display choices, keeps values private and selects by exact id once', async () => {
  const {options, onSelect, authorize} = setup();
  const search = createListSearch(options);
  const page = await pageOf(search.search(' book '));
  expect(page).toEqual({
    query: 'book',
    choices: [{id: 'a', label: 'Same label'}],
    hasNextPage: false,
  });
  expect(Object.isFrozen(page)).toBe(true);
  expect(Object.isFrozen(page.choices)).toBe(true);
  expect(Object.isFrozen(page.choices[0])).toBe(true);
  expect(await search.select({...page}, 'a')).toEqual({status: 'invalid-page'});
  expect(await search.select(page, 'missing')).toEqual({status: 'not-found'});
  expect(await search.select(page, 'a')).toEqual({status: 'selected'});
  expect(onSelect).toHaveBeenCalledWith(
    item(),
    expect.objectContaining({throwIfStopped: expect.any(Function)}),
  );
  expect(authorize).toHaveBeenLastCalledWith(
    {action: 'select', scope: 'books', query: 'book', id: 'a'},
    expect.any(Object),
  );
  expect(await search.select(page, 'a')).toEqual({status: 'already-used'});
});

it('supersedes pending requests and rejects late results without clearing newer work', async () => {
  const first = deferred<ListProviderPage<unknown>>();
  const second = deferred<ListProviderPage<unknown>>();
  const entered = deferred<void>();
  const provider = jest
    .fn()
    .mockImplementationOnce(() => {
      entered.resolve();
      return first.promise;
    })
    .mockReturnValueOnce(second.promise);
  const search = createListSearch({...setup().options, provider});
  const a = search.search('first');
  await entered.promise;
  expect(provider).toHaveBeenCalledTimes(1);
  const b = search.search('second');
  expect(await a).toEqual({status: 'cancelled'});
  first.resolve({items: [item('old')]});
  second.resolve({items: [item('new')]});
  const page = await pageOf(b);
  expect(page.choices[0]?.id).toBe('new');
  expect(await search.select(page, 'new')).toEqual({status: 'selected'});
});

it('reserves supersession identity before synchronous provider abort listeners run', async () => {
  const entered = deferred<void>();
  let inner: Promise<ListSearchResult> | undefined;
  const provider = jest.fn((request, context) => {
    if (request.query !== 'old') return {items: [item(request.query)]};
    context.signal.addEventListener(
      'abort',
      () => {
        inner = search.search('inner');
      },
      {once: true},
    );
    entered.resolve();
    return new Promise<never>(() => {});
  });
  const search = createListSearch({...setup().options, provider});
  const old = search.search('old');
  await entered.promise;
  const outer = search.search('outer');
  expect(await old).toEqual({status: 'cancelled'});
  expect(await outer).toEqual({status: 'cancelled'});
  if (!inner) throw new Error('Expected reentrant search');
  const page = await pageOf(inner);
  expect(page.query).toBe('inner');
  expect(await search.select(page, 'inner')).toEqual({status: 'selected'});
  expect(provider.mock.calls.map(([request]) => request.query)).toEqual([
    'old',
    'inner',
  ]);
});

it('retains cancellation ownership of a reentrant newest request', async () => {
  const oldEntered = deferred<void>();
  const innerEntered = deferred<void>();
  let inner: Promise<ListSearchResult> | undefined;
  let innerSignal: AbortSignal | undefined;
  const search = createListSearch({
    ...setup().options,
    provider: (request, context) => {
      if (request.query === 'old') {
        context.signal.addEventListener(
          'abort',
          () => {
            inner = search.search('inner');
          },
          {once: true},
        );
        oldEntered.resolve();
      } else {
        innerSignal = context.signal;
        innerEntered.resolve();
      }
      return new Promise<never>(() => {});
    },
  });
  const old = search.search('old');
  await oldEntered.promise;
  const outer = search.search('outer');
  await innerEntered.promise;
  search.cancelAll();
  expect(innerSignal?.aborted).toBe(true);
  expect(await old).toEqual({status: 'cancelled'});
  expect(await outer).toEqual({status: 'cancelled'});
  expect(await inner).toEqual({status: 'cancelled'});
});

it('checks permission again after provider completion', async () => {
  const pending = deferred<ListProviderPage<unknown>>();
  const entered = deferred<void>();
  let allowed = true;
  const search = createListSearch({
    ...setup().options,
    provider: () => {
      entered.resolve();
      return pending.promise;
    },
    authorize: () => allowed,
  });
  const result = search.search('book');
  await entered.promise;
  allowed = false;
  pending.resolve({items: [item()]});
  expect(await result).toEqual({status: 'denied'});
});

it('rejects pages issued by another search instance', async () => {
  const first = createListSearch(setup().options);
  const second = createListSearch(setup().options);
  const page = await pageOf(first.search('book'));
  expect(await second.next(page)).toEqual({status: 'invalid-page'});
  expect(await second.select(page, 'a')).toEqual({status: 'invalid-page'});
});

it('returns busy without consuming a page while its next page is loading', async () => {
  const entered = deferred<void>();
  const pending = deferred<ListProviderPage<unknown>>();
  const provider = jest
    .fn()
    .mockReturnValueOnce({items: [item()], nextCursor: 'next'})
    .mockImplementationOnce(() => {
      entered.resolve();
      return pending.promise;
    });
  const search = createListSearch({...setup().options, provider});
  const first = await pageOf(search.search('book'));
  const next = search.next(first);
  await entered.promise;
  expect(await search.next(first)).toEqual({status: 'busy'});
  expect(await search.select(first, 'a')).toEqual({status: 'busy'});
  pending.reject(new Error('failed'));
  await expect(next).rejects.toThrow('failed');
  expect(await search.select(first, 'a')).toEqual({status: 'selected'});
});

it('invalidates old pages even if the superseding search is denied', async () => {
  let allowed = true;
  const search = createListSearch({
    ...setup().options,
    authorize: () => allowed,
  });
  const old = await pageOf(search.search('old'));
  allowed = false;
  expect(await search.search('new')).toEqual({status: 'denied'});
  expect(await search.select(old, 'a')).toEqual({status: 'stale'});
});

it('rejects repeated cursors and duplicate ids across pages without consuming the old page', async () => {
  const provider = jest
    .fn()
    .mockReturnValueOnce({items: [item()], nextCursor: 'next'})
    .mockReturnValueOnce({items: [item('b')], nextCursor: 'next'})
    .mockReturnValueOnce({items: [item()]})
    .mockReturnValueOnce({items: [item('b')]});
  const search = createListSearch({...setup().options, provider});
  const first = await pageOf(search.search('book'));
  await expect(search.next(first)).rejects.toMatchObject({
    code: 'invalid-provider-result',
  });
  await expect(search.next(first)).rejects.toMatchObject({
    code: 'invalid-provider-result',
  });
  const second = await pageOf(search.next(first));
  expect(second.choices[0]?.id).toBe('b');
});

it.each([
  null,
  {items: new Array(1)},
  {items: [item(), item()]},
  {items: [item(' a ')]},
  {items: [{...item(), label: '\u061cbook'}]},
  {items: [item()], nextCursor: ''},
  {items: [item()], nextCursor: 'x'.repeat(2049)},
  {items: Array.from({length: 11}, (_, i) => item(String(i)))},
])('rejects malformed provider output %p', async result => {
  const search = createListSearch({
    ...setup().options,
    provider: () => result as never,
  });
  await expect(search.search('book')).rejects.toMatchObject({
    code: 'invalid-provider-result',
  });
});

it('snapshots getters once and ignores later item/array mutations', async () => {
  const value = {recordId: 'original'};
  const id = jest.fn(() => 'a');
  const rows = [
    {
      get id() {
        return id();
      },
      label: 'Before',
      value,
    },
  ];
  const onSelect = jest.fn();
  const search = createListSearch({
    ...setup().options,
    provider: () => ({items: rows}),
    onSelect,
  });
  const page = await pageOf(search.search('book'));
  rows[0]!.label = 'After';
  rows.length = 0;
  expect(id).toHaveBeenCalledTimes(1);
  expect(page.choices).toEqual([{id: 'a', label: 'Before'}]);
  expect(await search.select(page, 'a')).toEqual({status: 'selected'});
  expect(onSelect.mock.calls[0]![0].value).toBe(value);
  expect(Object.isFrozen(value)).toBe(false);
});

it('uses bounded indexed entries rather than a provider-controlled iterator', async () => {
  const rows = [item()];
  const iterator = jest.fn(() => {
    throw new Error('Must not iterate');
  });
  Object.defineProperty(rows, Symbol.iterator, {value: iterator});
  let lengthReads = 0;
  const proxy = new Proxy(rows, {
    get(target, key, receiver) {
      if (key === 'length') {
        lengthReads += 1;
        return lengthReads === 1 ? 1 : 1000000;
      }
      return Reflect.get(target, key, receiver);
    },
  });
  const search = createListSearch({
    ...setup().options,
    provider: () => ({items: proxy}),
  });
  const page = await pageOf(search.search('book'));
  expect(page.choices).toHaveLength(1);
  expect(lengthReads).toBe(1);
  expect(iterator).not.toHaveBeenCalled();
});

it('does not choose among duplicate labels or interpret ids as commands', async () => {
  const {options, onSelect} = setup();
  const search = createListSearch({
    ...options,
    provider: () => ({items: [item('one'), item('https://example.com')]}),
  });
  const page = await pageOf(search.search('label'));
  expect(onSelect).not.toHaveBeenCalled();
  expect(await search.select(page, 'Same label')).toEqual({
    status: 'not-found',
  });
  expect(await search.select(page, 'https://example.com')).toEqual({
    status: 'selected',
  });
  expect(onSelect.mock.calls[0]![0].id).toBe('https://example.com');
});

it('checks exact monotonic deadlines even when the expiry timer has not run', async () => {
  let time = 10.25;
  const now = jest.spyOn(performance, 'now').mockImplementation(() => time);
  const {options, provider} = setup();
  const search = createListSearch({
    ...options,
    maxAgeMs: 10,
    authorize: () => {
      time = 20.25;
      return true;
    },
  });
  try {
    expect(await search.search('book')).toEqual({status: 'expired'});
    expect(provider).not.toHaveBeenCalled();
  } finally {
    search.dispose();
    now.mockRestore();
  }
});

it('does not renew query deadlines when loading another page', async () => {
  let time = 0;
  const now = jest.spyOn(performance, 'now').mockImplementation(() => time);
  const provider = jest
    .fn()
    .mockReturnValueOnce({items: [item()], nextCursor: 'next'})
    .mockReturnValueOnce({items: [item('b')]});
  const {options, onSelect} = setup();
  const search = createListSearch({...options, provider, maxAgeMs: 100});
  try {
    const first = await pageOf(search.search('book'));
    time = 99;
    const second = await pageOf(search.next(first));
    time = 100;
    expect(await search.select(second, 'b')).toEqual({status: 'expired'});
    expect(onSelect).not.toHaveBeenCalled();
  } finally {
    search.dispose();
    now.mockRestore();
  }
});

it('expires a never-settling provider and aborts its signal', async () => {
  jest.useFakeTimers();
  const entered = deferred<void>();
  let signal: AbortSignal | undefined;
  const search = createListSearch({
    ...setup().options,
    maxAgeMs: 10,
    provider: (_request, context) => {
      signal = context.signal;
      entered.resolve();
      return new Promise<never>(() => {});
    },
  });
  try {
    const result = search.search('book');
    await entered.promise;
    await jest.advanceTimersByTimeAsync(10);
    expect(await result).toEqual({status: 'expired'});
    expect(signal?.aborted).toBe(true);
  } finally {
    search.dispose();
    jest.useRealTimers();
  }
});

it('reschedules an early expiry callback until the fractional monotonic deadline', async () => {
  jest.useFakeTimers();
  let time = 10.25;
  const clock = jest.spyOn(performance, 'now').mockImplementation(() => time);
  const entered = deferred<void>();
  let signal: AbortSignal | undefined;
  const search = createListSearch({
    ...setup().options,
    maxAgeMs: 10,
    provider: (_request, context) => {
      signal = context.signal;
      entered.resolve();
      return new Promise<never>(() => {});
    },
  });
  try {
    const result = search.search('book');
    await entered.promise;
    time = 20.1;
    await jest.advanceTimersByTimeAsync(10);
    expect(signal?.aborted).toBe(false);
    time = 20.25;
    await jest.advanceTimersByTimeAsync(1);
    expect(await result).toEqual({status: 'expired'});
  } finally {
    search.dispose();
    clock.mockRestore();
    jest.useRealTimers();
  }
});

it('propagates selector errors unchanged and leaves the page consumed', async () => {
  const error = new Error('App failed');
  const search = createListSearch({
    ...setup().options,
    onSelect: () => {
      throw error;
    },
  });
  const page = await pageOf(search.search('book'));
  await expect(search.select(page, 'a')).rejects.toBe(error);
  expect(await search.select(page, 'a')).toEqual({status: 'already-used'});
});

it('rejects non-boolean authorization and invalid session keys', async () => {
  const {options, provider} = setup();
  const denied = createListSearch({
    ...options,
    authorize: () => 'yes' as never,
  });
  expect(await denied.search('book')).toEqual({status: 'denied'});
  expect(provider).not.toHaveBeenCalled();
  const invalid = createListSearch({...options, getSessionKey: () => NaN});
  await expect(invalid.search('book')).rejects.toThrow('Session key');
});

it('cancels permission races and never invokes selection after a session switch', async () => {
  const entered = deferred<void>();
  const gate = deferred<boolean>();
  let session = 1;
  const {options, onSelect} = setup();
  const search = createListSearch({
    ...options,
    getSessionKey: () => session,
    authorize: request => {
      if (request.action !== 'select') return true;
      entered.resolve();
      return gate.promise;
    },
  });
  const page = await pageOf(search.search('book'));
  const result = search.select(page, 'a');
  await entered.promise;
  session = 2;
  gate.resolve(true);
  expect(await result).toEqual({status: 'cancelled'});
  expect(onSelect).not.toHaveBeenCalled();
});

it('lets app selection code guard its late side effects after cancellation', async () => {
  const entered = deferred<void>();
  const release = deferred<void>();
  const sideEffect = jest.fn();
  const search = createListSearch({
    ...setup().options,
    onSelect: async (_item, context) => {
      entered.resolve();
      await release.promise;
      context.throwIfStopped();
      sideEffect();
    },
  });
  const page = await pageOf(search.search('book'));
  const result = search.select(page, 'a');
  await entered.promise;
  search.cancelAll();
  expect(await result).toEqual({status: 'cancelled'});
  release.resolve();
  await Promise.resolve();
  expect(sideEffect).not.toHaveBeenCalled();
});

it('does not let an older request cleanup release a newer active operation', async () => {
  const entered = deferred<void>();
  const pending = deferred<ListProviderPage<unknown>>();
  const search = createListSearch({
    ...setup().options,
    provider: request => {
      if (request.query === 'old') return new Promise<never>(() => {});
      if (request.cursor) {
        entered.resolve();
        return pending.promise;
      }
      return {items: [item()], nextCursor: 'next'};
    },
  });
  const old = search.search('old');
  const page = await pageOf(search.search('new'));
  const next = search.next(page);
  await entered.promise;
  expect(await old).toEqual({status: 'cancelled'});
  expect(await search.select(page, 'a')).toEqual({status: 'busy'});
  pending.resolve({items: [item('b')]});
  expect((await pageOf(next)).choices[0]?.id).toBe('b');
});

it('rejects invalid configuration and unsafe input without invalidating valid pages', async () => {
  for (const pageSize of [0, 51, 1.5, NaN])
    expect(() => createListSearch({...setup().options, pageSize})).toThrow(
      RangeError,
    );
  for (const maxAgeMs of [0, 300001, Infinity])
    expect(() => createListSearch({...setup().options, maxAgeMs})).toThrow(
      RangeError,
    );
  const search = createListSearch(setup().options);
  const page = await pageOf(search.search('book'));
  for (const query of ['', ' ', '\u061cbook', 'book\nnow', 'x'.repeat(257)])
    await expect(search.search(query)).rejects.toThrow(TypeError);
  expect(await search.select(page, 'a')).toEqual({status: 'selected'});
});

it('bounds total query pagination even if a provider emits unique empty pages', async () => {
  let counter = 0;
  const search = createListSearch({
    ...setup().options,
    provider: () => ({items: [], nextCursor: String(++counter)}),
  });
  let page = await pageOf(search.search('book'));
  for (let n = 1; n < 100; n++) page = await pageOf(search.next(page));
  await expect(search.next(page)).rejects.toMatchObject({code: 'page-limit'});
  expect(counter).toBe(100);
});

it('invalidates old pages on a new query and when the account generation changes', async () => {
  let generation = 1;
  const search = createListSearch({
    ...setup().options,
    getSessionKey: () => generation,
  });
  const old = await pageOf(search.search('old'));
  const current = await pageOf(search.search('current'));
  expect(await search.select(old, 'a')).toEqual({status: 'stale'});
  generation = 2;
  expect(await search.select(current, 'a')).toEqual({status: 'cancelled'});
});

it('stops waiting for ignored callbacks on cancel/dispose and never calls app code after disposal', async () => {
  const {options, provider, onSelect} = setup();
  const never = new Promise<boolean>(() => {});
  const getSessionKey = jest.fn(() => 'session');
  const search = createListSearch({
    ...options,
    getSessionKey,
    authorize: () => never,
  });
  const result = search.search('book');
  search.cancelAll();
  expect(await result).toEqual({status: 'cancelled'});
  const another = search.search('book');
  search.dispose();
  search.dispose();
  expect(await another).toEqual({status: 'disposed'});
  getSessionKey.mockClear();
  expect(await search.search('book')).toEqual({status: 'disposed'});
  expect(getSessionKey).not.toHaveBeenCalled();
  expect(provider).not.toHaveBeenCalled();
  expect(onSelect).not.toHaveBeenCalled();
});

it('consumes denied selection attempts and serializes attempts on a page', async () => {
  const gate = deferred<boolean>();
  const search = createListSearch({
    ...setup().options,
    authorize: request => (request.action === 'select' ? gate.promise : true),
  });
  const page = await pageOf(search.search('book'));
  const result = search.select(page, 'a');
  expect(await search.select(page, 'a')).toEqual({status: 'already-used'});
  gate.resolve(false);
  expect(await result).toEqual({status: 'denied'});
  expect(await search.select(page, 'a')).toEqual({status: 'already-used'});
});

it('paginates in provider order and invalidates only successfully replaced pages', async () => {
  const provider = jest
    .fn()
    .mockReturnValueOnce({items: [item('a')], nextCursor: 'second'})
    .mockRejectedValueOnce(new Error('offline'))
    .mockReturnValueOnce({items: [item('b')]});
  const search = createListSearch({...setup().options, provider});
  const first = await pageOf(search.search('book'));
  await expect(search.next(first)).rejects.toThrow('offline');
  const second = await pageOf(search.next(first));
  expect(provider).toHaveBeenLastCalledWith(
    {scope: 'books', query: 'book', pageSize: 10, cursor: 'second'},
    expect.any(Object),
  );
  expect(await search.next(first)).toEqual({status: 'stale'});
  expect(await search.next(second)).toEqual({status: 'end'});
});
