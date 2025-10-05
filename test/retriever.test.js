import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';

async function createMockVectorStore() {
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

test('legacy MCPVectorRetriever compatibility (if available)', async (t) => {
  const module = await import('../lib/router/retriever.js');
  const RetrieverClass = module.MCPVectorRetriever;
  const VectorStoreUnavailableError = module.VectorStoreUnavailableError || class VectorStoreUnavailableError extends Error {};

  if (!RetrieverClass) {
    t.skip('MCPVectorRetriever is not exported in this build');
    return;
  }

  const mockServer = await createMockVectorStore();
  t.after(() => mockServer.close());

  const retriever = new RetrieverClass({
    endpoint: mockServer.url,
    topK: 3
  });

  const databaseResults = await retriever.retrieve('Need help designing a SQL database schema');
  assert.equal(databaseResults.length, 3);
  assert.equal(databaseResults[0].name, 'SQL Master');
  assert.ok(databaseResults[0].relevance >= databaseResults[1].relevance);

  const apiResults = await retriever.retrieve('How do I integrate a REST endpoint?');
  assert.equal(apiResults[0].name, 'REST Navigator');
  assert.ok(apiResults[0].relevance >= apiResults[apiResults.length - 1].relevance);

  const limitedResults = await retriever.retrieve('database migrations', { topK: 2 });
  assert.equal(limitedResults.length, 2);

  let unavailableErrorCaught = false;
  const offlineRetriever = new RetrieverClass({ endpoint: null, fetchImpl: retriever.fetch });
  try {
    await offlineRetriever.retrieve('anything');
  } catch (error) {
    unavailableErrorCaught = error instanceof VectorStoreUnavailableError;
  }
  assert.ok(unavailableErrorCaught, 'Should throw VectorStoreUnavailableError when misconfigured');
});
