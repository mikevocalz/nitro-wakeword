import {createExpoNavigationRouter} from '../../navigation/expo';

it('navigates only to the configured local Home destination', async () => {
  const navigate = jest.fn();
  const router = createExpoNavigationRouter({
    router: {navigate},
    getSessionKey: () => 1,
    routes: [
      {
        commandId: 'open-home',
        patterns: ['open home'],
        target: '/(tabs)/home',
        authorize: () => true,
        requireConfirmation: false,
      },
    ],
  });
  const match = router.match('open home');
  if (match.status !== 'matched') throw new Error('Expected match');
  expect(await router.dispatch(match.candidate)).toEqual({status: 'executed'});
  expect(navigate).toHaveBeenCalledWith('/(tabs)/home');
  expect(router.match('open https://example.com')).toEqual({
    status: 'unmatched',
  });
  router.dispose();
});

it.each([
  'https://example.com',
  '//example.com',
  '/\\example.com',
  '/../admin',
  '/home/../admin',
  '/%2e%2e/admin',
  '/%2f%2fevil',
  '/home?redirect=https://evil',
  '/home#section',
  '/[id]',
  '/home\u061c',
])('rejects unsafe or unsupported Expo target %s', target => {
  expect(() =>
    createExpoNavigationRouter({
      router: {navigate: jest.fn()},
      getSessionKey: () => 1,
      routes: [
        {commandId: 'open', patterns: ['open home'], target: target as never},
      ],
    }),
  ).toThrow();
});

it('rechecks route permission at execution and refuses a late revocation', async () => {
  const navigate = jest.fn();
  const authorize = jest
    .fn()
    .mockReturnValueOnce(true)
    .mockReturnValueOnce(false);
  const router = createExpoNavigationRouter({
    router: {navigate},
    getSessionKey: () => 1,
    routes: [
      {
        commandId: 'home',
        patterns: ['open home'],
        target: '/',
        authorize,
        requireConfirmation: false,
      },
    ],
  });
  const match = router.match('open home');
  if (match.status !== 'matched') throw new Error('Expected match');
  await expect(router.dispatch(match.candidate)).rejects.toThrow(
    'authorization',
  );
  expect(navigate).not.toHaveBeenCalled();
});

it('cancels confirmation when the current app session changes', async () => {
  let key = 'first';
  let enter!: () => void;
  let confirm!: (approved: boolean) => void;
  const entered = new Promise<void>(resolve => {
    enter = resolve;
  });
  const navigate = jest.fn();
  const router = createExpoNavigationRouter({
    router: {navigate},
    getSessionKey: () => key,
    routes: [
      {
        commandId: 'home',
        patterns: ['open home'],
        target: '/',
        authorize: () => true,
      },
    ],
    confirm: () => {
      enter();
      return new Promise<boolean>(resolve => {
        confirm = resolve;
      });
    },
  });
  const match = router.match('open home');
  if (match.status !== 'matched') throw new Error('Expected match');
  const pending = router.dispatch(match.candidate);
  await entered;
  key = 'second';
  confirm(true);
  expect(await pending).toEqual({status: 'cancelled'});
  expect(navigate).not.toHaveBeenCalled();
});

it('does not call app callbacks after disposal or after an ignored guard resolves late', async () => {
  let allow!: (value: boolean) => void;
  const getSessionKey = jest.fn(() => 1);
  const navigate = jest.fn();
  const router = createExpoNavigationRouter({
    router: {navigate},
    getSessionKey,
    routes: [
      {
        commandId: 'home',
        patterns: ['open home'],
        target: '/',
        authorize: () =>
          new Promise<boolean>(resolve => {
            allow = resolve;
          }),
        requireConfirmation: false,
      },
    ],
  });
  const match = router.match('open home');
  if (match.status !== 'matched') throw new Error('Expected match');
  const pending = router.dispatch(match.candidate);
  router.dispose();
  expect(await pending).toEqual({status: 'disposed'});
  getSessionKey.mockClear();
  allow(true);
  await Promise.resolve();
  expect(() => router.match('open home')).toThrow('disposed');
  expect(await router.dispatch(match.candidate)).toEqual({status: 'disposed'});
  expect(getSessionKey).not.toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalled();
});

