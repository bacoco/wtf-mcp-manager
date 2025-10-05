import test from 'node:test';
import assert from 'node:assert/strict';

import { parseNodeVersion } from '../lib/manager.js';

test('parseNodeVersion extracts major and minor versions with v prefix', () => {
  const result = parseNodeVersion('v18.17.1');
  assert.deepEqual(result, { major: 18, minor: 17 });
});

test('parseNodeVersion handles versions without v prefix', () => {
  const result = parseNodeVersion('20.10.0');
  assert.deepEqual(result, { major: 20, minor: 10 });
});

test('parseNodeVersion returns null for invalid versions', () => {
  const result = parseNodeVersion('not-a-version');
  assert.equal(result, null);
});

test('parseNodeVersion supports versions without minor component', () => {
  const result = parseNodeVersion('v8');
  assert.deepEqual(result, { major: 8, minor: null });
});
