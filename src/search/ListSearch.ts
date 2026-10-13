import type {CommandExecutionContext} from '../commands';
import type {ListSearchPage} from './ListSearchPage';

export type ListSearchRejection = {
  readonly status:
    | 'denied'
    | 'cancelled'
    | 'expired'
    | 'disposed'
    | 'busy'
    | 'invalid-page'
    | 'stale'
    | 'already-used';
};
export type ListSearchResult =
  | {readonly status: 'results'; readonly page: ListSearchPage}
  | ListSearchRejection;
export type ListNextResult = ListSearchResult | {readonly status: 'end'};
export type ListSelectResult =
  {readonly status: 'selected' | 'not-found'} | ListSearchRejection;

export interface ListSearch {
  /** A valid new query supersedes pending work and invalidates older pages. */
  search(
    query: string,
    context?: CommandExecutionContext,
  ): Promise<ListSearchResult>;
  /** Failed pagination leaves the original page retryable until its query expires. */
  next(
    page: ListSearchPage,
    context?: CommandExecutionContext,
  ): Promise<ListNextResult>;
  /** A valid selection attempt consumes its page, even when denied or cancelled. */
  select(
    page: ListSearchPage,
    id: string,
    context?: CommandExecutionContext,
  ): Promise<ListSelectResult>;
  /** Invalidates all pages; does not undo app side effects already started. */
  cancelAll(): void;
  /** Idempotent. Cancels waiting and prevents future callbacks. */
  dispose(): void;
}
