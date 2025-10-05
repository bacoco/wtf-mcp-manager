#!/usr/bin/env node

import assert from 'assert';
import chalk from 'chalk';
import {
  VectorStoreIngestor,
  MemoryVectorDatabase,
  MockEmbeddingClient
} from '../lib/router/vector-store.js';

async function createIngestor(overrides = {}) {
  const vectorDb = overrides.vectorDb ?? new MemoryVectorDatabase();
  const embeddingClient = overrides.embeddingClient ?? new MockEmbeddingClient();

  return new VectorStoreIngestor({
    vectorDb,
    embeddingClient,
    provider: 'memory',
    embeddingProvider: 'mock',
    ...overrides
  });
}

async function testDocumentCollection() {
  const ingestor = await createIngestor();
  const documents = await ingestor.collectDocuments();

  assert(documents.length > 0, 'Expected to collect at least one document for ingestion');
  const sample = documents[0];
  assert.strictEqual(typeof sample.text, 'string', 'Collected document should contain serialized text content');
  assert(sample.text.includes('Source:'), 'Serialized document should include its source metadata');

  console.log(chalk.green(`✅ Collected ${documents.length} documents for ingestion`));
}

async function testEmbeddingWorkflow() {
  const ingestor = await createIngestor();
  const documents = (await ingestor.collectDocuments()).slice(0, 2);

  const embedded = await ingestor.embedDocuments(documents);

  assert.strictEqual(embedded.length, documents.length, 'Embedding should return a vector for each document');
  assert(embedded.every(doc => Array.isArray(doc.embedding)), 'Embedded documents should include embedding arrays');
  assert(embedded.every(doc => doc.embedding.length > 0), 'Embeddings should not be empty');

  console.log(chalk.green('✅ Embedding workflow produced vector representations for documents'));
}

async function testIngestionPipeline() {
  const vectorDb = new MemoryVectorDatabase();
  const ingestor = await createIngestor({ vectorDb });

  const result = await ingestor.ingestAll();

  assert(result.count > 0, 'Expected ingestAll to insert at least one record');
  assert.strictEqual(result.provider, 'memory', 'Ingestion result should report memory provider for tests');
  assert.strictEqual(vectorDb.records.length, result.count, 'All embedded records should be stored in the vector database');
  assert(vectorDb.records.every(record => Array.isArray(record.embedding)), 'Stored records should include embeddings');

  console.log(chalk.green(`✅ Ingestion pipeline inserted ${result.count} records into the vector database`));
}

async function run() {
  console.log(chalk.cyan('\n🧪 Testing VectorStoreIngestor workflow\n'));
  await testDocumentCollection();
  await testEmbeddingWorkflow();
  await testIngestionPipeline();
  console.log(chalk.cyan('\n🎯 Ingestion tests complete!\n'));
}

run().catch(error => {
  console.error(chalk.red('❌ Ingestion tests failed:'), error);
  process.exit(1);
});
