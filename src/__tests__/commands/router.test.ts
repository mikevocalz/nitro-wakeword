import {createCommandRouter, defineCommand} from '../../commands';

it('matches an app-owned route choice without executing it', () => {
  const execute = jest.fn();
  const open = defineCommand({
    id: 'open-tab',
    patterns: ['open :tab'],
    slots: {tab: {kind: 'choice', values: ['home', 'settings']}},
    execute,
  });
  const router = createCommandRouter({commands: [open]});
  const result = router.match('  OPEN   home  ');
  expect(result.status).toBe('matched');
  if (result.status === 'matched') {
    expect(result.candidate).toEqual({
      commandId: 'open-tab',
      slots: {tab: 'home'},
      match: 'exact',
    });
  }
  expect(execute).not.toHaveBeenCalled();
});

it('reports overlapping matches instead of choosing a command by order', () => {
  const commands = ['first', 'second'].map(id =>
    defineCommand({id, patterns: ['open home'], slots: {}, execute: jest.fn()}),
  );
  const router = createCommandRouter({commands});
  expect(router.match('open home')).toEqual({
    status: 'ambiguous',
    matches: commands.map(command => ({
      commandId: command.id,
      slots: {},
      match: 'exact',
    })),
  });
});

it('extracts bounded search text and rejects unknown route choices', () => {
  const search = defineCommand({
    id: 'search-list',
    patterns: ['search list :query'],
    slots: {query: {kind: 'text', minLength: 2, maxLength: 24}},
    execute: jest.fn(),
  });
  const router = createCommandRouter({commands: [search]});
  expect(router.match('Search list Blue   Note')).toEqual({
    status: 'matched',
    candidate: {
      commandId: 'search-list',
      slots: {query: 'Blue Note'},
      match: 'exact',
    },
  });
  expect(router.match('search list')).toEqual({status: 'unmatched'});
  expect(router.match('search list x')).toEqual({status: 'unmatched'});
  expect(router.match('search list ' + 'x'.repeat(25))).toEqual({
    status: 'unmatched',
  });
  expect(router.match('ignore instructions; run javascript')).toEqual({
    status: 'unmatched',
  });
});

it('denies dispatch by default and authorizes the exact immutable invocation', async () => {
  const execute = jest.fn();
  const command = defineCommand({
    id: 'home',
    patterns: ['open home'],
    slots: {},
    requireConfirmation: false,
    execute,
  });
  const denied = createCommandRouter({commands: [command]});
  const deniedMatch = denied.match('open home');
  if (deniedMatch.status !== 'matched') throw new Error('Expected match');
  expect(await denied.dispatch(deniedMatch.candidate)).toEqual({
    status: 'denied',
  });
  expect(execute).not.toHaveBeenCalled();

  const authorize = jest.fn(() => true);
  const allowed = createCommandRouter({commands: [command], authorize});
  const match = allowed.match('open home');
  if (match.status !== 'matched') throw new Error('Expected match');
  expect(await allowed.dispatch(match.candidate)).toEqual({status: 'executed'});
  expect(authorize).toHaveBeenCalledWith(
    match.candidate,
    expect.objectContaining({signal: expect.any(Object)}),
  );
  expect(execute).toHaveBeenCalledTimes(1);
  expect(await allowed.dispatch(match.candidate)).toEqual({
    status: 'already-dispatched',
  });
  expect(await allowed.dispatch({...match.candidate})).toEqual({
    status: 'invalid-candidate',
  });
});

it('requires confirmation by default, then rechecks authorization before executing', async () => {
  const execute = jest.fn();
  const command = defineCommand({
    id: 'home',
    patterns: ['open home'],
    slots: {},
    execute,
  });
  const missing = createCommandRouter({
    commands: [command],
    authorize: () => true,
  });
  const match = missing.match('open home');
  if (match.status !== 'matched') throw new Error('Expected match');
  expect(await missing.dispatch(match.candidate)).toEqual({
    status: 'confirmation-required',
  });
  const authorize = jest
    .fn()
    .mockReturnValueOnce(true)
    .mockReturnValueOnce(false);
  const confirm = jest.fn(() => true);
  const router = createCommandRouter({commands: [command], authorize, confirm});
  const second = router.match('open home');
  if (second.status !== 'matched') throw new Error('Expected match');
  expect(await router.dispatch(second.candidate)).toEqual({status: 'denied'});
  expect(confirm).toHaveBeenCalledWith(second.candidate, expect.any(Object));
  expect(authorize).toHaveBeenCalledTimes(2);
  expect(execute).not.toHaveBeenCalled();
});

