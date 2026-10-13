import type {CommandCandidate} from './CommandCandidate';

export type CommandMatchResult =
  | {readonly status: 'matched'; readonly candidate: CommandCandidate}
  | {
      readonly status: 'ambiguous';
      readonly matches: readonly CommandCandidate[];
    }
  | {readonly status: 'unmatched'};
