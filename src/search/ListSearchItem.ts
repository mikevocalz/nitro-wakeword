export interface ListSearchItem<T> {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  /** App-owned data, kept out of public result pages; not deep-cloned. */
  readonly value: T;
}