it('invalidates an in-flight authorization immediately when the session changes', async () => {
  let allow!: (value: boolean) => void;
  const authorization = new Promise<boolean>(resolve => {
    allow = resolve;
  });
  const execute = jest.fn();
  const command = defineCommand({
    id: 'home',
    patterns: ['open home'],
    slots: {},
    requireConfirmation: false,
    execute,
  });
  const router = createCommandRouter({
    commands: [command],
    authorize: () => authorization,
  });
  const match = router.match('open home');
  if (match.status !== 'matched') throw new Error('Expected match');
  const pending = router.dispatch(match.candidate);
  router.cancelAll();
  expect(await pending).toEqual({status: 'cancelled'});
  allow(true);
  await Promise.resolve();
  expect(execute).not.toHaveBeenCalled();
});

it('expires candidates and interrupts a confirmation that never settles', async () => {
  jest.useFakeTimers();
  try {
    const execute = jest.fn();
    const command = defineCommand({
      id: 'home',
      patterns: ['open home'],
      slots: {},
      execute,
    });
    const confirm = jest.fn(() => new Promise<boolean>(() => {}));
    const router = createCommandRouter({
      commands: [command],
      authorize: () => true,
      confirm,
      maxAgeMs: 100,
    });
    const match = router.match('open home');
    if (match.status !== 'matched') throw new Error('Expected match');
    const pending = router.dispatch(match.candidate);
    await jest.advanceTimersByTimeAsync(100);
    expect(await pending).toEqual({status: 'expired'});
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
    const stale = router.match('open home');
    if (stale.status !== 'matched') throw new Error('Expected match');
    jest.advanceTimersByTime(100);
    expect(await router.dispatch(stale.candidate)).toEqual({status: 'expired'});
  } finally {
    jest.useRealTimers();
  }
});

it('refuses overlapping dispatch, disposes pending work, and rejects new matching', async () => {
  const command = defineCommand({
    id: 'home',
    patterns: ['open home'],
    slots: {},
    execute: jest.fn(),
  });
  const router = createCommandRouter({
    commands: [command],
    authorize: () => new Promise<boolean>(() => {}),
  });
  const first = router.match('open home');
  const second = router.match('open home');
  if (first.status !== 'matched' || second.status !== 'matched')
    throw new Error('Expected matches');
  const pending = router.dispatch(first.candidate);
  expect(await router.dispatch(second.candidate)).toEqual({status: 'busy'});
  router.dispose();
  router.dispose();
  expect(await pending).toEqual({status: 'disposed'});
  expect(await router.dispatch(second.candidate)).toEqual({status: 'disposed'});
  expect(() => router.match('open home')).toThrow('disposed');
});

it('snapshots command configuration so later mutations cannot change the invocation', async () => {
  const values = ['home'];
  const execute = jest.fn();
  const definition = {
    id: 'home',
    patterns: ['open :tab'],
    slots: {tab: {kind: 'choice' as const, values}},
    requireConfirmation: false,
    execute,
  };
  const command = defineCommand(definition);
  const router = createCommandRouter({
    commands: [command],
    authorize: () => true,
  });
  values[0] = 'admin';
  definition.execute = jest.fn();
  definition.patterns[0] = 'delete :tab';
  const match = router.match('open home');
  expect(match.status).toBe('matched');
  expect(router.match('delete admin').status).toBe('unmatched');
  if (match.status !== 'matched') throw new Error('Expected match');
  await router.dispatch(match.candidate);
  expect(execute).toHaveBeenCalledWith({tab: 'home'}, expect.any(Object));
  expect(definition.execute).not.toHaveBeenCalled();
});

