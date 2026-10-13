import type {CommandRouter} from './CommandRouter';
import type {CommandRouterOptions} from './CommandRouterOptions';
import type {CommandDispatchResult} from './CommandDispatchResult';
import type {StoredCommand} from './commandStore';
import type {CommandCandidate} from './CommandCandidate';
import type {CommandMatchResult} from './CommandMatchResult';
import {commandStore} from './commandStore';
import {matchCommand} from './matchCommand';
import {hasUnsafeCommandText, maxCommandTextLength} from './commandText';
import {
  commandCancelled,
  waitForCommandCallback,
} from './waitForCommandCallback';

class CommandStopped extends Error {
  constructor(readonly status: 'cancelled' | 'expired' | 'disposed') {
    super(`Command ${status}`);
  }
}

export function createCommandRouter(
  options: CommandRouterOptions,
): CommandRouter {
  if (!Array.isArray(options.commands) || options.commands.length > 100) {
    throw new RangeError('commands must be an array of at most 100 commands');
  }
  const ids = new Set<string>();
  const commands = Array.from(options.commands, command => {
    const stored = commandStore.get(command);
    if (!stored) {
      throw new TypeError('Expected a command returned by defineCommand');
    }
    if (ids.has(stored.id))
      throw new TypeError(`Duplicate command id: ${stored.id}`);
    ids.add(stored.id);
    return stored;
  });
  const maxAgeMs = options.maxAgeMs ?? 30_000;
  if (!Number.isInteger(maxAgeMs) || maxAgeMs < 1 || maxAgeMs > 300_000) {
    throw new RangeError('maxAgeMs must be an integer from 1 to 300000');
  }
  const candidates = new WeakMap<
    CommandCandidate,
    {
      command: StoredCommand;
      epoch: number;
      deadline: number;
      used: boolean;
    }
  >();
  const {authorize, confirm} = options;
  if (
    (authorize !== undefined && typeof authorize !== 'function') ||
    (confirm !== undefined && typeof confirm !== 'function')
  ) {
    throw new TypeError(
      'authorize and confirm must be functions when provided',
    );
  }
  let active: AbortController | undefined;
  let epoch = 0;
  let disposed = false;

  function cancelAll(): void {
    epoch += 1;
    active?.abort();
  }

  return {
    cancelAll,
    dispose(): void {
      disposed = true;
      cancelAll();
    },
    async dispatch(
      candidate: CommandCandidate,
    ): Promise<CommandDispatchResult> {
      if (disposed) return {status: 'disposed'};
      const record = candidates.get(candidate);
      if (!record) return {status: 'invalid-candidate'};
      if (record.epoch !== epoch) return {status: 'cancelled'};
      if (record.used) return {status: 'already-dispatched'};
      if (performance.now() >= record.deadline) return {status: 'expired'};
      if (active) return {status: 'busy'};
      record.used = true;
      const controller = new AbortController();
      active = controller;
      const context = Object.freeze({signal: controller.signal});
      let expired = false;
      let timeout: ReturnType<typeof setTimeout>;
      const expireWhenDue = (): void => {
        const remaining = record.deadline - performance.now();
        if (remaining > 0) {
          timeout = setTimeout(expireWhenDue, Math.ceil(remaining));
          return;
        }
        expired = true;
        controller.abort();
      };
      timeout = setTimeout(
        expireWhenDue,
        Math.ceil(Math.max(0, record.deadline - performance.now())),
      );
      const ensureActive = (): void => {
        if (disposed) throw new CommandStopped('disposed');
        if (record.epoch !== epoch) throw new CommandStopped('cancelled');
        if (expired || performance.now() >= record.deadline) {
          expired = true;
          controller.abort();
          throw new CommandStopped('expired');
        }
        if (controller.signal.aborted) throw new CommandStopped('cancelled');
      };
      async function wait<T>(callback: () => T | Promise<T>): Promise<T> {
        const result = await waitForCommandCallback(() => {
          ensureActive();
          return callback();
        }, controller.signal);
        ensureActive();
        if (result === commandCancelled) throw new CommandStopped('cancelled');
        return result;
      }
      try {
        const allowed = await wait(() => authorize?.(candidate, context));
        ensureActive();
        if (allowed !== true) return {status: 'denied'};
        if (record.command.requireConfirmation) {
          if (!confirm) return {status: 'confirmation-required'};
          const confirmed = await wait(() => confirm(candidate, context));
          ensureActive();
          if (confirmed !== true) return {status: 'declined'};
          const stillAllowed = await wait(() =>
            authorize?.(candidate, context),
          );
          ensureActive();
          if (stillAllowed !== true) return {status: 'denied'};
        }
        await wait(() => record.command.execute(candidate.slots, context));
        ensureActive();
        return {status: 'executed'};
      } catch (error) {
        if (error instanceof CommandStopped) return {status: error.status};
        throw error;
      } finally {
        clearTimeout(timeout);
        active = undefined;
      }
    },
    match(utterance: string): CommandMatchResult {
      if (disposed) throw new Error('Command router is disposed');
      if (typeof utterance !== 'string')
        throw new TypeError('utterance must be a string');
      if (
        utterance.length > maxCommandTextLength ||
        hasUnsafeCommandText(utterance) ||
        !utterance.trim()
      )
        return {status: 'unmatched'};
      const words = utterance.trim().split(/\s+/);
      const matches: {candidate: CommandCandidate; command: StoredCommand}[] =
        [];
      for (const command of commands) {
        for (const slots of matchCommand(command, words)) {
          matches.push({
            candidate: Object.freeze({
              commandId: command.id,
              slots,
              match: 'exact',
            }),
            command,
          });
        }
      }
      if (matches.length > 1) {
        return {
          status: 'ambiguous',
          matches: Object.freeze(matches.map(match => match.candidate)),
        };
      }
      const match = matches[0];
      if (!match) return {status: 'unmatched'};
      candidates.set(match.candidate, {
        command: match.command,
        epoch,
        deadline: performance.now() + maxAgeMs,
        used: false,
      });
      return {status: 'matched', candidate: match.candidate};
    },
  };
}
