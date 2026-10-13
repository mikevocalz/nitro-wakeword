import type {CommandRouter} from '../commands';
import type {ExpoNavigationRouterOptions} from './ExpoNavigationRouterOptions';
import {createNavigationRouter} from './createNavigationRouter';

/**
 * Create guarded static navigation commands. Call cancelAll on session transitions
 * and dispose when the owner closes. A successful dispatch does not prove rendering.
 */
export function createExpoNavigationRouter(
  options: ExpoNavigationRouterOptions,
): CommandRouter {
  const navigate = options.router.navigate.bind(options.router);
  return createNavigationRouter({
    options,
    navigate: target => navigate(target),
    validateTarget: target => {
      // Static segments and route groups only; URLs, encodings and params are not accepted.
      if (
        typeof target !== 'string' ||
        target.length > 256 ||
        (!/^\/(?:[a-zA-Z0-9_-]+|\([a-zA-Z0-9_-]+\))(?:\/(?:[a-zA-Z0-9_-]+|\([a-zA-Z0-9_-]+\)))*$/.test(
          target,
        ) &&
          target !== '/')
      ) {
        throw new TypeError(
          'Expected a static absolute local Expo route without URL, traversal or parameter syntax',
        );
      }
    },
  });
}
