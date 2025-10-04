import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VectorRouter } from '../lib/router/vector-router.js';
import { WTFMCPManagerServer } from '../lib/mcp-server.js';

const noopLogger = { warn: () => {} };

const createResponse = (body, options = {}) => {
  const init = { status: 200, headers: { 'content-type': 'application/json' }, ...options };
  if (body === null || body === undefined) {
    return new Response(null, init);
  }
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(payload, init);
};

test('VectorRouter creates collection and upserts tool metadata', async () => {
  const calls = [];
  const fetchMock = async (url, options = {}) => {
    calls.push({ url, options });

    if (url === 'http://qdrant.local/collections/test-tools') {
      if (!options.method) {
        return createResponse(null, { status: 404 });
      }
      return createResponse({ result: 'created' });
    }

    if (url === 'http://qdrant.local/collections/test-tools/points') {
      return createResponse({ result: { upserted: 1 } });
    }

    throw new Error(`Unexpected request: ${url}`);
  };

  const router = new VectorRouter({
    baseUrl: 'http://qdrant.local',
    collection: 'test-tools',
    dimensions: 8,
    fetch: fetchMock,
    logger: noopLogger
  });

  const record = {
    id: 'registry_mcp:github',
    originalId: 'github',
    name: 'GitHub',
    description: 'Code hosting and collaboration',
    schema: { type: 'object' },
    examples: [],
    categories: ['development'],
    type: 'registry_mcp',
    source: 'builtin'
  };

  const success = await router.upsertTools([record]);
  assert.strictEqual(success, true);
  assert.strictEqual(calls.length, 3, 'should call collection get, create, and upsert');

  const upsertCall = calls[calls.length - 1];
  const payload = JSON.parse(upsertCall.options.body);
  assert.strictEqual(payload.points[0].id, record.id);
  assert.strictEqual(payload.points[0].vector.length, 8);
});

test('VectorRouter search applies filters and returns payloads', async () => {
  const requests = [];
  const fetchMock = async (url, options = {}) => {
    if (url === 'http://qdrant.local/collections/test-tools') {
      return createResponse({ result: {} });
    }

    if (url === 'http://qdrant.local/collections/test-tools/points/search') {
      const body = JSON.parse(options.body);
      requests.push(body);
      return createResponse({
        result: [
          {
            id: 'registry_mcp:database',
            score: 0.9,
            payload: {
              record: {
                id: 'registry_mcp:database',
                originalId: 'database',
                name: 'Database MCP',
                description: 'Manage relational databases',
                schema: { type: 'object' },
                examples: [],
                categories: ['database'],
                type: 'registry_mcp',
                source: 'registry'
              }
            }
          },
          {
            id: 'registry_mcp:warehouse',
            score: 0.72,
            payload: {
              record: {
                id: 'registry_mcp:warehouse',
                originalId: 'warehouse',
                name: 'Warehouse MCP',
                description: 'Data warehouse tooling',
                schema: { type: 'object' },
                examples: [],
                categories: ['database'],
                type: 'registry_mcp',
                source: 'registry'
              }
            }
          }
        ]
      });
    }

    throw new Error(`Unexpected request: ${url}`);
  };

  const router = new VectorRouter({
    baseUrl: 'http://qdrant.local',
    collection: 'test-tools',
    dimensions: 8,
    fetch: fetchMock,
    logger: noopLogger
  });

  const results = await router.query('warehouse database operations', {
    topK: 2,
    filter: { type: 'registry_mcp', categories: ['database'] }
  });

  assert.ok(Array.isArray(results));
  assert.strictEqual(results.length, 2);
  assert.strictEqual(results[0].payload.name, 'Database MCP');
  assert.deepStrictEqual(requests[0].filter, {
    must: [
      { key: 'type', match: { value: 'registry_mcp' } },
      { key: 'categories', match: { any: ['database'] } }
    ]
  });
});

test('retrieveRelevantTools falls back when vector search is unavailable', async () => {
  class UnavailableVectorRouter {
    constructor() {
      this.available = false;
    }

    async upsertTools() {
      return false;
    }

    async query() {
      this.available = false;
      return null;
    }
  }

  const server = new WTFMCPManagerServer({ vectorRouter: new UnavailableVectorRouter() });
  const result = await server.retrieveRelevantTools({ query: 'database services', topK: 3 });

  assert.ok(result.fallback, 'should fall back when vector store is unavailable');
  assert.ok(result.tools.length > 0, 'fallback should still provide results');
  assert.strictEqual(result.vectorStoreAvailable, false);
  assert.ok(result.tools.every(tool => tool.name && tool.description));
});
