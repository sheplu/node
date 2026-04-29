'use strict';

// Error-path tests for fs.writeFileAtomic / writeFileAtomicSync /
// fsPromises.writeFileAtomic: invalid arguments, file-descriptor rejection,
// bad options, read-only parent directory, and verification that the
// temporary file is cleaned up on failure.

const common = require('../common');
const assert = require('assert');
const fs = require('fs');
const fsPromises = require('fs/promises');

const tmpdir = require('../common/tmpdir');
tmpdir.refresh();

// File descriptors are rejected — writeFileAtomic requires a path.
{
  const file = tmpdir.resolve('fd-reject.txt');
  const fd = fs.openSync(file, 'w');
  try {
    fs.writeFileAtomic(fd, 'data', common.expectsError({
      code: 'ERR_INVALID_ARG_TYPE',
    }));
    assert.throws(() => fs.writeFileAtomicSync(fd, 'data'), {
      code: 'ERR_INVALID_ARG_TYPE',
    });
    assert.rejects(fsPromises.writeFileAtomic(fd, 'data'), {
      code: 'ERR_INVALID_ARG_TYPE',
    }).then(common.mustCall());
  } finally {
    fs.closeSync(fd);
  }
}

// FileHandle instances are rejected by the promise variant.
(async () => {
  const file = tmpdir.resolve('fh-reject.txt');
  const handle = await fsPromises.open(file, 'w');
  try {
    await assert.rejects(fsPromises.writeFileAtomic(handle, 'data'), {
      code: 'ERR_INVALID_ARG_TYPE',
    });
  } finally {
    await handle.close();
  }
})().then(common.mustCall());

// tmpSuffix must be a non-empty string without separators.
{
  const file = tmpdir.resolve('bad-suffix.txt');
  assert.throws(() => fs.writeFileAtomicSync(file, 'x', { tmpSuffix: '' }), {
    code: 'ERR_INVALID_ARG_VALUE',
  });
  assert.throws(() => fs.writeFileAtomicSync(file, 'x', { tmpSuffix: 'a/b' }), {
    code: 'ERR_INVALID_ARG_VALUE',
  });
  assert.throws(() => fs.writeFileAtomicSync(file, 'x', { tmpSuffix: 'a\\b' }), {
    code: 'ERR_INVALID_ARG_VALUE',
  });
  assert.throws(() => fs.writeFileAtomicSync(file, 'x', { tmpSuffix: 'a\0b' }), {
    code: 'ERR_INVALID_ARG_VALUE',
  });
  assert.throws(() => fs.writeFileAtomicSync(file, 'x', { tmpSuffix: 123 }), {
    code: 'ERR_INVALID_ARG_TYPE',
  });
}

// The flush option must be a boolean.
{
  const file = tmpdir.resolve('bad-flush.txt');
  assert.throws(() => fs.writeFileAtomicSync(file, 'x', { flush: 'yes' }), {
    code: 'ERR_INVALID_ARG_TYPE',
  });
}

// Unsupported data type (number) is rejected via
// validateStringAfterArrayBufferView.
{
  const file = tmpdir.resolve('bad-data.txt');
  assert.throws(() => fs.writeFileAtomicSync(file, 42), {
    code: 'ERR_INVALID_ARG_TYPE',
  });
}

// Writing into a non-writable directory: the rename step fails and the temp
// file must not remain in the parent directory.
if (!common.isWindows && process.getuid && process.getuid() !== 0) {
  const ro = tmpdir.resolve('ro-dir');
  fs.mkdirSync(ro);
  const file = `${ro}/target.txt`;
  try {
    fs.chmodSync(ro, 0o500);
    assert.throws(() => fs.writeFileAtomicSync(file, 'data'), (err) => {
      // EACCES or EPERM depending on platform; both acceptable.
      return err.code === 'EACCES' || err.code === 'EPERM';
    });
    // No temp file should have been left behind.
    fs.chmodSync(ro, 0o700);
    const leftover = fs.readdirSync(ro);
    assert.deepStrictEqual(leftover, []);
  } finally {
    try { fs.chmodSync(ro, 0o700); } catch { /* ignore */ }
  }
}
