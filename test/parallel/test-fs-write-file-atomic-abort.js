'use strict';

// AbortSignal tests for fs.writeFileAtomic / writeFileAtomicSync /
// fsPromises.writeFileAtomic. Covers pre-aborted signals and signals
// aborted during the write. Confirms that on abort the temporary file is
// unlinked and the target is left untouched (if it existed).

const common = require('../common');
const assert = require('assert');
const fs = require('fs');
const fsPromises = require('fs/promises');

const tmpdir = require('../common/tmpdir');
tmpdir.refresh();

function tempsFor(base) {
  return fs.readdirSync(tmpdir.path)
    .filter((n) => n !== base && n.startsWith(`${base}.`));
}

// Pre-aborted signal — callback variant.
{
  const file = tmpdir.resolve('pre-abort-cb.txt');
  const ac = new AbortController();
  ac.abort();
  fs.writeFileAtomic(file, 'payload', { signal: ac.signal },
                     common.expectsError({ name: 'AbortError' }));
}

// Pre-aborted signal — sync variant.
{
  const file = tmpdir.resolve('pre-abort-sync.txt');
  const ac = new AbortController();
  ac.abort();
  assert.throws(
    () => fs.writeFileAtomicSync(file, 'payload', { signal: ac.signal }),
    { name: 'AbortError' },
  );
  assert.strictEqual(fs.existsSync(file), false);
  assert.deepStrictEqual(tempsFor('pre-abort-sync.txt'), []);
}

// Pre-aborted signal — promise variant.
(async () => {
  const file = tmpdir.resolve('pre-abort-prom.txt');
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(
    fsPromises.writeFileAtomic(file, 'payload', { signal: ac.signal }),
    { name: 'AbortError' },
  );
  assert.strictEqual(fs.existsSync(file), false);
})().then(common.mustCall());

// Abort mid-write (promise variant). Large payload forces multiple chunks;
// abort fires synchronously after the call so the signal is seen between
// stages. Target file must be left at the prior contents.
(async () => {
  const file = tmpdir.resolve('mid-abort.bin');
  fs.writeFileSync(file, 'OLD');
  const big = Buffer.alloc(4 * 1024 * 1024, 0x43); // 4 MB
  const ac = new AbortController();
  const p = fsPromises.writeFileAtomic(file, big, { signal: ac.signal });
  ac.abort();
  await assert.rejects(p, { name: 'AbortError' });
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'OLD');
  // No temp file should remain.
  const leftovers = fs.readdirSync(tmpdir.path)
    .filter((n) => n !== 'mid-abort.bin' && n.startsWith('mid-abort.bin.'));
  assert.deepStrictEqual(leftovers, []);
})().then(common.mustCall());
