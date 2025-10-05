#!/usr/bin/env node

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { MCPManager } from '../lib/manager.js';

test('init and enable handle custom backend profile', async t => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-manager-'));

  t.after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const manager = new MCPManager(tempDir);

  // Stub registry lookups so enable works without hitting the real registry
  manager.registry.get = () => ({
    command: 'node',
    args: ['server.js'],
    requiredEnv: []
  });

  const config = await manager.init({ profile: 'backend' });

  assert.deepStrictEqual(
    config.profiles.backend,
    [],
    'init should create an empty backend profile'
  );
  assert.strictEqual(config.activeProfile, 'backend');

  // Simulate a missing backend profile entry to ensure enable lazily recreates it
  delete manager.config.profiles.backend;

  await manager.enable('sample-mcp');

  assert.ok(
    Array.isArray(manager.config.profiles.backend),
    'backend profile should be recreated as an array'
  );
  assert.deepStrictEqual(manager.config.profiles.backend, ['sample-mcp']);
  assert.ok(
    manager.config.mcpServers['sample-mcp'],
    'enabled MCP should be recorded in the configuration'
  );
});
