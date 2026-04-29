'use strict';

// Tests happy paths for fs.writeFileAtomic / writeFileAtomicSync /
// fsPromises.writeFileAtomic: async + sync + callback + promise variants,
// data encodings, mode preservation, custom tmpSuffix, symlink resolution,
// and that no temp files are left behind after success.

const common = require('../common');
const assert = require('assert');
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');

const tmpdir = require('../common/tmpdir');
tmpdir.refresh();

function listTemps(dir, base) {
  return fs.readdirSync(dir)
    .filter((name) => name !== base && name.startsWith(`${base}.`));
}

// Callback variant, basic string write, creates file.
{
  const file = tmpdir.resolve('cb-basic.txt');
  fs.writeFileAtomic(file, 'hello', common.mustSucceed(() => {
    assert.strictEqual(fs.readFileSync(file, 'utf8'), 'hello');
    assert.deepStrictEqual(listTemps(tmpdir.path, 'cb-basic.txt'), []);
  }));
}

// Callback variant, options as string (encoding).
{
  const file = tmpdir.resolve('cb-encoding.txt');
  fs.writeFileAtomic(file, 'café', 'utf8', common.mustSucceed(() => {
    assert.strictEqual(fs.readFileSync(file, 'utf8'), 'café');
  }));
}

// Callback variant, Buffer data.
{
  const file = tmpdir.resolve('cb-buffer.bin');
  const data = Buffer.from([0x00, 0x01, 0x02, 0xff]);
  fs.writeFileAtomic(file, data, common.mustSucceed(() => {
    assert.deepStrictEqual(fs.readFileSync(file), data);
  }));
}

// Callback variant, Uint8Array data.
{
  const file = tmpdir.resolve('cb-u8.bin');
  const data = new Uint8Array([1, 2, 3, 4]);
  fs.writeFileAtomic(file, data, common.mustSucceed(() => {
    assert.deepStrictEqual(new Uint8Array(fs.readFileSync(file)),
                           new Uint8Array([1, 2, 3, 4]));
  }));
}

// Callback variant, DataView data.
{
  const file = tmpdir.resolve('cb-dv.bin');
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  view.setUint32(0, 0xdeadbeef);
  fs.writeFileAtomic(file, view, common.mustSucceed(() => {
    const read = fs.readFileSync(file);
    assert.strictEqual(read.readUInt32BE(0), 0xdeadbeef);
  }));
}

// Callback variant, overwrites existing file.
{
  const file = tmpdir.resolve('cb-overwrite.txt');
  fs.writeFileSync(file, 'old');
  fs.writeFileAtomic(file, 'new', common.mustSucceed(() => {
    assert.strictEqual(fs.readFileSync(file, 'utf8'), 'new');
  }));
}

// Sync variant, basic usage.
{
  const file = tmpdir.resolve('sync-basic.txt');
  fs.writeFileAtomicSync(file, 'sync hello');
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'sync hello');
  assert.deepStrictEqual(listTemps(tmpdir.path, 'sync-basic.txt'), []);
}

// Sync variant, options as string (encoding).
{
  const file = tmpdir.resolve('sync-encoding.txt');
  fs.writeFileAtomicSync(file, 'café', 'utf8');
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'café');
}

// Sync variant, large payload spanning many write chunks.
{
  const file = tmpdir.resolve('sync-large.bin');
  const big = Buffer.alloc(2 * 1024 * 1024, 0x41); // 2 MB of 'A'
  fs.writeFileAtomicSync(file, big);
  assert.deepStrictEqual(fs.readFileSync(file), big);
}

// Sync variant, custom tmpSuffix.
{
  const file = tmpdir.resolve('sync-suffix.txt');
  fs.writeFileAtomicSync(file, 'x', { tmpSuffix: 'swap' });
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'x');
  const temps = fs.readdirSync(tmpdir.path)
    .filter((n) => n.startsWith('sync-suffix.txt.swap.'));
  assert.deepStrictEqual(temps, []);
}

// Sync variant, mode preservation when no explicit mode.
if (!common.isWindows) {
  const file = tmpdir.resolve('sync-mode-preserve.txt');
  fs.writeFileSync(file, 'init', { mode: 0o600 });
  fs.writeFileAtomicSync(file, 'next');
  const st = fs.statSync(file);
  assert.strictEqual(st.mode & 0o777, 0o600);
}

// Sync variant, explicit mode overrides preservation.
if (!common.isWindows) {
  const file = tmpdir.resolve('sync-mode-explicit.txt');
  fs.writeFileSync(file, 'init', { mode: 0o600 });
  fs.writeFileAtomicSync(file, 'next', { mode: 0o644 });
  const st = fs.statSync(file);
  assert.strictEqual(st.mode & 0o777, 0o644);
}

// Sync variant, symlink target is resolved (link preserved).
if (!common.isWindows) {
  const real = tmpdir.resolve('sync-symlink-target.txt');
  const link = tmpdir.resolve('sync-symlink-link.txt');
  fs.writeFileSync(real, 'before');
  fs.symlinkSync(real, link);
  fs.writeFileAtomicSync(link, 'after');
  assert.strictEqual(fs.readFileSync(real, 'utf8'), 'after');
  assert.strictEqual(fs.lstatSync(link).isSymbolicLink(), true);
}

// Sync variant, flush: false still produces correct content.
{
  const file = tmpdir.resolve('sync-noflush.txt');
  fs.writeFileAtomicSync(file, 'no flush', { flush: false });
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'no flush');
}

// Promise variant, basic usage.
(async () => {
  const file = tmpdir.resolve('prom-basic.txt');
  await fsPromises.writeFileAtomic(file, 'promise hello');
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'promise hello');
  assert.deepStrictEqual(listTemps(tmpdir.path, 'prom-basic.txt'), []);
})().then(common.mustCall());

// Promise variant, overwrites existing file atomically.
(async () => {
  const file = tmpdir.resolve('prom-overwrite.txt');
  fs.writeFileSync(file, 'old');
  await fsPromises.writeFileAtomic(file, 'new');
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'new');
})().then(common.mustCall());

// Promise variant, uses URL object for path.
(async () => {
  const file = tmpdir.resolve('prom-url.txt');
  const url = new URL(`file://${file}`);
  await fsPromises.writeFileAtomic(url, 'via url');
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'via url');
})().then(common.mustCall());

// Promise variant, large payload crossing chunk boundaries.
(async () => {
  const file = tmpdir.resolve('prom-large.bin');
  const big = Buffer.alloc(2 * 1024 * 1024, 0x42);
  await fsPromises.writeFileAtomic(file, big);
  assert.deepStrictEqual(fs.readFileSync(file), big);
})().then(common.mustCall());

// Promise variant, first-ever write (target does not exist) through a
// broken-path scenario where realpath succeeds on parent only.
(async () => {
  const subdir = tmpdir.resolve('sub-dir');
  fs.mkdirSync(subdir, { recursive: true });
  const file = path.join(subdir, 'brand-new.txt');
  await fsPromises.writeFileAtomic(file, 'first write');
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'first write');
})().then(common.mustCall());
