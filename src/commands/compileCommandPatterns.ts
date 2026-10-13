import type {CommandSlot, CommandSlots} from './CommandSlot';
import {hasUnsafeCommandText, maxCommandTextLength} from './commandText';

export function snapshotSlots(schema: CommandSlots): CommandSlots {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new TypeError('slots must be an object');
  }
  const entries = Object.entries(schema);
  if (entries.length > 8)
    throw new RangeError('A command supports at most 8 slots');
  const result: [string, CommandSlot][] = [];
  for (const [name, slot] of entries) {
    if (!/^[a-zA-Z][a-zA-Z0-9]{0,31}$/.test(name) || !slot) {
      throw new TypeError(`Invalid slot: ${name}`);
    }
    if (slot.kind === 'choice') {
      if (
        !Array.isArray(slot.values) ||
        slot.values.length < 1 ||
        slot.values.length > 64
      ) {
        throw new RangeError(`Choice slot ${name} needs 1..64 values`);
      }
      const seen = new Set<string>();
      const values = Array.from(slot.values, value => {
        if (
          typeof value !== 'string' ||
          value.length < 1 ||
          value.length > 64 ||
          /\s/.test(value) ||
          hasUnsafeCommandText(value)
        ) {
          throw new TypeError(
            `Choice slot ${name} values must be single words of 1..64 characters`,
          );
        }
        const key = value.toLowerCase();
        if (seen.has(key))
          throw new TypeError(`Duplicate choice in slot ${name}`);
        seen.add(key);
        return value;
      });
      result.push([
        name,
        Object.freeze({kind: 'choice', values: Object.freeze(values)}),
      ]);
    } else if (slot.kind === 'text') {
      const minLength = slot.minLength ?? 1;
      if (
        !Number.isInteger(minLength) ||
        !Number.isInteger(slot.maxLength) ||
        minLength < 1 ||
        slot.maxLength < minLength ||
        slot.maxLength > maxCommandTextLength
      ) {
        throw new RangeError(
          `Text slot ${name} needs 1 <= minLength <= maxLength <= 4096`,
        );
      }
      result.push([
        name,
        Object.freeze({kind: 'text', minLength, maxLength: slot.maxLength}),
      ]);
    } else {
      throw new TypeError(`Unknown slot kind for ${name}`);
    }
  }
  return Object.freeze(Object.fromEntries(result));
}

export function compileCommandPatterns(
  patterns: readonly string[],
  slots: CommandSlots,
): readonly (readonly string[])[] {
  if (!Array.isArray(patterns) || patterns.length < 1 || patterns.length > 32) {
    throw new RangeError('A command needs 1..32 patterns');
  }
  return Object.freeze(
    Array.from(patterns, pattern => {
      if (
        typeof pattern !== 'string' ||
        !pattern.trim() ||
        pattern.length > 256 ||
        hasUnsafeCommandText(pattern)
      ) {
        throw new TypeError(
          'Patterns must contain 1..256 characters without control characters',
        );
      }
      const tokens = pattern.trim().split(/\s+/);
      const seen = new Set<string>();
      tokens.forEach((token, index) => {
        if (!token.startsWith(':')) return;
        const name = token.slice(1);
        if (!Object.hasOwn(slots, name) || seen.has(name)) {
          throw new TypeError(`Unknown or repeated pattern slot: ${name}`);
        }
        seen.add(name);
        if (slots[name]?.kind === 'text' && index !== tokens.length - 1) {
          throw new TypeError('A text slot must be the last pattern token');
        }
      });
      if (seen.size !== Object.keys(slots).length) {
        throw new TypeError(
          'Each pattern must contain every declared slot exactly once',
        );
      }
      return Object.freeze(tokens);
    }),
  );
}
