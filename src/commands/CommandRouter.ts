import type {CommandCandidate} from './CommandCandidate';
import type {CommandDispatchResult} from './CommandDispatchResult';
import type {CommandMatchResult} from './CommandMatchResult';

export interface CommandRouter {
  /** Matching never authorizes or executes an action. */
  match(utterance: string): CommandMatchResult;
  /** A candidate is one-shot and belongs to the router that matched it. */
  dispatch(candidate: CommandCandidate): Promise<CommandDispatchResult>;
  /** Invalidate every existing candidate and interrupt pending callbacks. */
  cancelAll(): void;
  /** Terminal, idempotent cleanup. */
  dispose(): void;
}
