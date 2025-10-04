#!/usr/bin/env node

import assert from 'assert';
import chalk from 'chalk';
import {
  collectMCPMetadata,
  toVectorRecord,
  ingestToVectorStore,
  VectorStoreClient
} from '../lib/router/vector-store.js';

class MockEmbedder {
  constructor() {
    this.calls = [];
  }

  async embed(text, record) {
    this.calls.push({ text, record });
    return [text.length % 10, record.id.length];
  }
}

class MockVectorStore {
  constructor() {
    this.collectionEnsured = false;
    this.upsertRecords = [];
  }

  async ensureCollection() {
    this.collectionEnsured = true;
  }

  async upsert(records) {
    this.upsertRecords.push(...records);
  }
}

async function testMetadataCollection() {
  const records = await collectMCPMetadata();
  assert(records.length > 0, 'Expected to collect at least one metadata record');
  const vectorRecord = toVectorRecord(records[0]);
  assert(vectorRecord.document.includes('Name:'), 'Vector record should contain a document payload');
  console.log(chalk.green(`✅ Collected ${records.length} metadata records`));
}

async function testVectorStoreClient() {
  const requests = [];
  const mockFetch = async (url, init = {}) => {
    requests.push({ url, init });
    return {
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => ''
    };
  };

  const client = new VectorStoreClient({
    provider: 'chroma',
    url: 'https://vector.example.com',
    collection: 'wtf-test'
  }, mockFetch);

  await client.ensureCollection();
  const ensureRequest = requests.find(req => req.url.endsWith('/collections'));
  assert(ensureRequest, 'Expected ensureCollection to hit /collections endpoint');

  await client.upsert([
    {
      id: 'registry:test',
      name: 'Test',
      description: 'Desc',
      source: 'registry',
      schema: null,
      examples: [],
      metadata: {},
      document: 'doc',
      embedding: [0.1, 0.2]
    }
  ]);

  const upsertRequest = requests.find(req => req.url.includes('/collections/wtf-test/upsert'));
  assert(upsertRequest, 'Expected upsert to call the collection upsert endpoint');
  const payload = JSON.parse(upsertRequest.init.body);
  assert.strictEqual(payload.ids[0], 'registry:test');
  assert.deepStrictEqual(payload.embeddings[0], [0.1, 0.2]);
  console.log(chalk.green('✅ VectorStoreClient ensures collection and upserts records'));
}

async function testIngestionPipeline() {
  const embedder = new MockEmbedder();
  const store = new MockVectorStore();
  const result = await ingestToVectorStore({
    embeddingProvider: embedder,
    vectorStore: store,
    vectorStoreConfig: {
      provider: 'chroma',
      url: 'https://vector.example.com',
      collection: 'wtf-test'
    }
  });

  assert(store.collectionEnsured, 'Expected vector store collection to be ensured');
  assert(store.upsertRecords.length > 0, 'Expected records to be written to the vector store');
  assert.strictEqual(result.collection, 'wtf-test');
  assert.strictEqual(result.provider, 'chroma');
  assert(embedder.calls.length > 0, 'Embedding provider should be invoked');
  console.log(chalk.green(`✅ Ingestion pipeline wrote ${store.upsertRecords.length} records`));
}

async function run() {
  console.log(chalk.cyan('\n🧪 Testing ingestion pipeline\n'));
  await testMetadataCollection();
  await testVectorStoreClient();
  await testIngestionPipeline();
  console.log(chalk.cyan('\n🎯 Ingestion tests complete!\n'));
}

run().catch(error => {
  console.error(chalk.red('❌ Ingestion tests failed:'), error);
  process.exit(1);
});
