#!/usr/bin/env node

import assert from 'assert';
import http from 'http';
import { MCPVectorRetriever, VectorStoreUnavailableError } from '../lib/router/retriever.js';

const SAMPLE_MCP_RECORDS = {
  database: [
    {
      id: 'sql-master',
      name: 'SQL Master',
      description: 'Helps with SQL schema design and query optimization',
      score: 0.91,
      metadata: { categories: ['database', 'sql'] }
    },
    {
      id: 'data-auditor',
      name: 'Data Auditor',
      description: 'Reviews data pipelines for reliability',
      score: 0.78,
      metadata: { categories: ['data'] }
    },
    {
      id: 'general-helper',
      name: 'General Helper',
      description: 'Provides broad project assistance',
      score: 0.55,
      metadata: { categories: ['general'] }
    }
  ],
  api: [
    {
      id: 'rest-navigator',
      name: 'REST Navigator',
      description: 'Guides REST API design and integration',
      score: 0.89,
      metadata: { categories: ['api', 'rest'] }
    },
    {
      id: 'http-tester',
      name: 'HTTP Tester',
      description: 'Validates API endpoints and payloads',
      score: 0.75,
      metadata: { categories: ['api'] }
    }
  ]
};

function createMockVectorStore() {
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405);
      return res.end();
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let query = '';
      try {
        const payload = JSON.parse(body || '{}');
        query = payload.query || '';
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: error.message }));
      }

      const lowerQuery = query.toLowerCase();
      let results = SAMPLE_MCP_RECORDS.database;

      if (/(api|rest|endpoint|integration)/i.test(lowerQuery)) {
        results = SAMPLE_MCP_RECORDS.api;
      } else if (/(database|sql|schema|postgres)/i.test(lowerQuery)) {
        results = SAMPLE_MCP_RECORDS.database;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ results }));
    });
  });

  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}/query`,
        close: () => new Promise(res => server.close(res))
      });
    });
  });
}

async function run() {
  console.log('\n🧪 Testing MCP vector retriever');
  const mockServer = await createMockVectorStore();

  try {
    const retriever = new MCPVectorRetriever({
      endpoint: mockServer.url,
      topK: 3
    });

    const databaseResults = await retriever.retrieve('Need help designing a SQL database schema');
    assert.strictEqual(databaseResults.length, 3, 'Expected three results for database query');
    assert.strictEqual(databaseResults[0].name, 'SQL Master');
    assert.ok(databaseResults[0].relevance >= databaseResults[1].relevance);

    const apiResults = await retriever.retrieve('How do I integrate a REST endpoint?');
    assert.strictEqual(apiResults[0].name, 'REST Navigator');
    assert.ok(apiResults[0].relevance >= apiResults[apiResults.length - 1].relevance);

    const limitedResults = await retriever.retrieve('database migrations', { topK: 2 });
    assert.strictEqual(limitedResults.length, 2, 'Should respect topK override');

    let unavailableErrorCaught = false;
    const offlineRetriever = new MCPVectorRetriever({ endpoint: null, fetchImpl: retriever.fetch });
    try {
      await offlineRetriever.retrieve('anything');
    } catch (error) {
      unavailableErrorCaught = error instanceof VectorStoreUnavailableError;
    }
    assert.ok(unavailableErrorCaught, 'Should throw VectorStoreUnavailableError when misconfigured');

    console.log('✅ MCP vector retriever integration tests passed');
  } finally {
    await mockServer.close();
  }
}

run().catch(error => {
  console.error('❌ MCP vector retriever tests failed');
  console.error(error);
  process.exitCode = 1;
});
