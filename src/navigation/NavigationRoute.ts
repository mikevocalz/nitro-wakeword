import type {CommandExecutionContext} from '../commands';

/** App-owned registry entry for createExpoNavigationRouter or createReactNavigationRouter. */
export interface NavigationRoute<Target extends string> {
  /** Unique command identity; destinations are never inferred from a transcript. */
  readonly commandId: string;
  /** Exact literal aliases, using the command router's matching rules. */
  readonly patterns: readonly string[];
  /** Static app-owned destination, snapshotted when the adapter is created. */
  readonly target: Target;
  /** Defaults to deny. Must return true using current permissions on every check. */
  readonly authorize?: (
    context: CommandExecutionContext,
  ) => boolean | Promise<boolean>;
  /** Defaults to true; missing confirmation prevents navigation. */
  readonly requireConfirmation?: boolean;
}
