import {createCommandRouter, defineCommand} from '../../commands';
import {createListSearch} from '../../search/createListSearch';
import type {ListSearchPage} from '../../search/ListSearchPage';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => {
    resolve = yes;
  });
  return {promise, resolve};
}
const options = () => ({
  scope: 'records',
  getSessionKey: () => 1,
  authorize: () => true,
  provider: () => ({
    items: [{id: 'record-1', label: 'Record', value: {id: 42}}],
  }),
  onSelect: jest.fn(),
});

it('routes bounded transcript text to the real provider and selects an exact confirmed page', async () => {
  const {onSelect, ...rest} = options();
  const provider = jest.fn(rest.provider);
  const search = createListSearch({...rest, provider, onSelect});
  let page: ListSearchPage | undefined;
  const voice = createCommandRouter({
    authorize: () => true,
    commands: [
      defineCommand({
        id: 'search',
        patterns: ['search :query'],
        slots: {query: {kind: 'text', maxLength: 256}},
        requireConfirmation: false,
        execute: async ({query}, context) => {
          const result = await search.search(query, context);
          if (result.status !== 'results')
            throw new Error(`Search ${result.status}`);
          page = result.page;
        },
      }),
    ],
  });
  const match = voice.match('search Power Rangers');
  if (match.status !== 'matched') throw new Error('Expected match');
  expect(await voice.dispatch(match.candidate)).toEqual({status: 'executed'});
  expect(provider).toHaveBeenCalledWith(
    {scope: 'records', query: 'Power Rangers', pageSize: 10},
    expect.any(Object),
  );
  if (!page) throw new Error('Expected results');
  const confirmedPage = page;
  const select = createCommandRouter({
    authorize: () => true,
    confirm: () => true,
    commands: [
      defineCommand({
        id: 'select-first',
        patterns: ['select first'],
        slots: {},
        execute: async (_slots, context) => {
          const result = await search.select(
            confirmedPage,
            'record-1',
            context,
          );
          if (result.status !== 'selected')
            throw new Error(`Selection ${result.status}`);
        },
      }),
    ],
  });
  const chosen = select.match('select first');
  if (chosen.status !== 'matched') throw new Error('Expected match');
  expect(await select.dispatch(chosen.candidate)).toEqual({status: 'executed'});
  expect(onSelect).toHaveBeenCalledWith(
    {id: 'record-1', label: 'Record', value: {id: 42}},
    expect.any(Object),
  );
  voice.dispose();
  select.dispose();
  search.dispose();
});

it('cannot redirect a delayed confirmation to a newer page with the same result id', async () => {
  const {onSelect, ...rest} = options();
  const search = createListSearch({...rest, onSelect});
  const first = await search.search('old query');
  if (first.status !== 'results') throw new Error('Expected results');
  const confirmation = deferred<boolean>();
  const entered = deferred<void>();
  const voice = createCommandRouter({
    authorize: () => true,
    confirm: () => {
      entered.resolve();
      return confirmation.promise;
    },
    commands: [
      defineCommand({
        id: 'select-first',
        patterns: ['select first'],
        slots: {},
        execute: async (_slots, context) => {
          const result = await search.select(first.page, 'record-1', context);
          if (result.status !== 'selected')
            throw new Error(`Selection ${result.status}`);
        },
      }),
    ],
  });
  const match = voice.match('select first');
  if (match.status !== 'matched') throw new Error('Expected match');
  const result = voice.dispatch(match.candidate);
  await entered.promise;
  expect((await search.search('new query')).status).toBe('results');
  confirmation.resolve(true);
  await expect(result).rejects.toThrow('Selection stale');
  expect(onSelect).not.toHaveBeenCalled();
  voice.dispose();
  search.dispose();
});

it('forwards outer command cancellation to a never-settling provider', async () => {
  const entered = deferred<void>();
  let signal: AbortSignal | undefined;
  const search = createListSearch({
    ...options(),
    provider: (_request, context) => {
      signal = context.signal;
      entered.resolve();
      return new Promise<never>(() => {});
    },
  });
  const voice = createCommandRouter({
    authorize: () => true,
    commands: [
      defineCommand({
        id: 'search',
        patterns: ['search'],
        slots: {},
        requireConfirmation: false,
        execute: async (_slots, context) => {
          await search.search('book', context);
        },
      }),
    ],
  });
  const match = voice.match('search');
  if (match.status !== 'matched') throw new Error('Expected match');
  const result = voice.dispatch(match.candidate);
  await entered.promise;
  voice.cancelAll();
  expect(await result).toEqual({status: 'cancelled'});
  expect(signal?.aborted).toBe(true);
  voice.dispose();
  search.dispose();
});

it('checks an outer synchronous deadline before publishing, even with a longer list lifetime', async () => {
  let time = 0;
  const clock = jest.spyOn(performance, 'now').mockImplementation(() => time);
  let published = false;
  const {onSelect, ...rest} = options();
  const search = createListSearch({
    ...rest,
    onSelect,
    provider: () => {
      time = 10;
      return rest.provider();
    },
  });
  const voice = createCommandRouter({
    maxAgeMs: 10,
    authorize: () => true,
    commands: [
      defineCommand({
        id: 'search',
        patterns: ['search'],
        slots: {},
        requireConfirmation: false,
        execute: async (_slots, context) => {
          const result = await search.search('book', context);
          published = result.status === 'results';
        },
      }),
    ],
  });
  try {
    const match = voice.match('search');
    if (match.status !== 'matched') throw new Error('Expected match');
    expect(await voice.dispatch(match.candidate)).toEqual({status: 'expired'});
    expect(published).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
  } finally {
    voice.dispose();
    search.dispose();
    clock.mockRestore();
  }
});
