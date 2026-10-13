import type {CommandExecutionContext} from '../commands';
import type {ListSearchItem} from './ListSearchItem';
import type {ListSearchProvider} from './ListSearchProvider';

export type ListPermissionRequest =
  | {
      readonly action: 'search' | 'next';
      readonly scope: string;
      readonly query: string;
    }
  | {
      readonly action: 'select';
      readonly scope: string;
      readonly query: string;
      readonly id: string;
    };

export interface ListSearchOptions<T> {
  readonly scope: string;
  /** Return a unique generation on every account/permission session change. Never reuse keys. */
  readonly getSessionKey: () => string | number | null;
  readonly provider: ListSearchProvider<T>;
  /** Omission denies all operations. Only literal true permits them. */
  readonly authorize?: (
    request: ListPermissionRequest,
    context: CommandExecutionContext,
  ) => boolean | Promise<boolean>;
  /** Revalidate live item permissions, then call context.throwIfStopped before side effects. */
  readonly onSelect: (
    item: ListSearchItem<T>,
    context: CommandExecutionContext,
  ) => void | Promise<void>;
  /** Default 10; integer 1..50. */
  readonly pageSize?: number;
  /** Whole-query lifetime, including pagination/selection. Default 30000; integer 1..300000. */
  readonly maxAgeMs?: number;
}
