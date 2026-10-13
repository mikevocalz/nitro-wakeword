export const commandCancelled = Symbol('command-cancelled');

/** Stops waiting even if an app callback ignores the cancellation signal. */
export async function waitForCommandCallback<T>(
  callback: () => T | Promise<T>,
  signal: AbortSignal,
): Promise<T | typeof commandCancelled> {
  if (signal.aborted) {
    return commandCancelled;
  }
  let onAbort = () => {};
  const cancelled = new Promise<typeof commandCancelled>(resolve => {
    onAbort = () => resolve(commandCancelled);
    signal.addEventListener('abort', onAbort, {once: true});
  });
  try {
    const result = await Promise.race([Promise.resolve(callback()), cancelled]);
    return signal.aborted ? commandCancelled : result;
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
