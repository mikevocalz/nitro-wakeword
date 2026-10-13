/** Navigation failed after matching; inspect code for permission or route changes. */
export class NavigationError extends Error {
  constructor(readonly code: 'authorization-changed' | 'route-unavailable') {
    super(
      code === 'authorization-changed'
        ? 'Navigation authorization was denied before execution'
        : 'Navigation target is not registered in the current navigator',
    );
    this.name = 'NavigationError';
  }
}
