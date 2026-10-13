import type {CommandExecutionContext} from '../../commands';
import {createInMemoryListProvider} from '../../search/createInMemoryListProvider';
import type {ListSearchItem} from '../../search/ListSearchItem';
import type {ListProviderRequest} from '../../search/ListSearchProvider';
import {ListSearchError} from '../../search/ListSearchError';

it.each([-1, 1.5, NaN, Infinity])(
  'rejects invalid proxy array lengths %p',
  length => {
    const items = new Proxy([], {
      get(target, key, receiver) {
        return key === 'length' ? length : Reflect.get(target, key, receiver);
      },
    });
    expect(() => createInMemoryListProvider({items})).toThrow(RangeError);
  },
);

function context(): CommandExecutionContext {
  const controller = new AbortController();
  return {
    signal: controller.signal,
    throwIfStopped: () => controller.signal.throwIfAborted(),
  };
}

it('ranks exact labels before prefixes and term matches over the whole list', async () => {
  const provider = createInMemoryListProvider({
    items: [
      {id: 'terms', label: 'Red project', description: 'Panda team', value: 1},
      {id: 'prefix', label: 'Red Panda planning', value: 2},
      {id: 'partial', label: 'Red squirrel', value: 3},
      {id: 'exact', label: '  RED   PANDA  ', value: 4},
      {id: 'reordered', label: 'Panda and red', value: 5},
    ],
  });

  const result = await provider(
    {scope: 'projects', query: ' red  panda ', pageSize: 50},
    context(),
  );

  expect(result.items.map(item => item.id)).toEqual([
    'exact',
    'prefix',
    'terms',
    'reordered',
  ]);
});

it('pages the global ranking with stable ties and an explicit final page', async () => {
  const provider = createInMemoryListProvider({
    items: [
      {id: 'term-first', label: 'A cat', value: 1},
      {id: 'prefix-first', label: 'Cat naps', value: 2},
      {id: 'exact-first', label: 'Cat', value: 3},
      {id: 'term-second', label: 'The cat', value: 4},
      {id: 'exact-second', label: 'CAT', value: 5},
      {id: 'prefix-second', label: 'Cat toy', value: 6},
    ],
  });
  const request = {scope: 'pets', query: 'cat', pageSize: 2};
  const first = await provider(request, context());
  expect(first.items.map(item => item.id)).toEqual([
    'exact-first',
    'exact-second',
  ]);
  expect(typeof first.nextCursor).toBe('string');
  const second = await provider(
    {...request, cursor: first.nextCursor},
    context(),
  );
  expect(second.items.map(item => item.id)).toEqual([
    'prefix-first',
    'prefix-second',
  ]);
  const last = await provider(
    {...request, cursor: second.nextCursor},
    context(),
  );
  expect(last.items.map(item => item.id)).toEqual([
    'term-first',
    'term-second',
  ]);
  expect(last.nextCursor).toBeUndefined();
  expect(
    await provider({...request, cursor: first.nextCursor}, context()),
  ).toEqual(second);
});

it.each([{items: null}, {items: {}}, {items: new Set()}, {}, null, undefined])(
  'rejects non-array items in %p',
  options => {
    expect(() =>
      createInMemoryListProvider(options as {items: ListSearchItem<unknown>[]}),
    ).toThrow(TypeError);
  },
);

it('rejects sparse arrays and duplicate IDs, while allowing duplicate labels', async () => {
  expect(() => createInMemoryListProvider({items: new Array(2)})).toThrow(
    TypeError,
  );
  expect(() =>
    createInMemoryListProvider({
      items: [
        {id: 'same', label: 'Cat', value: 1},
        {id: 'same', label: 'Dog', value: 2},
      ],
    }),
  ).toThrow(TypeError);
  const provider = createInMemoryListProvider({
    items: [
      {id: 'first', label: 'Cat', value: 1},
      {id: 'second', label: 'Cat', value: 2},
    ],
  });
  expect(
    (
      await provider({scope: 'pets', query: 'cat', pageSize: 50}, context())
    ).items.map(item => item.id),
  ).toEqual(['first', 'second']);
});

