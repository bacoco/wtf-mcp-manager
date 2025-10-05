import test from 'node:test';
import assert from 'node:assert/strict';

import { VectorStoreFactory, MockEmbeddingClient } from '../lib/router/vector-store.js';
import { RouterIngestor } from '../lib/router/ingestor.js';
import { RouterRetriever } from '../lib/router/retriever.js';

test('VectorStoreFactory.create returns a usable vector store for router ingestion and retrieval', async () => {
  const config = {
    vectorStore: 'memory',
    defaultTopK: 5
  };

  const vectorStore = await VectorStoreFactory.create(config);

  assert.equal(typeof vectorStore.upsert, 'function', 'vector store should expose upsert');
  assert.equal(typeof vectorStore.query, 'function', 'vector store should expose query');

  const embeddingProvider = new MockEmbeddingClient();

  const ingestor = new RouterIngestor({
    config,
    vectorStore,
    embeddingProvider
  });

  const sampleRecord = {
    id: 'sample',
    slug: 'sample',
    name: 'Sample Tool',
    description: 'A helpful test tool',
    source: 'registry',
    sourceId: 'registry:sample',
    categories: ['testing'],
    tags: ['mock'],
    command: 'sample --run',
    args: ['--run'],
    env: { SAMPLE_ENV: '1' },
    sampleCalls: ['sample --run'],
    schema: { type: 'object' },
    text: 'A helpful test tool for routing metadata',
    metadata: { extra: true }
  };

  ingestor.loadRecords = async () => [sampleRecord];

  const result = await ingestor.ingest({ force: true });
  assert.equal(result.count, 1, 'ingest should process the sample record');

  const retriever = new RouterRetriever({
    config,
    vectorStore,
    embeddingProvider
  });

  const matches = await retriever.retrieve('helpful tool for routing');
  assert.ok(matches.length > 0, 'query should return at least one match');
  assert.equal(matches[0].id, 'registry:sample', 'match should contain the ingested tool id');
  assert.deepEqual(matches[0].categories, ['testing'], 'match should preserve metadata fields');
  assert.equal(matches[0].command, 'sample --run', 'match should include tool command metadata');
});
