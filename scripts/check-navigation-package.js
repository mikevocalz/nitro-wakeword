#!/usr/bin/env node
const assert = require('node:assert/strict');

async function main() {
  const {createExpoNavigationRouter} =
    await import('nitro-wakeword/navigation/expo');
  const {createReactNavigationRouter} =
    await import('nitro-wakeword/navigation/react-navigation');
  const {TabRouter} = await import('@react-navigation/routers');
  const targets = [];
  const expo = createExpoNavigationRouter({
    router: {navigate: target => targets.push(target)},
    getSessionKey: () => 1,
    routes: [
      {
        commandId: 'home',
        patterns: ['home'],
        target: '/',
        authorize: () => true,
        requireConfirmation: false,
      },
    ],
  });
  const tabs = TabRouter({initialRouteName: 'Settings'});
  const config = {
    routeNames: ['Home', 'Settings'],
    routeParamList: {},
    routeGetIdList: {},
  };
  let state = tabs.getInitialState(config);
  const native = createReactNavigationRouter({
    navigation: {
      getState: () => state,
      dispatch: action => {
        const next = tabs.getStateForAction(state, action, config);
        assert.ok(next);
        state = tabs.getRehydratedState(next, config);
      },
    },
    getSessionKey: () => 1,
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
  for (const voice of [expo, native]) {
    const result = voice.match('home');
    assert.equal(result.status, 'matched');
    assert.deepEqual(await voice.dispatch(result.candidate), {
      status: 'executed',
    });
    voice.dispose();
  }
  assert.deepEqual(targets, ['/']);
  assert.equal(state.routes[state.index].name, 'Home');
  process.stdout.write(
    'Built navigation subpaths passed Expo call-boundary and real TabRouter checks.\n',
  );
}

main().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
