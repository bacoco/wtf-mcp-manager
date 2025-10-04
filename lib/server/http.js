#!/usr/bin/env node
/**
 * Minimal HTTP wrapper exposing the vector router endpoints.
 */

import http from 'http';
import { URL } from 'url';
import { MCPRegistry } from '../registry.js';
import { VectorRetriever } from '../router/vector-retriever.js';

const PORT = parseInt(process.env.ROUTER_PORT || process.env.PORT || '3333', 10);
const HOST = process.env.ROUTER_HOST || '0.0.0.0';
const API_KEY = process.env.ROUTER_API_KEY || null;
const AUTO_BOOTSTRAP = process.env.VECTOR_BOOTSTRAP !== 'false';
const FORCE_BOOTSTRAP = process.env.VECTOR_BOOTSTRAP_FORCE === 'true';

const registry = new MCPRegistry();
const retriever = new VectorRetriever({ registry });
let ready = false;

async function initializeRetriever() {
  try {
    await retriever.ensureCollection();
    if (AUTO_BOOTSTRAP) {
      const result = await retriever.bootstrapRegistry({ force: FORCE_BOOTSTRAP });
      if (!result.skipped) {
        console.log(`📦 Bootstrapped ${result.bootstrapped || 0} MCP vectors into ${retriever.collection}`);
      }
    }
    ready = true;
    console.log(`🚀 Router ready on ${HOST}:${PORT} (collection: ${retriever.collection})`);
  } catch (error) {
    console.error('Failed to initialize vector retriever:', error.message);
    ready = false;
  }
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,x-api-key'
  });
  res.end(body);
}

async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (!chunks.length) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    throw new Error('Invalid JSON payload');
  }
}

function authorize(req) {
  if (!API_KEY) return true;
  const key = req.headers['x-api-key'] || req.headers['X-Api-Key'];
  return key === API_KEY;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,x-api-key'
    });
    return res.end();
  }

  if (!authorize(req)) {
    return sendJson(res, 401, { error: 'Unauthorized' });
  }

  if (url.pathname === '/health') {
    const status = await retriever.health();
    return sendJson(res, 200, { status: ready ? 'ready' : 'initializing', vectorDb: status });
  }

  if (!ready) {
    return sendJson(res, 503, { error: 'Vector retriever not ready' });
  }

  try {
    if (req.method === 'POST' && url.pathname === '/router/query') {
      const body = await parseBody(req);
      const results = await retriever.query({
        query: body.query,
        topK: body.topK,
        filter: body.filter,
        scoreThreshold: body.scoreThreshold
      });
      return sendJson(res, 200, { results });
    }

    if (req.method === 'POST' && url.pathname === '/router/upsert') {
      const body = await parseBody(req);
      const result = await retriever.upsertDocuments(body.documents || []);
      return sendJson(res, 200, result);
    }

    if (req.method === 'POST' && url.pathname === '/router/delete') {
      const body = await parseBody(req);
      const result = await retriever.deleteDocuments(body.ids || []);
      return sendJson(res, 200, result);
    }

    return sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error('Router error:', error.message);
    return sendJson(res, 500, { error: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`🔌 Starting MCP router on http://${HOST}:${PORT}`);
  initializeRetriever();
});

process.on('SIGINT', () => {
  console.log('\n👋 Shutting down router');
  server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
