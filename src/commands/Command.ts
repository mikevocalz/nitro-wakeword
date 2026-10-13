declare const commandBrand: unique symbol;

/** An app-owned definition returned by defineCommand. */
export interface Command {
  readonly id: string;
  readonly [commandBrand]: true;
}
