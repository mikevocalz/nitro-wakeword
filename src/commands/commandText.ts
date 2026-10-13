export const maxCommandTextLength = 4096;

export function hasUnsafeCommandText(text: string): boolean {
  // Reject control and directional formatting characters before tokenization.
  // eslint-disable-next-line no-control-regex -- Control characters are the rejected input.
  return /[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/.test(
    text,
  );
}
