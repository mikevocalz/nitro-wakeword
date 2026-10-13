#!/usr/bin/env node
const assert = require('node:assert/strict');

async function main() {
  const {createListSearch, createInMemoryListProvider} =
    await import('nitro-wakeword/search');
  let selected;
  const search = createListSearch({
    scope: 'books',
    getSessionKey: () => 1,
    provider: createInMemoryListProvider({
      items: [
        {id: 'second', label: 'Blue notes', value: 2},
        {id: 'first', label: 'Blue', value: 1},
      ],
    }),
    authorize: () => true,
    onSelect: (item, context) => {
      context.throwIfStopped();
      selected = item.value;
    },
    pageSize: 1,
  });
  try {
    const first = await search.search('blue');
    assert.equal(first.status, 'results');
    assert.equal(first.page.choices[0].id, 'first');
    const second = await search.next(first.page);
    assert.equal(second.status, 'results');
    assert.deepEqual(await search.select(first.page, 'first'), {
      status: 'stale',
    });
    assert.deepEqual(await search.select(second.page, 'second'), {
      status: 'selected',
    });
    assert.equal(selected, 2);
  } finally {
    search.dispose();
  }
  process.stdout.write(
    'Built search subpath passed ranking, pagination and guarded selection in Node.\n',
  );
}
main().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
