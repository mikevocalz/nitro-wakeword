import type {CommandExecutionContext} from '../commands';
import type {ListSearchItem} from './ListSearchItem';

export interface ListProviderRequest {
  readonly scope: string;
  readonly query: string;
  readonly pageSize: number;
  readonly cursor?: string;
}

export interface ListProviderPage<T> {
  readonly items: readonly ListSearchItem<T>[];
  readonly nextCursor?: string;
}

/** Providers own row visibility and global ordering across pages. */
export type ListSearchProvider<T> = (
  request: ListProviderRequest,
  context: CommandExecutionContext,
) => ListProviderPage<T> | Promise<ListProviderPage<T>>;
