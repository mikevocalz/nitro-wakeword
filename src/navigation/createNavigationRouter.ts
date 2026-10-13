import {createCommandRouter, defineCommand} from '../commands';
import type {CommandExecutionContext, CommandRouter} from '../commands';
import type {NavigationRouterOptions} from './NavigationRouterOptions';
import type {NavigationRoute} from './NavigationRoute';
import {NavigationError} from './NavigationError';

export function createNavigationRouter<Target extends string>({
  options,
  navigate,
  validateTarget,
}: {
  options: NavigationRouterOptions<Target>;
  navigate: (target: Target, context: CommandExecutionContext) => void;
  validateTarget: (target: Target) => void;
}): CommandRouter {
  if (!Array.isArray(options.routes) || options.routes.length > 100)
    throw new RangeError('routes must be an array of at most 100 routes');
  const {getSessionKey, confirm} = options;
  if (
    typeof getSessionKey !== 'function' ||
    (confirm !== undefined && typeof confirm !== 'function')
  )
    throw new TypeError('getSessionKey and optional confirm must be functions');
  const routes = Array.from(options.routes, route => {
    const snapshot = Object.freeze({...route});
    validateTarget(snapshot.target);
    if (
      snapshot.authorize !== undefined &&
      typeof snapshot.authorize !== 'function'
    )
      throw new TypeError('Route authorize must be a function when provided');
    return snapshot;
  });
  const byId = new Map(routes.map(route => [route.commandId, route]));
  function readSessionKey() {
    const key = getSessionKey();
    if (
      key !== null &&
      typeof key !== 'string' &&
      !(typeof key === 'number' && Number.isFinite(key))
    )
      throw new TypeError(
        'Session key must be a string, finite number or null',
      );
    return key;
  }
  let sessionKey = readSessionKey();
  let disposed = false;
  let core: CommandRouter;
  function synchronizeSession(): boolean {
    if (disposed) return false;
    const current = readSessionKey();
    if (!Object.is(current, sessionKey)) {
      sessionKey = current;
      core.cancelAll();
      return false;
    }
    return true;
  }
  async function authorize(
    route: NavigationRoute<Target>,
    context: CommandExecutionContext,
  ): Promise<boolean> {
    if (context.signal.aborted || !synchronizeSession()) return false;
    const allowed = await route.authorize?.(context);
    return !context.signal.aborted && synchronizeSession() && allowed === true;
  }
  core = createCommandRouter({
    commands: routes.map(route =>
      defineCommand({
        id: route.commandId,
        patterns: route.patterns,
        slots: {},
        requireConfirmation: route.requireConfirmation,
        execute: async (_slots, context) => {
          const allowed = await authorize(route, context);
          if (context.signal.aborted || !synchronizeSession()) return;
          if (!allowed) throw new NavigationError('authorization-changed');
          context.throwIfStopped();
          navigate(route.target, context);
        },
      }),
    ),
    maxAgeMs: options.maxAgeMs,
    authorize: (candidate, context) =>
      authorize(byId.get(candidate.commandId)!, context),
    confirm: confirm
      ? (candidate, context) => {
          const route = byId.get(candidate.commandId)!;
          return confirm(
            Object.freeze({commandId: route.commandId, target: route.target}),
            context,
          );
        }
      : undefined,
  });
  return {
    match: text => {
      synchronizeSession();
      return core.match(text);
    },
    dispatch: async candidate => {
      synchronizeSession();
      return core.dispatch(candidate);
    },
    cancelAll: core.cancelAll,
    dispose: () => {
      disposed = true;
      core.dispose();
    },
  };
}
