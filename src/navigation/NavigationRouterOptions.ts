import type {CommandExecutionContext} from '../commands';
import type {NavigationRequest} from './NavigationRequest';
import type {NavigationRoute} from './NavigationRoute';

/** Shared guarded-navigation options consumed by the platform router factories. */
export interface NavigationRouterOptions<Target extends string> {
  /** Up to 100 static routes; create a new adapter to change the registry. */
  readonly routes: readonly NavigationRoute<Target>[];
  /** Unique app/session generation; never reuse an old value or supply a credential. */
  readonly getSessionKey: () => string | number | null;
  /** Candidate lifetime, including callbacks; defaults to 30000 ms (range 1–300000). */
  readonly maxAgeMs?: number;
  /** Approve this exact immutable target; observe signal to close cancelled UI. */
  readonly confirm?: (
    request: NavigationRequest<Target>,
    context: CommandExecutionContext,
  ) => boolean | Promise<boolean>;
}
