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

test('CLI loads .claude env variables before prompting', async t => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-manager-cli-'));

  t.after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const envDir = path.join(tempDir, '.claude');
  await fs.mkdir(envDir, { recursive: true });

  const envKey = 'WTF_MCP_FAKE_TOKEN';
  const envValue = 'super-secret';
  await fs.writeFile(path.join(envDir, '.env'), `${envKey}=${envValue}\n`, 'utf8');

  const originalCwd = process.cwd();
  const originalArgv = [...process.argv];
  const previousEnvValue = process.env[envKey];
  const originalExit = process.exit;
  const originalExitCode = process.exitCode;

  delete process.env[envKey];
  process.chdir(tempDir);
  process.argv = ['node', 'wtf-mcp-manager'];
  process.exit = () => {};

  try {
    await import('../bin/wtf-mcp.js');
    assert.strictEqual(
      process.env[envKey],
      envValue,
      'env variables from .claude/.env should populate process.env before CLI prompts'
    );
  } finally {
    process.exit = originalExit;
    process.exitCode = originalExitCode;
    process.argv = originalArgv;
    process.chdir(originalCwd);

    if (previousEnvValue === undefined) {
      delete process.env[envKey];
    } else {
      process.env[envKey] = previousEnvValue;
    }
  }
});
