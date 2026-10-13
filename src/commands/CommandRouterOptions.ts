import type {Command} from './Command';
import type {CommandCandidate} from './CommandCandidate';
import type {CommandExecutionContext} from './CommandExecutionContext';

export interface CommandRouterOptions {
  /** Candidate lifetime in milliseconds, 1..300000. Defaults to 30000. */
  readonly maxAgeMs?: number;
  readonly commands: readonly Command[];
  /** Missing authorization denies every dispatch. Only literal true allows it. */
  readonly authorize?: (
    candidate: CommandCandidate,
    context: CommandExecutionContext,
  ) => boolean | Promise<boolean>;
  readonly confirm?: (
    candidate: CommandCandidate,
    context: CommandExecutionContext,
  ) => boolean | Promise<boolean>;
}
