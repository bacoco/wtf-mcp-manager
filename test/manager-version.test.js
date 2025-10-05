import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseNodeVersion } from '../lib/manager.js';

test('parseNodeVersion handles v-prefixed versions', () => {
  const result = parseNodeVersion('v18.3.1');
  assert.deepEqual(result, { major: 18, minor: 3 });
});

test('parseNodeVersion handles plain numeric versions', () => {
  const result = parseNodeVersion('20.10.0');
  assert.deepEqual(result, { major: 20, minor: 10 });
});

test('parseNodeVersion handles short versions', () => {
  const result = parseNodeVersion('v8');
  assert.deepEqual(result, { major: 8, minor: null });
});

test('parseNodeVersion returns nulls for invalid input', () => {
  const result = parseNodeVersion('foo');
  assert.deepEqual(result, { major: null, minor: null });
});