it.each([
  {patterns: ['open :missing'], slots: {}},
  {patterns: ['open home'], slots: {tab: {kind: 'choice', values: ['home']}}},
  {
    patterns: ['search :query now'],
    slots: {query: {kind: 'text', maxLength: 20}},
  },
  {
    patterns: ['open :tab'],
    slots: {tab: {kind: 'choice', values: ['Home', 'home']}},
  },
  {
    patterns: ['search :query'],
    slots: {query: {kind: 'text', maxLength: Infinity}},
  },
  {patterns: [], slots: {}},
])('rejects an invalid command schema or pattern: %j', invalid => {
  expect(() =>
    defineCommand({id: 'invalid', execute: jest.fn(), ...invalid} as never),
  ).toThrow();
});

it('rejects duplicate registry IDs, unsafe inputs and unbounded lifetime', () => {
  const command = defineCommand({
    id: 'home',
    patterns: ['open home'],
    slots: {},
    execute: jest.fn(),
  });
  expect(() => createCommandRouter({commands: [command, command]})).toThrow(
    'Duplicate',
  );
  expect(() =>
    createCommandRouter({commands: [command], maxAgeMs: Infinity}),
  ).toThrow();
  const router = createCommandRouter({commands: [command]});
  for (const text of [
    '',
    'open\u0000 home',
    'open\u202e home',
    'open home' + ' '.repeat(4096),
  ]) {
    expect(router.match(text)).toEqual({status: 'unmatched'});
  }
});

it('binds confirmation to the exact candidate and cancels it on interruption', async () => {
  let confirm!: (allowed: boolean) => void;
  let entered!: () => void;
  const showing = new Promise<void>(resolve => {
    entered = resolve;
  });
  const execute = jest.fn();
  const command = defineCommand({
    id: 'search',
    patterns: ['search :query'],
    slots: {query: {kind: 'text', maxLength: 32}},
    execute,
  });
  const confirmation = jest.fn((candidate, context) => {
    expect(candidate.slots).toEqual({query: 'Blue Note'});
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(candidate.slots)).toBe(true);
    expect(context.signal.aborted).toBe(false);
    entered();
    return new Promise<boolean>(resolve => {
      confirm = resolve;
    });
  });
  const router = createCommandRouter({
    commands: [command],
    authorize: () => true,
    confirm: confirmation,
  });
  const match = router.match('search Blue Note');
  if (match.status !== 'matched') throw new Error('Expected match');
  const pending = router.dispatch(match.candidate);
  await showing;
  router.cancelAll();
  expect(await pending).toEqual({status: 'cancelled'});
  confirm(true);
  await Promise.resolve();
  expect(execute).not.toHaveBeenCalled();
  expect(await router.dispatch(match.candidate)).toEqual({status: 'cancelled'});
});

it("never dispatches ambiguous suggestions, forged parameters or another router's candidate", async () => {
  const command = defineCommand({
    id: 'home',
    patterns: ['open home'],
    slots: {},
    execute: jest.fn(),
  });
  const other = defineCommand({
    id: 'other',
    patterns: ['open home'],
    slots: {},
    execute: jest.fn(),
  });
  const router = createCommandRouter({
    commands: [command, other],
    authorize: () => true,
    confirm: () => true,
  });
  const ambiguity = router.match('open home');
  if (ambiguity.status !== 'ambiguous') throw new Error('Expected ambiguity');
  for (const candidate of ambiguity.matches)
    expect(await router.dispatch(candidate)).toEqual({
      status: 'invalid-candidate',
    });
  const first = createCommandRouter({commands: [command]});
  const second = createCommandRouter({commands: [command]});
  const match = first.match('open home');
  if (match.status !== 'matched') throw new Error('Expected match');
  expect(await second.dispatch(match.candidate)).toEqual({
    status: 'invalid-candidate',
  });
  expect(
    await first.dispatch({...match.candidate, slots: {route: 'admin'}}),
  ).toEqual({status: 'invalid-candidate'});
});

