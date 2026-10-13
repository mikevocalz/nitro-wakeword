import type {Command} from './Command';
import type {CommandDefinition} from './CommandDefinition';
import type {CommandSlots, CommandSlotValues} from './CommandSlot';
import {commandStore} from './commandStore';
import {compileCommandPatterns, snapshotSlots} from './compileCommandPatterns';

export function defineCommand<const S extends CommandSlots>(
  definition: CommandDefinition<S>,
): Command {
  const {id, execute, requireConfirmation = true} = definition;
  if (typeof id !== 'string' || !/^[a-z][a-z0-9.-]{0,63}$/.test(id)) {
    throw new TypeError(
      'Command id must be 1..64 lowercase letters, digits, dots or hyphens, starting with a letter',
    );
  }
  if (
    typeof execute !== 'function' ||
    typeof requireConfirmation !== 'boolean'
  ) {
    throw new TypeError(
      'Command execute must be a function and requireConfirmation must be a boolean',
    );
  }
  const slots = snapshotSlots(definition.slots);
  const patterns = compileCommandPatterns(definition.patterns, slots);
  const command = Object.freeze({id}) as Command;
  commandStore.set(command, {
    id,
    patterns,
    slots,
    requireConfirmation,
    // All values passed here were checked against this immutable slot schema.
    execute: (values, context) =>
      execute(values as CommandSlotValues<S>, context),
  });
  return command;
}