it('denies an unguarded route without presenting confirmation or navigating', async () => {
  const navigate = jest.fn();
  const confirm = jest.fn(() => true);
  const router = createExpoNavigationRouter({
    router: {navigate},
    getSessionKey: () => 1,
    confirm,
    routes: [{commandId: 'home', patterns: ['home'], target: '/'}],
  });
  const match = router.match('home');
  if (match.status !== 'matched') throw new Error('Expected match');
  expect(navigate).not.toHaveBeenCalled();
  expect(await router.dispatch(match.candidate)).toEqual({status: 'denied'});
  expect(confirm).not.toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalled();
});

it('binds confirmation to the snapshotted destination and rejects replay', async () => {
  const navigate = jest.fn();
  const route = {
    commandId: 'home',
    patterns: ['home'],
    target: '/' as const,
    authorize: () => true,
  };
  const confirm = jest.fn(request => {
    expect(Object.isFrozen(request)).toBe(true);
    expect(request).toEqual({commandId: 'home', target: '/'});
    return true;
  });
  const options = {
    router: {navigate},
    getSessionKey: () => 1,
    confirm,
    routes: [route],
  };
  const router = createExpoNavigationRouter(options);
  route.patterns[0] = 'admin';
  Object.assign(route, {target: '/admin', authorize: () => false});
  Object.assign(options, {confirm: () => false});
  const match = router.match('home');
  if (match.status !== 'matched') throw new Error('Expected match');
  expect(await router.dispatch(match.candidate)).toEqual({status: 'executed'});
  expect(navigate).toHaveBeenCalledWith('/');
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(await router.dispatch(match.candidate)).toEqual({
    status: 'already-dispatched',
  });
  expect(navigate).toHaveBeenCalledTimes(1);
});

