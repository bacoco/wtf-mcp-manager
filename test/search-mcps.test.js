#!/usr/bin/env node

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { WTFMCPManagerServer } from '../lib/mcp-server.js';

const stubVectorRouter = {
  async query() {
    return [];
  },
  isAvailable() {
    return false;
  }
};

test('searchMCPs returns router results when available', async () => {
  const server = new WTFMCPManagerServer({ vectorRouter: stubVectorRouter });
  server.routerClient = {
    isConfigured: true,
    async query({ query, topK }) {
      assert.strictEqual(query, 'database');
      assert.strictEqual(topK, 5);
      return [
        { id: 'remote-db', name: 'Remote DB', description: 'Remote database tool', source: 'router' }
      ];
    }
  };

  const results = await server.searchMCPs('database', { limit: 5 });

  assert.ok(Array.isArray(results));
  assert.ok(results.length > 0);
  assert.strictEqual(results[0].id, 'remote-db');
});

test('searchMCPs falls back to local registry metadata', async () => {
  const server = new WTFMCPManagerServer({ vectorRouter: stubVectorRouter });
  server.routerClient = {
    isConfigured: true,
    async query() {
      return [];
    }
  };

  const results = await server.searchMCPs('database', { limit: 5 });

  assert.ok(results.some(result => result.id === 'supabase'));
});

test('searchMCPs falls back to registry text when needed', async () => {
  const server = new WTFMCPManagerServer({ vectorRouter: stubVectorRouter });
  server.routerClient = {
    isConfigured: true,
    async query() {
      return [];
    }
  };

  server.registry.getAll = () => ({ });
  server.availableMCPs = {};
  server.registryText = '@example/custom-mcp Useful custom integration';

  const results = await server.searchMCPs('custom', { limit: 3 });

  assert.ok(results.some(result => result.id === '@example/custom-mcp'));
});
