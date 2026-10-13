export interface ListSearchChoice {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
}

/** Pass this exact object to next/select; copied or older pages are rejected. */
export interface ListSearchPage {
  readonly query: string;
  readonly choices: readonly ListSearchChoice[];
  readonly hasNextPage: boolean;
}
