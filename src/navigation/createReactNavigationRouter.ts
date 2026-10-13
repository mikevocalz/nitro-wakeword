import type {ParamListBase} from '@react-navigation/native';
import {CommonActions} from '@react-navigation/routers';
import type {CommandRouter} from '../commands';
import {createNavigationRouter} from './createNavigationRouter';
import type {ReactNavigationRouterOptions} from './ReactNavigationRouterOptions';
import {NavigationError} from './NavigationError';

/**
 * Create guarded static navigation commands. Call cancelAll on session transitions
 * and dispose when the owner closes. A successful dispatch does not prove rendering.
 */
export function createReactNavigationRouter<Params extends ParamListBase>(
  options: ReactNavigationRouterOptions<Params>,
): CommandRouter {
  const dispatch = options.navigation.dispatch.bind(options.navigation);
  const getState = options.navigation.getState.bind(options.navigation);
  return createNavigationRouter({
    options,
    navigate: (target, context) => {
      if (!getState().routeNames.includes(target))
        throw new NavigationError('route-unavailable');
      context.throwIfStopped();
      dispatch(CommonActions.navigate(target));
    },
    validateTarget: target => {
      if (
        typeof target !== 'string' ||
        target.trim() !== target ||
        !/^[a-zA-Z][a-zA-Z0-9 _-]{0,127}$/.test(target)
      ) {
        throw new TypeError(
          'Expected a static registered screen name without URL or parameter syntax',
        );
      }
    },
  });
}
