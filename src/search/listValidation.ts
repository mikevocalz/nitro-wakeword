import {hasUnsafeCommandText} from '../commands/commandText';
import type {ListSearchItem} from './ListSearchItem';

export function listText(
  value: unknown,
  name: string,
  maxLength: number,
): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > maxLength ||
    hasUnsafeCommandText(value)
  ) {
    throw new TypeError(
      `${name} must be nonblank safe text of at most ${maxLength} characters`,
    );
  }
  return value;
}

export function listId(value: unknown, name = 'id'): string {
  const text = listText(value, name, 256);
  if (text.trim() !== text)
    throw new TypeError(`${name} must not have surrounding whitespace`);
  return text;
}

export function snapshotListItem<T>(
  item: ListSearchItem<T>,
): ListSearchItem<T> {
  if (!item || typeof item !== 'object')
    throw new TypeError('Expected a list item');
  const {id, label, description, value} = item;
  return Object.freeze({
    id: listId(id),
    label: listText(label, 'label', 512),
    ...(description === undefined
      ? {}
      : {description: listText(description, 'description', 1024)}),
    value,
  });
}
