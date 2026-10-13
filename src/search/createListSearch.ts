import type {CommandExecutionContext} from '../commands';
import {
  commandCancelled,
  waitForCommandCallback,
} from '../commands/waitForCommandCallback';
import type {
  ListSearch,
  ListSearchRejection,
  ListSearchResult,
} from './ListSearch';
import type {
  ListPermissionRequest,
  ListSearchOptions,
} from './ListSearchOptions';
import type {ListSearchPage} from './ListSearchPage';
import type {ListSearchItem} from './ListSearchItem';
import type {ListProviderPage} from './ListSearchProvider';
import {ListSearchError} from './ListSearchError';
import {listId, listText, snapshotListItem} from './listValidation';

type StopStatus = 'cancelled' | 'expired' | 'disposed';
class ListStopped extends Error {
  constructor(readonly status: StopStatus) {
    super(`List search ${status}`);
  }
}
interface Query {
  text: string;
  epoch: number;
  sessionKey: string | number | null;
  deadline: number;
  ids: Set<string>;
  cursors: Set<string>;
  pageCount: number;
}
interface PageRecord<T> {
  query: Query;
  items: readonly ListSearchItem<T>[];
  cursor?: string;
  used: boolean;
}

export function createListSearch<T>(options: ListSearchOptions<T>): ListSearch {
  const {provider, authorize, onSelect, getSessionKey} = options;
  const scope = listId(options.scope, 'scope');
  const pageSize = options.pageSize ?? 10;
  const maxAgeMs = options.maxAgeMs ?? 30_000;
  if (
    typeof provider !== 'function' ||
    typeof onSelect !== 'function' ||
    typeof getSessionKey !== 'function' ||
    (authorize !== undefined && typeof authorize !== 'function')
  )
    throw new TypeError(
      'provider, onSelect, getSessionKey and optional authorize must be functions',
    );
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50)
    throw new RangeError('pageSize must be an integer from 1 to 50');
  if (!Number.isInteger(maxAgeMs) || maxAgeMs < 1 || maxAgeMs > 300_000)
    throw new RangeError('maxAgeMs must be an integer from 1 to 300000');

  let pages = new WeakMap<ListSearchPage, PageRecord<T>>();
  let current: PageRecord<T> | undefined;
  let active: AbortController | undefined;
  let epoch = 0;
  let disposed = false;

  function readSessionKey() {
    const key = getSessionKey();
    if (
      key !== null &&
      typeof key !== 'string' &&
      !(typeof key === 'number' && Number.isFinite(key))
    )
      throw new TypeError(
        'Session key must be a string, finite number or null',
      );
    return key;
  }
  function invalidate(): number {
    const generation = ++epoch;
    current = undefined;
    const previous = active;
    active = undefined;
    previous?.abort();
    return generation;
  }
  function checkQuery(query: Query): void {
    if (disposed) throw new ListStopped('disposed');
    if (query.epoch !== epoch) throw new ListStopped('cancelled');
    if (!Object.is(readSessionKey(), query.sessionKey)) invalidate();
    if (disposed) throw new ListStopped('disposed');
    if (query.epoch !== epoch) throw new ListStopped('cancelled');
    if (performance.now() >= query.deadline) throw new ListStopped('expired');
  }

  async function run<R>(
    query: Query,
    parent: CommandExecutionContext | undefined,
    operation: (
      context: CommandExecutionContext,
      wait: <V>(callback: () => V | Promise<V>) => Promise<V>,
    ) => Promise<R>,
  ): Promise<R | ListSearchRejection> {
    const controller = new AbortController();
    active = controller;
    let expired = false;
    let timer: ReturnType<typeof setTimeout>;
    const expireWhenDue = (): void => {
      const remaining = query.deadline - performance.now();
      if (remaining > 0) {
        timer = setTimeout(expireWhenDue, Math.ceil(remaining));
        return;
      }
      expired = true;
      controller.abort();
    };
    timer = setTimeout(
      expireWhenDue,
      Math.ceil(Math.max(0, query.deadline - performance.now())),
    );
    const abortFromParent = () => controller.abort();
    const ensureActive = (): void => {
      checkQuery(query);
      parent?.throwIfStopped();
      // Parent guards are app callbacks and can synchronously invalidate this query.
      if (disposed) throw new ListStopped('disposed');
      if (query.epoch !== epoch) throw new ListStopped('cancelled');
      if (expired || performance.now() >= query.deadline) {
        expired = true;
        controller.abort();
        throw new ListStopped('expired');
      }
      if (controller.signal.aborted) throw new ListStopped('cancelled');
    };
    const context = Object.freeze({
      signal: controller.signal,
      throwIfStopped: ensureActive,
    });
    async function wait<V>(callback: () => V | Promise<V>): Promise<V> {
      const result = await waitForCommandCallback(() => {
        ensureActive();
        return callback();
      }, controller.signal);
      ensureActive();
      if (result === commandCancelled) throw new ListStopped('cancelled');
      return result;
    }
    try {
      if (parent) {
        parent.signal.addEventListener('abort', abortFromParent, {once: true});
        if (parent.signal.aborted) controller.abort();
      }
      ensureActive();
      return await operation(context, wait);
    } catch (error) {
      controller.abort();
      if (error instanceof ListStopped) return {status: error.status};
      throw error;
    } finally {
      clearTimeout(timer);
      parent?.signal.removeEventListener('abort', abortFromParent);
      if (active === controller) active = undefined;
    }
  }

  function snapshotPage(value: ListProviderPage<T>, query: Query) {
    try {
      const {items: rawItems, nextCursor: rawCursor} = value;
      if (!Array.isArray(rawItems))
        throw new TypeError('Provider items must be an array');
      const length = rawItems.length;
      if (!Number.isInteger(length) || length < 0 || length > pageSize)
        throw new TypeError(
          'Provider items must be an array no longer than pageSize',
        );
      const items: ListSearchItem<T>[] = [];
      for (let index = 0; index < length; index++) {
        if (!Object.prototype.hasOwnProperty.call(rawItems, index))
          throw new TypeError(
            'Provider items must not contain missing entries',
          );
        items.push(snapshotListItem<T>(rawItems[index]));
      }
      const ids = new Set<string>();
      for (const item of items) {
        if (ids.has(item.id) || query.ids.has(item.id))
          throw new TypeError(
            'Provider item ids must be unique across a query',
          );
        ids.add(item.id);
      }
      const cursor =
        rawCursor === undefined
          ? undefined
          : listText(rawCursor, 'nextCursor', 2048);
      if (cursor !== undefined && query.cursors.has(cursor))
        throw new TypeError('Provider repeated a pagination cursor');
      return {items, cursor};
    } catch (error) {
      throw new ListSearchError(
        'invalid-provider-result',
        error instanceof Error ? error.message : 'Invalid provider result',
      );
    }
  }

  async function load(
    query: Query,
    action: 'search' | 'next',
    cursor: string | undefined,
    parent?: CommandExecutionContext,
  ): Promise<ListSearchResult> {
    if (query.pageCount >= 100)
      throw new ListSearchError(
        'page-limit',
        'A query may load at most 100 pages; start a narrower search',
      );
    return run(query, parent, async (context, wait) => {
      const permission: ListPermissionRequest = Object.freeze({
        action,
        scope,
        query: query.text,
      });
      if ((await wait(() => authorize?.(permission, context))) !== true)
        return {status: 'denied'} as const;
      const request = Object.freeze({
        scope,
        query: query.text,
        pageSize,
        ...(cursor === undefined ? {} : {cursor}),
      });
      const result = await wait(() => provider(request, context));
      const snapshot = snapshotPage(result, query);
      context.throwIfStopped();
      if ((await wait(() => authorize?.(permission, context))) !== true)
        return {status: 'denied'} as const;
      context.throwIfStopped();
      const page: ListSearchPage = Object.freeze({
        query: query.text,
        choices: Object.freeze(
          snapshot.items.map(({id, label, description}) =>
            Object.freeze({
              id,
              label,
              ...(description === undefined ? {} : {description}),
            }),
          ),
        ),
        hasNextPage: snapshot.cursor !== undefined,
      });
      const record = {query, ...snapshot, used: false};
      for (const item of snapshot.items) query.ids.add(item.id);
      if (snapshot.cursor !== undefined) query.cursors.add(snapshot.cursor);
      query.pageCount += 1;
      pages.set(page, record);
      current = record;
      return {status: 'results', page} as const;
    });
  }

  function checkPage(
    page: ListSearchPage,
  ): PageRecord<T> | ListSearchRejection {
    if (disposed) return {status: 'disposed'};
    const record = pages.get(page);
    if (!record) return {status: 'invalid-page'};
    if (record.used) return {status: 'already-used'};
    if (record !== current || record.query.epoch !== epoch)
      return {status: 'stale'};
    try {
      checkQuery(record.query);
    } catch (error) {
      if (error instanceof ListStopped) return {status: error.status};
      throw error;
    }
    return record;
  }

  return {
    async search(text, parent) {
      if (disposed) return {status: 'disposed'};
      const queryText = listText(text, 'query', 256)
        .trim()
        .replace(/\s+/g, ' ');
      const queryEpoch = invalidate();
      if (disposed) return {status: 'disposed'};
      if (queryEpoch !== epoch) return {status: 'cancelled'};
      const sessionKey = readSessionKey();
      if (disposed) return {status: 'disposed'};
      if (queryEpoch !== epoch) return {status: 'cancelled'};
      const query: Query = {
        text: queryText,
        epoch: queryEpoch,
        sessionKey,
        deadline: performance.now() + maxAgeMs,
        ids: new Set(),
        cursors: new Set(),
        pageCount: 0,
      };
      return load(query, 'search', undefined, parent);
    },
    async next(page, parent) {
      const record = checkPage(page);
      if ('status' in record) return record;
      if (active) return {status: 'busy'};
      if (record.cursor === undefined) return {status: 'end'};
      return load(record.query, 'next', record.cursor, parent);
    },
    async select(page, id, parent) {
      const record = checkPage(page);
      if ('status' in record) return record;
      const key = listId(id);
      const item = record.items.find(value => value.id === key);
      if (!item) return {status: 'not-found'};
      if (active) return {status: 'busy'};
      record.used = true;
      current = undefined;
      return run(record.query, parent, async (context, wait) => {
        const permission: ListPermissionRequest = Object.freeze({
          action: 'select',
          scope,
          query: record.query.text,
          id: key,
        });
        if ((await wait(() => authorize?.(permission, context))) !== true)
          return {status: 'denied'} as const;
        await wait(() => onSelect(item, context));
        return {status: 'selected'} as const;
      });
    },
    cancelAll() {
      invalidate();
    },
    dispose() {
      disposed = true;
      invalidate();
      pages = new WeakMap();
    },
  };
}
