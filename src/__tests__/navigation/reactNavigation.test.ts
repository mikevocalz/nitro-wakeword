import {TabRouter, CommonActions} from '@react-navigation/routers';
import type {
  CommonNavigationAction,
  NavigationAction,
  ParamListBase,
} from '@react-navigation/routers';
import {createReactNavigationRouter} from '../../navigation/reactNavigation';

it('selects Home using the real React Navigation TabRouter', async () => {
  const tabs = TabRouter({initialRouteName: 'Settings'});
  const routeConfig = {
    routeNames: ['Home', 'Settings'],
    routeParamList: {},
    routeGetIdList: {},
  };
  let state = tabs.getInitialState(routeConfig);
  const actions: unknown[] = [];
  const voice = createReactNavigationRouter<ParamListBase>({
    navigation: {
      getState: () => state,
      dispatch: action => {
        if (typeof action === 'function') throw new Error('Unexpected updater');
        const isNavigate = (
          value: NavigationAction,
        ): value is CommonNavigationAction =>
          value.type === 'NAVIGATE' &&
          value.payload !== undefined &&
          'name' in value.payload &&
          typeof value.payload.name === 'string';
        if (!isNavigate(action)) throw new Error('Expected navigate action');
        expect(action).toEqual(CommonActions.navigate('Home'));
        const next = tabs.getStateForAction(state, action, routeConfig);
        if (!next) throw new Error('Unhandled action');
        state = tabs.getRehydratedState(next, routeConfig);
        actions.push(action);
      },
    },
    getSessionKey: () => 1,
    routes: [
      {
        commandId: 'home',
        patterns: ['open home'],
        target: 'Home',
        authorize: () => true,
        requireConfirmation: false,
      },
    ],
  });
  expect(state.routes[state.index]?.name).toBe('Settings');
  const match = voice.match('open home');
  if (match.status !== 'matched') throw new Error('Expected match');
  expect(await voice.dispatch(match.candidate)).toEqual({status: 'executed'});
  expect(state.routes[state.index]?.name).toBe('Home');
  expect(actions).toHaveLength(1);
});

it('refuses a screen that disappears while confirmation is open', async () => {
  const tabs = TabRouter({});
  let names = ['Home', 'Settings'];
  const dispatch = jest.fn();
  const voice = createReactNavigationRouter<ParamListBase>({
    navigation: {
      getState: () =>
        tabs.getInitialState({
          routeNames: names,
          routeParamList: {},
          routeGetIdList: {},
        }),
      dispatch,
    },
    getSessionKey: () => 1,
    routes: [
      {
        commandId: 'home',
        patterns: ['home'],
        target: 'Home',
        authorize: () => true,
      },
    ],
    confirm: () => {
      names = ['Settings'];
      return true;
    },
  });
  const match = voice.match('home');
  if (match.status !== 'matched') throw new Error('Expected match');
  await expect(voice.dispatch(match.candidate)).rejects.toMatchObject({
    code: 'route-unavailable',
  });
  expect(dispatch).not.toHaveBeenCalled();
});

it('does not dispatch when reading navigator state crosses the deadline', async () => {
  let now = 0;
  const clock = jest.spyOn(performance, 'now').mockImplementation(() => now);
  try {
    const tabs = TabRouter({});
    const dispatch = jest.fn();
    const voice = createReactNavigationRouter<ParamListBase>({
      navigation: {
        getState: () => {
          now = 11;
          return tabs.getInitialState({
            routeNames: ['Home'],
            routeParamList: {},
            routeGetIdList: {},
          });
        },
        dispatch,
      },
      getSessionKey: () => 1,
      maxAgeMs: 10,
      routes: [
        {
          commandId: 'home',
          patterns: ['home'],
          target: 'Home',
          authorize: () => true,
          requireConfirmation: false,
        },
      ],
    });
    const match = voice.match('home');
    if (match.status !== 'matched') throw new Error('Expected match');
    expect(await voice.dispatch(match.candidate)).toEqual({status: 'expired'});
    expect(dispatch).not.toHaveBeenCalled();
  } finally {
    clock.mockRestore();
  }
});
