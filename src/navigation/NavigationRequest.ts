/** Exact immutable destination presented to the app's confirmation callback. */
export interface NavigationRequest<Target extends string> {
  readonly commandId: string;
  readonly target: Target;
}
