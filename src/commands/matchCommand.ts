import type {StoredCommand} from './commandStore';

export function matchCommand(command: StoredCommand, words: readonly string[]) {
  const matches = new Map<string, Readonly<Record<string, string>>>();
  for (const pattern of command.patterns) {
    const slots: Record<string, string> = {};
    let consumed = 0;
    const matched = pattern.every(token => {
      const word = words[consumed];
      if (word === undefined) {
        return false;
      }
      consumed += 1;
      if (!token.startsWith(':')) {
        return token.toLowerCase() === word.toLowerCase();
      }
      const name = token.slice(1);
      const slot = command.slots[name];
      if (slot?.kind === 'choice') {
        const choice = slot.values.find(
          value => value.toLowerCase() === word.toLowerCase(),
        );
        if (choice === undefined) {
          return false;
        }
        slots[name] = choice;
        return true;
      }
      if (slot?.kind === 'text') {
        const text = words.slice(consumed - 1).join(' ');
        consumed = words.length;
        if (
          text.length < (slot.minLength ?? 1) ||
          text.length > slot.maxLength
        ) {
          return false;
        }
        slots[name] = text;
        return true;
      }
      return false;
    });
    if (matched && consumed === words.length) {
      const key = JSON.stringify(
        Object.entries(slots).sort(([a], [b]) => a.localeCompare(b)),
      );
      matches.set(key, Object.freeze(slots));
    }
  }
  return [...matches.values()];
}
