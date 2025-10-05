#!/usr/bin/env node

import assert from 'assert/strict';
import chalk from 'chalk';
import { VectorStoreIngestor, MemoryVectorDatabase, MockEmbeddingClient } from '../lib/router/vector-store.js';

async function runVectorStoreTests() {
  console.log(chalk.cyan('\n🧪 Testing vector store ingestion\n'));

  const vectorDb = new MemoryVectorDatabase();
  const embeddingClient = new MockEmbeddingClient();

  const ingestor = new VectorStoreIngestor({
    vectorDb,
    embeddingClient,
    provider: 'memory',
    embeddingProvider: 'mock'
  });

  const sampleDocs = [
    {
      id: 'test:doc',
      source: 'test',
      name: 'Test Document',
      description: 'Ensures async embedding initialization resolves correctly',
      schema: null,
      example: '',
      text: 'Sample text for embedding',
      metadata: {}
    }
  ];

  const embeddedDocs = await ingestor.embedDocuments(sampleDocs);
  assert.equal(embeddedDocs.length, sampleDocs.length, 'embedDocuments should return embeddings for all docs');
  assert.ok(Array.isArray(embeddedDocs[0].embedding), 'embedded document should include an embedding array');
  assert.ok(ingestor.embeddingClient, 'embedding client should be resolved after embedding');

  const asyncIngestor = new VectorStoreIngestor({
    vectorDb: new MemoryVectorDatabase(),
    provider: 'memory',
    embeddingProvider: 'mock'
  });
  const asyncEmbeddedDocs = await asyncIngestor.embedDocuments(sampleDocs);
  assert.ok(Array.isArray(asyncEmbeddedDocs[0].embedding), 'async-created embedding client should embed documents');
  assert.ok(asyncIngestor.embeddingClient, 'async-created embedding client should resolve during embedding');

  const result = await ingestor.ingestAll();

  assert.ok(result.count > 0, 'ingestion should create at least one document');
  assert.equal(result.provider, 'memory', 'provider should be memory for tests');
  assert.equal(vectorDb.records.length, result.count, 'vector DB should receive all embedded records');
  assert.ok(vectorDb.records.every(record => Array.isArray(record.embedding) && record.embedding.length > 0), 'records should include embeddings');
  assert.ok(vectorDb.records.every(record => typeof record.text === 'string' && record.text.length > 0), 'records should include serialized text');

  console.log(chalk.green(`✅ Ingestion succeeded with ${result.count} documents`));
  console.log(chalk.gray(`Sample record: ${vectorDb.records[0].id}`));
  console.log(chalk.cyan('\n🎯 Vector store ingestion tests completed!\n'));
}

runVectorStoreTests().catch((error) => {
  console.error(chalk.red('❌ Vector store ingestion test failed:'), error);
  process.exit(1);
});