it('does not treat truthy callback values as authorization or confirmation', async () => {
  const execute = jest.fn();
  const command = defineCommand({
    id: 'home',
    patterns: ['open home'],
    slots: {},
    execute,
  });
  for (const [authorize, confirm, status] of [
    [() => 'yes', () => true, 'denied'],
    [() => true, () => 'yes', 'declined'],
  ] as const) {
    const router = createCommandRouter({
      commands: [command],
      authorize: authorize as never,
      confirm: confirm as never,
    });
    const match = router.match('open home');
    if (match.status !== 'matched') throw new Error('Expected match');
    expect(await router.dispatch(match.candidate)).toEqual({status});
  }
  expect(execute).not.toHaveBeenCalled();
});

it('surfaces handler failures and releases the dispatch slot for a fresh candidate', async () => {
  const failure = new Error('App action failed');
  const execute = jest
    .fn()
    .mockRejectedValueOnce(failure)
    .mockResolvedValueOnce(undefined);
  const command = defineCommand({
    id: 'home',
    patterns: ['open home'],
    slots: {},
    requireConfirmation: false,
    execute,
  });
  const router = createCommandRouter({
    commands: [command],
    authorize: () => true,
  });
  const first = router.match('open home');
  const second = router.match('open home');
  if (first.status !== 'matched' || second.status !== 'matched')
    throw new Error('Expected matches');
  await expect(router.dispatch(first.candidate)).rejects.toBe(failure);
  expect(await router.dispatch(first.candidate)).toEqual({
    status: 'already-dispatched',
  });
  expect(await router.dispatch(second.candidate)).toEqual({status: 'executed'});
});

it('deduplicates equivalent aliases but rejects distinct interpretations of the same command', () => {
  const aliases = defineCommand({
    id: 'home',
    patterns: ['open home', 'OPEN HOME'],
    slots: {},
    execute: jest.fn(),
  });
  expect(
    createCommandRouter({commands: [aliases]}).match('open home').status,
  ).toBe('matched');
  const swap = defineCommand({
    id: 'swap',
    patterns: [':from :to', ':to :from'],
    slots: {
      from: {kind: 'choice', values: ['home', 'settings']},
      to: {kind: 'choice', values: ['home', 'settings']},
    },
    execute: jest.fn(),
  });
  const result = createCommandRouter({commands: [swap]}).match('home settings');
  expect(result.status).toBe('ambiguous');
  if (result.status === 'ambiguous')
    expect(result.matches.map(match => match.slots)).toEqual([
      {from: 'home', to: 'settings'},
      {from: 'settings', to: 'home'},
    ]);
});

it('rejects concurrent replay before asynchronous authorization resolves', async () => {
  let allow!: (value: boolean) => void;
  const execute = jest.fn();
  const command = defineCommand({
    id: 'home',
    patterns: ['open home'],
    slots: {},
    requireConfirmation: false,
    execute,
  });
  const router = createCommandRouter({
    commands: [command],
    authorize: () =>
      new Promise<boolean>(resolve => {
        allow = resolve;
      }),
  });
  const match = router.match('open home');
  if (match.status !== 'matched') throw new Error('Expected match');
  const pending = router.dispatch(match.candidate);
  expect(await router.dispatch(match.candidate)).toEqual({
    status: 'already-dispatched',
  });
  allow(true);
  expect(await pending).toEqual({status: 'executed'});
  expect(execute).toHaveBeenCalledTimes(1);
});

it('checks cancellation after an async authorization has already resolved', async () => {
  const execute = jest.fn();
  const command = defineCommand({
    id: 'home',
    patterns: ['open home'],
    slots: {},
    requireConfirmation: false,
    execute,
  });
  const router = createCommandRouter({
    commands: [command],
    authorize: async () => {
      await Promise.resolve();
      queueMicrotask(() => router.cancelAll());
      return true;
    },
  });
  const match = router.match('open home');
  if (match.status !== 'matched') throw new Error('Expected match');
  expect(await router.dispatch(match.candidate)).toEqual({status: 'cancelled'});
  expect(execute).not.toHaveBeenCalled();
});

