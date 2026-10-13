import type {CommandExecutionContext} from './CommandExecutionContext';
import type {CommandSlots, CommandSlotValues} from './CommandSlot';

export interface CommandDefinition<S extends CommandSlots> {
  readonly id: string;
  readonly patterns: readonly string[];
  readonly slots: S;
  readonly requireConfirmation?: boolean;
  readonly execute: (
    slots: CommandSlotValues<S>,
    context: CommandExecutionContext,
  ) => void | Promise<void>;
}