it('accepts at most 10000 snapshot items and pages at most 50', async () => {
  const items = Array.from({length: 10000}, (_, id) => ({
    id: String(id),
    label: 'Cat',
    value: id,
  }));
  const provider = createInMemoryListProvider({items});
  expect(
    (await provider({scope: 'pets', query: 'cat', pageSize: 50}, context()))
      .items,
  ).toHaveLength(50);
  items.push({id: '10000', label: 'Cat', value: 10000});
  expect(() => createInMemoryListProvider({items})).toThrow(RangeError);
});

it.each(['', ' ', 'cat\n', 'cat\u202e', 'x'.repeat(257), null, 12])(
  'rejects an invalid query %p',
  async query => {
    const provider = createInMemoryListProvider({items: []});
    await expect(
      Promise.resolve().then(() =>
        provider(
          {scope: 'pets', query: query as string, pageSize: 1},
          context(),
        ),
      ),
    ).rejects.toThrow(TypeError);
  },
);

it.each([0, -1, 51, 1.5, NaN, Infinity, '2', null, undefined])(
  'rejects an invalid page size %p',
  async pageSize => {
    const provider = createInMemoryListProvider({items: []});
    await expect(
      Promise.resolve().then(() =>
        provider(
          {scope: 'pets', query: 'cat', pageSize: pageSize as number},
          context(),
        ),
      ),
    ).rejects.toThrow(RangeError);
  },
);

it.each(['', ' pets ', 'pets\u0000', 'x'.repeat(257), null])(
  'rejects an invalid scope %p',
  async scope => {
    const provider = createInMemoryListProvider({items: []});
    await expect(
      Promise.resolve().then(() =>
        provider(
          {scope: scope as string, query: 'cat', pageSize: 1},
          context(),
        ),
      ),
    ).rejects.toThrow(TypeError);
  },
);

it.each([null, undefined, {}])(
  'rejects an invalid provider request %p',
  async request => {
    const provider = createInMemoryListProvider({items: []});
    await expect(
      Promise.resolve().then(() =>
        provider(request as ListProviderRequest, context()),
      ),
    ).rejects.toThrow(TypeError);
  },
);

it('returns empty final results for an empty list or an unmatched query', async () => {
  const empty = createInMemoryListProvider({items: []});
  const provider = createInMemoryListProvider({
    items: [{id: 'one', label: 'Cat', value: 1}],
  });
  const request = {scope: 'pets', query: 'dog', pageSize: 1};
  expect(await empty(request, context())).toEqual({items: []});
  expect(await provider(request, context())).toEqual({items: []});
});

it('returns a partial last page and never fuzzy-matches missing terms', async () => {
  const provider = createInMemoryListProvider({
    items: [
      {id: 'one', label: 'Cat', value: 1},
      {id: 'two', label: 'Cat', value: 2},
      {id: 'three', label: 'Cat', value: 3},
    ],
  });
  const request = {scope: 'pets', query: 'cat', pageSize: 2};
  const first = await provider(request, context());
  expect(
    await provider({...request, cursor: first.nextCursor}, context()),
  ).toEqual({items: [{id: 'three', label: 'Cat', value: 3}]});
  expect(await provider({...request, query: 'cats'}, context())).toEqual({
    items: [],
  });
  expect(await provider({...request, query: 'cat dog'}, context())).toEqual({
    items: [],
  });
});

it('rejects malformed and oversized cursors with the public cursor error', async () => {
  const provider = createInMemoryListProvider({
    items: [
      {id: 'one', label: 'Cat', value: 1},
      {id: 'two', label: 'Cat', value: 2},
    ],
  });
  const request = {scope: 'pets', query: 'cat', pageSize: 1};
  const {nextCursor} = await provider(request, context());
  const cursors = [
    '',
    '{}',
    'not-a-cursor',
    'x'.repeat(2049),
    null,
    1,
    nextCursor + ':extra',
    nextCursor + '\n',
    nextCursor + '\u2028',
    nextCursor?.slice(0, -1),
  ];
  for (const cursor of cursors) {
    const result = Promise.resolve().then(() =>
      provider({...request, cursor: cursor as string}, context()),
    );
    await expect(result).rejects.toBeInstanceOf(ListSearchError);
    await expect(result).rejects.toMatchObject({code: 'invalid-cursor'});
  }
});

