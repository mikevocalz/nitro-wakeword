#!/usr/bin/env node
const assert = require('node:assert/strict');

async function main() {
  // Real Node resolution rejects any accidental import of React Native here.
  const {createCommandRouter, defineCommand} =
    await import('nitro-wakeword/commands');
  const received = [];
  const open = defineCommand({
    id: 'open-tab',
    patterns: ['open :tab'],
    slots: {tab: {kind: 'choice', values: ['home']}},
    requireConfirmation: false,
    execute: slots => {
      received.push(slots.tab);
    },
  });
  const router = createCommandRouter({commands: [open], authorize: () => true});
  const result = router.match('open home');
  assert.equal(result.status, 'matched');
  assert.deepEqual(await router.dispatch(result.candidate), {
    status: 'executed',
  });
  assert.deepEqual(received, ['home']);
  router.dispose();
  process.stdout.write(
    'Built commands subpath matched and safely dispatched without native imports.\n',
  );
}

main().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
