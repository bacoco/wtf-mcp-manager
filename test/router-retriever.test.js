import test from 'node:test';
import assert from 'node:assert/strict';

import RouterRetriever from '../lib/server/retriever.js';

test('RouterRetriever uses limit in vector search payloads', async () => {
  const retriever = new RouterRetriever({
    vectorUrl: 'http://vector.example',
    collection: 'test-collection'
  });

  retriever.getEmbedding = async () => [0.1, 0.2, 0.3];

  const originalFetch = globalThis.fetch;
  let fetchCall;

  globalThis.fetch = async (url, options) => {
    fetchCall = { url, options };
    return {
      ok: true,
      json: async () => ({ result: [] })
    };
  };

  try {
    await retriever.queryVectorDB('test query', { limit: 7 });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.ok(fetchCall, 'fetch should be called for vector searches');
  assert.ok(fetchCall.url.endsWith('/points/search'), 'vector search endpoint should be used');

  const payload = JSON.parse(fetchCall.options.body);
  assert.strictEqual(payload.limit, 7, 'search payload should include limit');
  assert.ok(!Object.prototype.hasOwnProperty.call(payload, 'top'), 'search payload should not include top');
});
