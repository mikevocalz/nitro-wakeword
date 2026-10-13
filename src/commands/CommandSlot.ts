/** Choice slots consume one word; text slots consume the remaining phrase. */
export type CommandSlot =
  | {readonly kind: 'choice'; readonly values: readonly string[]}
  | {
      readonly kind: 'text';
      readonly maxLength: number;
      readonly minLength?: number;
    };

export type CommandSlots = Readonly<Record<string, CommandSlot>>;

export type CommandSlotValues<S extends CommandSlots> = {
  readonly [K in keyof S]: S[K] extends {
    readonly kind: 'choice';
    readonly values: readonly (infer V extends string)[];
  }
    ? V
    : string;
};
