export class ListSearchError extends Error {
  constructor(
    readonly code: 'invalid-provider-result' | 'invalid-cursor' | 'page-limit',
    message: string,
  ) {
    super(message);
    this.name = 'ListSearchError';
  }
}
