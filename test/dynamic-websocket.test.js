#!/usr/bin/env node

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DynamicMCPGenerator } from '../lib/dynamic/mcp-generator.js';

test('dynamic generator produces websocket scaffold', async () => {
  const generator = new DynamicMCPGenerator();
  await generator.init();

  const template = generator.templates.get('websocket');
  assert.ok(template, 'expected websocket template to be registered');

  const spec = {
    name: 'ws-echo',
    description: 'Echo websocket service',
    websocket: {
      url: 'wss://example.com/socket',
      protocols: ['json']
    },
    endpoints: []
  };

  const code = await generator.generateCode(spec, template);

  assert.match(code, /WebSocketServer/);
  assert.match(code, /setupWebSocketServer/);
  assert.match(code, /handleWebSocketPayload/);
  assert.doesNotMatch(code, /Template not found/);
});