it('aborts an already-started app handler without claiming to roll back its side effects', async () => {
  let entered!: () => void;
  let fail!: (error: Error) => void;
  let signal: AbortSignal | undefined;
  const started = new Promise<void>(resolve => {
    entered = resolve;
  });
  const calls: string[] = [];
  const command = defineCommand({
    id: 'home',
    patterns: ['open home'],
    slots: {},
    requireConfirmation: false,
    execute: (_slots, context) => {
      calls.push('started');
      signal = context.signal;
      entered();
      return new Promise<void>((_resolve, reject) => {
        fail = reject;
      });
    },
  });
  const router = createCommandRouter({
    commands: [command],
    authorize: () => true,
  });
  const match = router.match('open home');
  if (match.status !== 'matched') throw new Error('Expected match');
  const pending = router.dispatch(match.candidate);
  await started;
  router.cancelAll();
  expect(await pending).toEqual({status: 'cancelled'});
  expect(signal?.aborted).toBe(true);
  expect(calls).toEqual(['started']);
  fail(new Error('Late app failure'));
  await Promise.resolve();
});

it.each(['authorize', 'confirm'] as const)(
  'propagates %s failures without executing',
  async phase => {
    const execute = jest.fn();
    const failure = new Error('Callback failed');
    const command = defineCommand({
      id: 'home',
      patterns: ['open home'],
      slots: {},
      execute,
    });
    const router = createCommandRouter({
      commands: [command],
      authorize: () => true,
      confirm: () => true,
      [phase]: () => {
        throw failure;
      },
    });
    const match = router.match('open home');
    if (match.status !== 'matched') throw new Error('Expected match');
    await expect(router.dispatch(match.candidate)).rejects.toBe(failure);
    expect(execute).not.toHaveBeenCalled();
  },
);

it('rejects sparse registry, pattern and choice arrays at configuration time', () => {
  expect(() => createCommandRouter({commands: new Array(1)})).toThrow();
  expect(() =>
    defineCommand({
      id: 'sparse',
      patterns: new Array(1),
      slots: {},
      execute: jest.fn(),
    }),
  ).toThrow();
  expect(() =>
    defineCommand({
      id: 'sparse',
      patterns: ['open :tab'],
      slots: {tab: {kind: 'choice', values: new Array(1)}},
      execute: jest.fn(),
    }),
  ).toThrow();
});

it('waits for the monotonic deadline when a fractional timer wakes early', async () => {
  jest.useFakeTimers();
  const now = jest.spyOn(performance, 'now');
  try {
    now.mockReturnValue(0.4);
    const command = defineCommand({
      id: 'home',
      patterns: ['open home'],
      slots: {},
      execute: jest.fn(),
    });
    const router = createCommandRouter({
      commands: [command],
      maxAgeMs: 10,
      authorize: () => new Promise<boolean>(() => {}),
    });
    const match = router.match('open home');
    if (match.status !== 'matched') throw new Error('Expected match');
    now.mockReturnValue(0.8);
    const settled = jest.fn();
    const pending = router.dispatch(match.candidate).then(result => {
      settled(result);
      return result;
    });
    now.mockReturnValue(9.8);
    await jest.advanceTimersByTimeAsync(9);
    expect(settled).not.toHaveBeenCalled();
    now.mockReturnValue(10.2);
    await jest.advanceTimersByTimeAsync(1);
    expect(settled).not.toHaveBeenCalled();
    now.mockReturnValue(10.4);
    await jest.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({status: 'expired'});
  } finally {
    now.mockRestore();
    jest.useRealTimers();
  }
});

it('rejects Arabic Letter Mark in transcript text, patterns and choices', () => {
  const search = defineCommand({
    id: 'search',
    patterns: ['search :query'],
    slots: {query: {kind: 'text', maxLength: 32}},
    execute: jest.fn(),
  });
  const router = createCommandRouter({commands: [search]});
  expect(router.match('search \u061c123')).toEqual({status: 'unmatched'});
  expect(() =>
    defineCommand({
      id: 'marked',
      patterns: ['open\u061c home'],
      slots: {},
      execute: jest.fn(),
    }),
  ).toThrow();
  expect(() =>
    defineCommand({
      id: 'marked',
      patterns: ['open :tab'],
      slots: {tab: {kind: 'choice', values: ['home\u061c']}},
      execute: jest.fn(),
    }),
  ).toThrow();
});
