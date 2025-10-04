import http from 'http';
import { fileURLToPath } from 'url';
import { RouterRetriever } from './retriever.js';

function resolvePort(portValue) {
  if (!portValue) return 3000;
  const parsed = parseInt(portValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3000;
}

export class RouterHTTPServer {
  constructor(options = {}) {
    this.port = resolvePort(options.port || process.env.ROUTER_HTTP_PORT || process.env.PORT);
    this.host = options.host || process.env.ROUTER_HTTP_HOST || '0.0.0.0';
    this.corsOrigin = options.corsOrigin || process.env.ROUTER_HTTP_CORS || '*';
    this.retriever = options.retriever || new RouterRetriever(options.retrieverOptions || {});
    this.logger = options.logger || console;

    this.server = http.createServer(this.handleRequest.bind(this));
  }

  async start() {
    if (this.isListening) return;

    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.port, this.host, () => {
        this.isListening = true;
        this.logger.info?.(`🚀 WTF Router HTTP server listening on http://${this.host}:${this.port}`)
          || console.log(`🚀 WTF Router HTTP server listening on http://${this.host}:${this.port}`);
        resolve();
      });
    });
  }

  async stop() {
    if (!this.isListening) return;

    await new Promise((resolve, reject) => {
      this.server.close(err => {
        if (err) return reject(err);
        this.isListening = false;
        resolve();
      });
    });
  }

  async handleRequest(req, res) {
    try {
      if (this.handleCors(req, res)) {
        return;
      }

      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

      if (req.method === 'GET' && url.pathname === '/health') {
        return this.sendJSON(res, 200, { status: 'ok' });
      }

      if (req.method === 'POST' && url.pathname === '/router/query') {
        const body = await this.parseBody(req);
        const query = body?.query;
        const options = {
          limit: body?.limit || body?.topK,
          filter: body?.filter,
          metadata: body?.metadata
        };

        if (!query || typeof query !== 'string' || !query.trim()) {
          return this.sendJSON(res, 400, { error: 'Query field is required' });
        }

        try {
          const results = await this.retriever.query(query, options);
          return this.sendJSON(res, 200, { results });
        } catch (error) {
          this.logger.error?.('Router retriever error:', error) || console.error('Router retriever error:', error);
          return this.sendJSON(res, 500, { error: 'Router retrieval failed' });
        }
      }

      return this.sendJSON(res, 404, { error: 'Not Found' });
    } catch (error) {
      this.logger.error?.('Router HTTP handler error:', error) || console.error('Router HTTP handler error:', error);
      return this.sendJSON(res, 500, { error: 'Internal Server Error' });
    }
  }

  handleCors(req, res) {
    const originHeader = req.headers.origin;
    const allowedOrigins = this.corsOrigin === '*'
      ? ['*']
      : String(this.corsOrigin)
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);

    const allowOrigin = allowedOrigins.includes('*')
      ? '*'
      : (originHeader && allowedOrigins.includes(originHeader) ? originHeader : null);

    if (allowOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowOrigin);
      res.setHeader('Vary', 'Origin');
    }

    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return true;
    }

    return false;
  }

  async parseBody(req) {
    return await new Promise((resolve, reject) => {
      const chunks = [];

      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => {
        if (chunks.length === 0) {
          return resolve({});
        }

        try {
          const raw = Buffer.concat(chunks).toString('utf-8');
          if (!raw) return resolve({});
          resolve(JSON.parse(raw));
        } catch (error) {
          reject(error);
        }
      });
      req.on('error', reject);
    });
  }

  sendJSON(res, statusCode, data) {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json');
    if (!res.getHeader('Access-Control-Allow-Origin') && this.corsOrigin === '*') {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.end(JSON.stringify(data));
  }
}

export async function createServer(options = {}) {
  const server = new RouterHTTPServer(options);
  await server.start();
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = new RouterHTTPServer();
  server.start().catch(error => {
    console.error('Failed to start Router HTTP server:', error);
    process.exit(1);
  });

  const shutdown = async () => {
    try {
      await server.stop();
    } catch (error) {
      console.error('Error shutting down Router HTTP server:', error);
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
