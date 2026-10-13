import type {ListSearchItem} from './ListSearchItem';
import type {ListSearchProvider} from './ListSearchProvider';
import {ListSearchError} from './ListSearchError';
import {listId, listText, snapshotListItem} from './listValidation';

const cursorPrefix = 'list:1:';
const maxItems = 10000;

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function readOffset(
  cursor: string | undefined,
  requestPrefix: string,
  pageSize: number,
): number {
  if (cursor === undefined) return 0;
  const invalid = () =>
    new ListSearchError(
      'invalid-cursor',
      'Cursor does not match this list request',
    );
  if (
    typeof cursor !== 'string' ||
    cursor.length > 2048 ||
    !cursor.startsWith(requestPrefix)
  ) {
    throw invalid();
  }
  const offsetText = cursor.slice(requestPrefix.length);
  const offset = Number(offsetText);
  if (
    !/^[1-9][0-9]{0,4}$/.test(offsetText) ||
    offset > maxItems ||
    offset % pageSize !== 0
  ) {
    throw invalid();
  }
  return offset;
}

/**
 * Creates a {@linkcode ListSearchProvider} over an app-owned list snapshot.
 * Exact labels rank before label prefixes, then matches containing every query
 * term in the label or description. Ties retain the original item order.
 * Matching ignores case and repeated whitespace; it does not use fuzzy matching.
 * Snapshots contain at most 10000 items with unique IDs. Returned arrays and item
 * wrappers are frozen, while values retain their original references.
 *
 * Queries must contain 1..256 safe characters and page sizes must be integers
 * from 1 through 50. Cursors are opaque, bounded pagination state tied to the
 * exact scope, query and page size. They are not authorization tokens. The app
 * must supply only visible items; the scope does not filter the snapshot.
 *
 * @throws {TypeError} For invalid options, items, scopes or queries.
 * @throws {RangeError} For oversized lists or invalid page sizes.
 * @throws {ListSearchError} For malformed or mismatched cursors.
 */
export function createInMemoryListProvider<T>(options: {
  /** Items copied at creation; values remain app-owned and are not deep-cloned. */
  readonly items: readonly ListSearchItem<T>[];
}): ListSearchProvider<T> {
  if (!options || typeof options !== 'object')
    throw new TypeError('Expected list provider options');
  const {items} = options;
  if (!Array.isArray(items)) throw new TypeError('items must be an array');
  const length = items.length;
  if (!Number.isInteger(length) || length < 0 || length > maxItems)
    throw new RangeError(`items must contain 0..${maxItems} entries`);
  const snapshot: {
    item: ListSearchItem<T>;
    label: string;
    description: string;
  }[] = [];
  const ids = new Set<string>();
  for (let index = 0; index < length; index++) {
    if (!Object.prototype.hasOwnProperty.call(items, index))
      throw new TypeError('items must not contain missing entries');
    const copy = snapshotListItem<T>(items[index]);
    if (ids.has(copy.id))
      throw new TypeError(`Duplicate list item id: ${copy.id}`);
    ids.add(copy.id);
    snapshot.push({
      item: copy,
      label: normalize(copy.label),
      description: normalize(copy.description ?? ''),
    });
  }

  return (request, context) => {
    context.throwIfStopped();
    if (!request || typeof request !== 'object')
      throw new TypeError('Expected a list provider request');
    const {scope, query, pageSize, cursor} = request;
    listId(scope, 'scope');
    listText(query, 'query', 256);
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
      throw new RangeError('pageSize must be an integer from 1 through 50');
    }
    const requestPrefix = `${cursorPrefix}${scope.length}:${scope}${query.length}:${query}${pageSize}:`;
    const offset = readOffset(cursor, requestPrefix, pageSize);
    const normalizedQuery = normalize(query);
    const terms = normalizedQuery.split(' ');
    const exact: ListSearchItem<T>[] = [];
    const prefixes: ListSearchItem<T>[] = [];
    const matches: ListSearchItem<T>[] = [];
    for (const {item, label, description} of snapshot) {
      context.throwIfStopped();
      if (label === normalizedQuery) exact.push(item);
      else if (label.startsWith(normalizedQuery)) prefixes.push(item);
      else if (
        terms.every(term => label.includes(term) || description.includes(term))
      ) {
        matches.push(item);
      }
    }
    context.throwIfStopped();
    const ranked = [...exact, ...prefixes, ...matches];
    if (cursor !== undefined && offset >= ranked.length) {
      throw new ListSearchError(
        'invalid-cursor',
        'Cursor is beyond the available results',
      );
    }
    const end = offset + pageSize;
    return Object.freeze({
      items: Object.freeze(ranked.slice(offset, end)),
      ...(end < ranked.length ? {nextCursor: requestPrefix + end} : {}),
    });
  };
}
