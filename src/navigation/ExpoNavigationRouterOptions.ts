import type {Href, ImperativeRouter} from 'expo-router';
import type {NavigationRouterOptions} from './NavigationRouterOptions';

/** Parameter-free, absolute app paths. Runtime validation rejects URL/traversal syntax. */
export type ExpoNavigationTarget = Extract<Href, string> & `/${string}`;

/** Configuration for createExpoNavigationRouter using the app's Expo router. */
export interface ExpoNavigationRouterOptions extends NavigationRouterOptions<ExpoNavigationTarget> {
  readonly router: Pick<ImperativeRouter, 'navigate'>;
}