it('invalidates old candidates before dispatch when the app session changes', async () => {
  let key = 1;
  const navigate = jest.fn();
  const router = createExpoNavigationRouter({
    router: {navigate},
    getSessionKey: () => key,
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
  const old = router.match('home');
  if (old.status !== 'matched') throw new Error('Expected match');
  key++;
  expect(await router.dispatch(old.candidate)).toEqual({status: 'cancelled'});
  expect(navigate).not.toHaveBeenCalled();
  const fresh = router.match('home');
  if (fresh.status !== 'matched') throw new Error('Expected match');
  expect(await router.dispatch(fresh.candidate)).toEqual({status: 'executed'});
});

it('checks the session again after an asynchronous final execution guard', async () => {
  let key = 1;
  let allow!: (value: boolean) => void;
  let enter!: () => void;
  const entered = new Promise<void>(resolve => {
    enter = resolve;
  });
  const authorize = jest
    .fn()
    .mockReturnValueOnce(true)
    .mockImplementationOnce(() => {
      enter();
      return new Promise<boolean>(resolve => {
        allow = resolve;
      });
    });
  const navigate = jest.fn();
  const router = createExpoNavigationRouter({
    router: {navigate},
    getSessionKey: () => key,
    routes: [
      {
        commandId: 'home',
        patterns: ['home'],
        target: '/',
        authorize,
        requireConfirmation: false,
      },
    ],
  });
  const match = router.match('home');
  if (match.status !== 'matched') throw new Error('Expected match');
  const pending = router.dispatch(match.candidate);
  await entered;
  key++;
  allow(true);
  expect(await pending).toEqual({status: 'cancelled'});
  expect(navigate).not.toHaveBeenCalled();
});

it('aborts an interrupted confirmation and ignores its late acceptance', async () => {
  let accept!: (value: boolean) => void;
  let enter!: () => void;
  let signal!: AbortSignal;
  const entered = new Promise<void>(resolve => {
    enter = resolve;
  });
  const navigate = jest.fn();
  const router = createExpoNavigationRouter({
    router: {navigate},
    getSessionKey: () => 1,
    routes: [
      {
        commandId: 'home',
        patterns: ['home'],
        target: '/',
        authorize: () => true,
      },
    ],
    confirm: (_request, context) => {
      signal = context.signal;
      enter();
      return new Promise<boolean>(resolve => {
        accept = resolve;
      });
    },
  });
  const match = router.match('home');
  if (match.status !== 'matched') throw new Error('Expected match');
  const pending = router.dispatch(match.candidate);
  await entered;
  router.cancelAll();
  expect(await pending).toEqual({status: 'cancelled'});
  expect(signal.aborted).toBe(true);
  accept(true);
  await Promise.resolve();
  expect(navigate).not.toHaveBeenCalled();
});

it('propagates guard errors without navigation', async () => {
  const navigate = jest.fn();
  const router = createExpoNavigationRouter({
    router: {navigate},
    getSessionKey: () => null,
    routes: [
      {
        commandId: 'home',
        patterns: ['home'],
        target: '/',
        authorize: () => {
          throw new Error('Session unavailable');
        },
      },
    ],
  });
  const match = router.match('home');
  if (match.status !== 'matched') throw new Error('Expected match');
  await expect(router.dispatch(match.candidate)).rejects.toThrow(
    'Session unavailable',
  );
  expect(navigate).not.toHaveBeenCalled();
});

it('rejects sparse routes, duplicate command IDs and invalid session keys', () => {
  const options = {
    router: {navigate: jest.fn()},
    getSessionKey: () => 1,
    routes: [{commandId: 'home', patterns: ['home'], target: '/' as const}],
  };
  expect(() =>
    createExpoNavigationRouter({...options, routes: new Array(1)}),
  ).toThrow();
  expect(() =>
    createExpoNavigationRouter({
      ...options,
      routes: [...options.routes, ...options.routes],
    }),
  ).toThrow('Duplicate');
  expect(() =>
    createExpoNavigationRouter({...options, getSessionKey: () => NaN}),
  ).toThrow('Session key');
});

it('validates the same destination snapshot that it later navigates to', async () => {
  let reads = 0;
  const navigate = jest.fn();
  const router = createExpoNavigationRouter({
    router: {navigate},
    getSessionKey: () => 1,
    routes: [
      {
        commandId: 'home',
        patterns: ['home'],
        get target(): '/' {
          reads++;
          return (reads === 1 ? '/' : '//external.example') as '/';
        },
        authorize: () => true,
        requireConfirmation: false,
      },
    ],
  });
  const match = router.match('home');
  if (match.status !== 'matched') throw new Error('Expected match');
  expect(await router.dispatch(match.candidate)).toEqual({status: 'executed'});
  expect(navigate).toHaveBeenCalledWith('/');
  expect(reads).toBe(1);
});

it('does not navigate when the final guard crosses expiry before the timer runs', async () => {
  let now = 0;
  const clock = jest.spyOn(performance, 'now').mockImplementation(() => now);
  try {
    const navigate = jest.fn();
    const authorize = jest
      .fn()
      .mockReturnValueOnce(true)
      .mockImplementationOnce(() => {
        now = 11;
        return true;
      });
    const router = createExpoNavigationRouter({
      router: {navigate},
      getSessionKey: () => 1,
      maxAgeMs: 10,
      routes: [
        {
          commandId: 'home',
          patterns: ['home'],
          target: '/',
          authorize,
          requireConfirmation: false,
        },
      ],
    });
    const match = router.match('home');
    if (match.status !== 'matched') throw new Error('Expected match');
    expect(await router.dispatch(match.candidate)).toEqual({status: 'expired'});
    expect(navigate).not.toHaveBeenCalled();
  } finally {
    clock.mockRestore();
  }
});
