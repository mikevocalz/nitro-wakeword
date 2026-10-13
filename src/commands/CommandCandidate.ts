/** Exact pattern match, not a speech-recognition probability or authorization. */
export interface CommandCandidate {
  readonly commandId: string;
  readonly slots: Readonly<Record<string, string>>;
  readonly match: 'exact';
}
