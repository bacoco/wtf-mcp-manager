import test from 'node:test';
import assert from 'node:assert/strict';

import { parseNodeVersion } from '../lib/manager.js';

test('parseNodeVersion extracts major and minor from prefixed versions', () => {
  assert.deepEqual(parseNodeVersion('v8.0.0'), { major: 8, minor: 0 });
  assert.deepEqual(parseNodeVersion('v20.10.0'), { major: 20, minor: 10 });
});

test('parseNodeVersion extracts versions without leading v', () => {
  assert.deepEqual(parseNodeVersion('18.17.1'), { major: 18, minor: 17 });
});

test('parseNodeVersion handles missing minor segment', () => {
  assert.deepEqual(parseNodeVersion('v16'), { major: 16, minor: null });
});

test('parseNodeVersion returns null for invalid input', () => {
  assert.equal(parseNodeVersion('invalid'), null);
  assert.equal(parseNodeVersion(undefined), null);
});
