#!/usr/bin/env node

import test from 'node:test';
import assert from 'node:assert/strict';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { VectorStoreIngestor, MemoryVectorDatabase, MockEmbeddingClient } from '../lib/router/vector-store.js';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SAMPLE_DOCS = [
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

test('VectorStoreIngestor embeds and ingests documents with an explicit embedding client', async () => {
  const vectorDb = new MemoryVectorDatabase();
  const embeddingClient = new MockEmbeddingClient();

  const ingestor = new VectorStoreIngestor({
    vectorDb,
    embeddingClient,
    provider: 'memory',
    embeddingProvider: 'mock'
  });

  const embeddedDocs = await ingestor.embedDocuments(SAMPLE_DOCS);
  assert.equal(embeddedDocs.length, SAMPLE_DOCS.length);
  assert.ok(Array.isArray(embeddedDocs[0].embedding));
  assert.ok(ingestor.embeddingClient, 'embedding client should be resolved');

  const result = await ingestor.ingestDocuments(SAMPLE_DOCS);
  assert.equal(result.count, SAMPLE_DOCS.length);
  assert.equal(result.provider, 'memory');
  assert.equal(vectorDb.records.length, SAMPLE_DOCS.length);
});

test('VectorStoreIngestor resolves an embedding client asynchronously', async () => {
  const asyncIngestor = new VectorStoreIngestor({
    vectorDb: new MemoryVectorDatabase(),
    provider: 'memory',
    embeddingProvider: 'mock'
  });

  const embeddedDocs = await asyncIngestor.embedDocuments(SAMPLE_DOCS);
  assert.equal(embeddedDocs.length, SAMPLE_DOCS.length);
  assert.ok(Array.isArray(embeddedDocs[0].embedding));
  assert.ok(asyncIngestor.embeddingClient, 'async embedding client should resolve automatically');
});

test('wtf-mcp ingest --dry-run completes without reference errors', async () => {
  const cliPath = resolve(__dirname, '..', 'bin', 'wtf-mcp.js');
  const { stdout } = await execFileAsync('node', [cliPath, 'ingest', '--dry-run'], {
    env: {
      ...process.env,
      FORCE_COLOR: '0'
    }
  });

  assert.ok(/Dry run preview/.test(stdout), 'expected dry run preview output');
});
