import {defineCommand} from '../../commands';

it('infers the declared choice union and text slot types', () => {
  const command = defineCommand({
    id: 'search-tab',
    patterns: ['search :tab :query'],
    slots: {
      tab: {kind: 'choice', values: ['home', 'saved']},
      query: {kind: 'text', maxLength: 64},
    },
    execute: slots => {
      const tab: 'home' | 'saved' = slots.tab;
      const query: string = slots.query;
      // @ts-expect-error A route outside the declared choices is not inferred.
      const admin: 'admin' = slots.tab;
      // @ts-expect-error Unknown slots are absent from the callback type.
      const missing = slots.missing;
      // eslint-disable-next-line no-void -- Keep the negative type assertions checked.
      void [tab, query, admin, missing];
    },
  });
  expect(command.id).toBe('search-tab');
});
