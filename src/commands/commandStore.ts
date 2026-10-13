import type {CommandExecutionContext} from './CommandExecutionContext';
import type {Command} from './Command';
import type {CommandSlot} from './CommandSlot';

export interface StoredCommand {
  readonly id: string;
  readonly patterns: readonly (readonly string[])[];
  readonly slots: Readonly<Record<string, CommandSlot>>;
  readonly requireConfirmation: boolean;
  readonly execute: (
    slots: Readonly<Record<string, string>>,
    context: CommandExecutionContext,
  ) => void | Promise<void>;
}

export const commandStore = new WeakMap<Command, StoredCommand>();
