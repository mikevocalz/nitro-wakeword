export interface CommandExecutionContext {
  /** App callbacks must observe cancellation before their own side effects. */
  readonly signal: AbortSignal;
}