it('binds cursors to the exact scope, query and page size', async () => {
  const provider = createInMemoryListProvider({
    items: [
      {id: 'one', label: 'Cat', value: 1},
      {id: 'two', label: 'Cat', value: 2},
      {id: 'three', label: 'Cat', value: 3},
    ],
  });
  const request = {scope: 'pets', query: 'cat', pageSize: 1};
  const {nextCursor} = await provider(request, context());
  for (const changed of [
    {scope: 'other'},
    {query: 'dog'},
    {query: 'CAT'},
    {query: ' cat '},
    {pageSize: 2},
  ]) {
    await expect(
      Promise.resolve().then(() =>
        provider({...request, ...changed, cursor: nextCursor}, context()),
      ),
    ).rejects.toMatchObject({code: 'invalid-cursor'});
  }
});

it('keeps the cursor bounded for maximal text, including unpaired surrogates', async () => {
  const text = '\ud800'.repeat(256);
  const provider = createInMemoryListProvider({
    items: [
      {id: 'one', label: text, value: 1},
      {id: 'two', label: text, value: 2},
    ],
  });
  const request = {scope: text, query: text, pageSize: 1};
  const first = await provider(request, context());
  expect(first.nextCursor?.length).toBeLessThanOrEqual(2048);
  expect(
    (await provider({...request, cursor: first.nextCursor}, context())).items[0]
      ?.id,
  ).toBe('two');
});

it('snapshots the source array and display fields without cloning or freezing values', async () => {
  const value = {count: 1};
  const source = {id: 'one', label: 'Cat', description: 'Original', value};
  const items = [source];
  const provider = createInMemoryListProvider({items});
  source.id = 'changed';
  source.label = 'Dog';
  source.description = 'Changed';
  source.value = {count: 99};
  items.length = 0;
  value.count = 2;

  const result = await provider(
    {scope: 'pets', query: 'cat', pageSize: 1},
    context(),
  );
  expect(result.items).toEqual([
    {id: 'one', label: 'Cat', description: 'Original', value: {count: 2}},
  ]);
  expect(result.items[0]?.value).toBe(value);
  expect(Object.isFrozen(result)).toBe(true);
  expect(Object.isFrozen(result.items)).toBe(true);
  expect(Object.isFrozen(result.items[0])).toBe(true);
  expect(Object.isFrozen(value)).toBe(false);
  expect(() => Object.assign(result.items[0]!, {label: 'Changed'})).toThrow(
    TypeError,
  );
});

it('reads item and options getters once at creation', async () => {
  const reads = {items: 0, id: 0, label: 0, description: 0, value: 0};
  const provider = createInMemoryListProvider({
    get items() {
      reads.items++;
      return [
        {
          get id() {
            reads.id++;
            return reads.id === 1 ? 'one' : 'changed';
          },
          get label() {
            reads.label++;
            return reads.label === 1 ? 'Cat' : 'Dog';
          },
          get description() {
            reads.description++;
            return reads.description === 1 ? 'Original' : 'Changed';
          },
          get value() {
            reads.value++;
            return reads.value;
          },
        },
      ];
    },
  });
  const request = {scope: 'pets', query: 'cat', pageSize: 1};
  expect(await provider(request, context())).toEqual({
    items: [{id: 'one', label: 'Cat', description: 'Original', value: 1}],
  });
  expect(await provider(request, context())).toEqual({
    items: [{id: 'one', label: 'Cat', description: 'Original', value: 1}],
  });
  expect(reads).toEqual({items: 1, id: 1, label: 1, description: 1, value: 1});
});

it('reads array entries once and rejects inherited entries in sparse arrays', async () => {
  let reads = 0;
  const items: ListSearchItem<number>[] = [];
  Object.defineProperty(items, 0, {
    get: () => {
      reads++;
      return {id: String(reads), label: 'Cat', value: reads};
    },
  });
  const provider = createInMemoryListProvider({items});
  expect(
    (await provider({scope: 'pets', query: 'cat', pageSize: 1}, context()))
      .items[0]?.id,
  ).toBe('1');
  expect(reads).toBe(1);
  const sparse = new Array(1);
  Object.setPrototypeOf(sparse, {0: {id: 'one', label: 'Cat', value: 1}});
  expect(() => createInMemoryListProvider({items: sparse})).toThrow(TypeError);
});

