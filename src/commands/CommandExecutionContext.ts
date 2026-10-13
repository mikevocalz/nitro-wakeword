export interface CommandExecutionContext {
  /** App callbacks must observe cancellation before their own side effects. */
  readonly signal: AbortSignal;
  /** Check cancellation, disposal and the monotonic deadline before a side effect. */
  readonly throwIfStopped: () => void;
}
