import test from 'node:test';
import assert from 'node:assert/strict';

import { VectorRouter } from '../lib/router/vector-router.js';
import { WTFMCPManagerServer } from '../lib/mcp-server.js';

const SAMPLE_TOOLS = [
  {
    id: 'github',
    name: 'GitHub',
    description: 'Repository hosting and version control for code projects',
    categories: ['development', 'vcs'],
    package: '@modelcontextprotocol/server-github'
  },
  {
    id: 'supabase',
    name: 'Supabase',
    description: 'Database, authentication, and storage platform',
    categories: ['database', 'storage'],
    package: '@supabase/mcp-server-supabase'
  },
  {
    id: 'vercel',
    name: 'Vercel',
    description: 'Cloud hosting platform focused on front-end deployments',
    categories: ['deployment', 'cloud'],
    package: '@modelcontextprotocol/server-vercel'
  },
  {
    id: 'docker',
    name: 'Docker',
    description: 'Container orchestration and image management',
    categories: ['containers', 'devops'],
    package: '@modelcontextprotocol/server-docker'
  }
];

const SAMPLE_MAP = Object.fromEntries(SAMPLE_TOOLS.map(tool => [tool.id, tool]));

test('VectorRouter ingests metadata and retrieves similar tools', async () => {
  const router = new VectorRouter({ dimensions: 64 });
  const ingestResult = await router.ingestTools(SAMPLE_TOOLS, { force: true });

  assert.equal(ingestResult.ingested, SAMPLE_TOOLS.length, 'all tools should be indexed');

  const matches = await router.query('version control and repositories', 2);
  assert.ok(Array.isArray(matches) && matches.length > 0, 'should return at least one match');
  assert.equal(matches[0].id, 'github', 'GitHub should be the top match for repository queries');
});

test('retrieve_relevant_tools uses vector matches when available', async () => {
  const router = new VectorRouter({ dimensions: 64 });
  const server = new WTFMCPManagerServer({ vectorRouter: router });
  server.availableMCPs = SAMPLE_MAP;

  await router.ingestTools(SAMPLE_TOOLS, { force: true });

  const response = await server.retrieveRelevantTools('cloud deployment hosting', 2);
  assert.ok(response.tools.length > 0, 'should return relevant tools');
  assert.ok(response.tools.some(tool => tool.id === 'vercel'), 'Vercel should be suggested for deployment queries');
  assert.notEqual(response.source, 'fallback', 'should not rely on fallback when vector router is available');
});

test('retrieve_relevant_tools gracefully falls back when vector store is unavailable', async () => {
  class FailingRouter {
    getSourceLabel() {
      return 'unavailable';
    }

    isAvailable() {
      return false;
    }

    async ensureReady() {}

    async ingestTools() {
      throw new Error('vector store offline');
    }

    async query() {
      throw new Error('vector store offline');
    }
  }

  const router = new FailingRouter();
  const server = new WTFMCPManagerServer({ vectorRouter: router });
  server.availableMCPs = SAMPLE_MAP;

  const response = await server.retrieveRelevantTools('version control and repositories', 3);
  assert.equal(response.source, 'fallback', 'should report fallback source');
  assert.ok(response.tools.some(tool => tool.id === 'github'), 'fallback search should still surface relevant tools');
});