it.each([
  null,
  undefined,
  {id: '', label: 'Cat', value: 1},
  {id: ' one ', label: 'Cat', value: 1},
  {id: 'x'.repeat(257), label: 'Cat', value: 1},
  {id: 'one', label: '', value: 1},
  {id: 'one', label: 'Cat\n', value: 1},
  {id: 'one', label: 'x'.repeat(513), value: 1},
  {id: 'one', label: 'Cat', description: '', value: 1},
  {id: 'one', label: 'Cat', description: 'x'.repeat(1025), value: 1},
])('rejects an invalid item snapshot %p', item => {
  expect(() =>
    createInMemoryListProvider({items: [item as ListSearchItem<number>]}),
  ).toThrow(TypeError);
});

it('accepts maximal display text lengths and arbitrary application values', async () => {
  const value: {self?: unknown} = {};
  value.self = value;
  const item = {
    id: 'i'.repeat(256),
    label: 'x'.repeat(512),
    description: 'd'.repeat(1024),
    value,
  };
  const provider = createInMemoryListProvider({items: [item]});
  const result = await provider(
    {scope: 's'.repeat(256), query: 'x'.repeat(256), pageSize: 1},
    context(),
  );
  expect(result.items[0]).toEqual(item);
  expect(result.items[0]?.value).toBe(value);
});

it('reads request getters once before ranking and paging', async () => {
  const provider = createInMemoryListProvider({
    items: [
      {id: 'one', label: 'Cat', value: 1},
      {id: 'two', label: 'Cat', value: 2},
    ],
  });
  const reads = {scope: 0, query: 0, pageSize: 0, cursor: 0};
  const result = await provider(
    {
      get scope() {
        reads.scope++;
        return reads.scope === 1 ? 'pets' : '';
      },
      get query() {
        reads.query++;
        return reads.query === 1 ? 'cat' : '';
      },
      get pageSize() {
        reads.pageSize++;
        return reads.pageSize === 1 ? 1 : 0;
      },
      get cursor() {
        reads.cursor++;
        return undefined;
      },
    },
    context(),
  );
  expect(result.items[0]?.id).toBe('one');
  expect(result.nextCursor).toBeDefined();
  expect(reads).toEqual({scope: 1, query: 1, pageSize: 1, cursor: 1});
});

it('propagates pre-existing cancellation without reading the request', async () => {
  const controller = new AbortController();
  const reason = new Error('Cancelled');
  controller.abort(reason);
  const provider = createInMemoryListProvider({items: []});
  const request = {
    get scope(): string {
      throw new Error('Should not be read');
    },
    query: 'cat',
    pageSize: 1,
  };
  await expect(
    Promise.resolve().then(() =>
      provider(request, {
        signal: controller.signal,
        throwIfStopped: () => controller.signal.throwIfAborted(),
      }),
    ),
  ).rejects.toBe(reason);
});

it('observes cancellation caused by request access before returning empty results', async () => {
  const controller = new AbortController();
  const reason = new Error('Cancelled');
  const provider = createInMemoryListProvider({items: []});
  const request = {
    scope: 'pets',
    get query() {
      controller.abort(reason);
      return 'cat';
    },
    pageSize: 1,
  };
  await expect(
    Promise.resolve().then(() =>
      provider(request, {
        signal: controller.signal,
        throwIfStopped: () => controller.signal.throwIfAborted(),
      }),
    ),
  ).rejects.toBe(reason);
});

it('honors a stop condition reached during computation', async () => {
  const provider = createInMemoryListProvider({
    items: Array.from({length: 100}, (_, id) => ({
      id: String(id),
      label: 'Cat',
      value: id,
    })),
  });
  const reason = new Error('Expired');
  let checks = 0;
  await expect(
    Promise.resolve().then(() =>
      provider(
        {scope: 'pets', query: 'cat', pageSize: 1},
        {
          signal: new AbortController().signal,
          throwIfStopped: () => {
            if (++checks > 2) throw reason;
          },
        },
      ),
    ),
  ).rejects.toBe(reason);
});

it('infers the application value type from the items', async () => {
  const provider = createInMemoryListProvider({
    items: [{id: 'one', label: 'Cat', value: {slug: 'cat'}}],
  });
  const result = await provider(
    {scope: 'pets', query: 'cat', pageSize: 1},
    context(),
  );
  const slug: string | undefined = result.items[0]?.value.slug;
  // @ts-expect-error The inferred application value has no numeric ID.
  const numericId: number | undefined = result.items[0]?.value.numericId;
  expect(slug).toBe('cat');
  expect(numericId).toBeUndefined();
});
