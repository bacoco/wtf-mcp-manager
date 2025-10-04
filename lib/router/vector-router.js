import { createHash } from 'crypto';

/**
 * VectorRouter
 * Embeds MCP metadata into a vector store (Qdrant/Chroma) with a memory fallback
 */
export class VectorRouter {
  constructor(options = {}) {
    this.collectionName = options.collectionName || 'wtf-mcp-tools';
    this.dimensions = options.dimensions || 128;
    this.clientFactory = options.clientFactory;
    this.options = options;

    this.vectorClient = null;
    this.mode = 'uninitialized';
    this.memoryStore = new Map();
    this.lastSignature = null;
    this.lastError = null;

    this.initialized = false;
    this.initializing = null;
  }

  /**
   * Initialize the router (attempt remote connection, otherwise fallback to memory)
   */
  async ensureReady() {
    if (this.initialized) {
      return;
    }

    if (!this.initializing) {
      this.initializing = this.initialize();
    }

    await this.initializing;
  }

  async initialize() {
    try {
      if (this.clientFactory) {
        const candidate = await this.clientFactory();
        if (candidate && candidate.client) {
          this.vectorClient = candidate.client;
          this.mode = candidate.type || 'vector';

          try {
            await this.ensureRemoteCollection();
            this.initialized = true;
            return;
          } catch (error) {
            this.lastError = error;
            this.vectorClient = null;
            this.mode = 'unavailable';
          }
        }
      }

      if (await this.tryConnectQdrant()) {
        this.initialized = true;
        return;
      }

      if (await this.tryConnectChroma()) {
        this.initialized = true;
        return;
      }
    } catch (error) {
      this.lastError = error;
    }

    // Default to in-memory store
    this.vectorClient = null;
    this.mode = 'memory';
    this.initialized = true;
  }

  async tryConnectQdrant() {
    const url = this.options.qdrantUrl || process.env.QDRANT_URL || process.env.QDRANT_HOST;
    if (!url) {
      return false;
    }

    try {
      const module = await import('@qdrant/js-client-rest');
      const QdrantClient = module.QdrantClient || module.default;
      if (!QdrantClient) {
        return false;
      }

      const apiKey = this.options.qdrantApiKey || process.env.QDRANT_API_KEY;
      this.vectorClient = new QdrantClient({ url, apiKey });
      this.mode = 'qdrant';

      await this.ensureRemoteCollection();
      return true;
    } catch (error) {
      this.lastError = error;
      this.vectorClient = null;
      this.mode = 'memory';
      return false;
    }
  }

  async tryConnectChroma() {
    const url = this.options.chromaUrl || process.env.CHROMA_URL || process.env.CHROMA_HOST;
    if (!url) {
      return false;
    }

    try {
      const module = await import('chromadb');
      const ChromaClient = module.ChromaClient || module.default;
      if (!ChromaClient) {
        return false;
      }

      const client = new ChromaClient({ path: url });
      this.vectorClient = await client.getOrCreateCollection({
        name: this.collectionName,
        metadata: { source: 'wtf-mcp-manager' },
        embeddingFunction: {
          embedDocuments: docs => docs.map(doc => this.computeEmbedding(doc)),
          embedQuery: doc => this.computeEmbedding(doc)
        }
      });
      this.mode = 'chroma';
      return true;
    } catch (error) {
      this.lastError = error;
      this.vectorClient = null;
      this.mode = 'memory';
      return false;
    }
  }

  async ensureRemoteCollection() {
    if (this.mode === 'qdrant' && this.vectorClient) {
      try {
        await this.vectorClient.getCollection(this.collectionName);
      } catch (error) {
        if (error?.status === 404 || error?.response?.status === 404) {
          await this.vectorClient.createCollection(this.collectionName, {
            vectors: {
              size: this.dimensions,
              distance: 'Cosine'
            }
          });
        } else {
          throw error;
        }
      }
    }
  }

  getSourceLabel() {
    return this.mode;
  }

  isAvailable() {
    return this.mode !== 'unavailable';
  }

  async ingestTools(tools = [], options = {}) {
    await this.ensureReady();

    if (!Array.isArray(tools) || tools.length === 0) {
      return { ingested: 0, mode: this.mode, skipped: true };
    }

    const normalizedTools = tools
      .map(tool => this.normalizeTool(tool))
      .filter(Boolean);

    if (normalizedTools.length === 0) {
      return { ingested: 0, mode: this.mode, skipped: true };
    }

    const signature = this.createSignature(normalizedTools);
    if (!options.force && signature === this.lastSignature) {
      return { ingested: 0, mode: this.mode, skipped: true };
    }

    if (this.mode === 'qdrant' && this.vectorClient) {
      try {
        const points = normalizedTools.map(tool => ({
          id: tool.id,
          vector: this.computeEmbedding(this.serializeTool(tool)),
          payload: tool
        }));
        await this.vectorClient.upsert(this.collectionName, { points });
        this.lastSignature = signature;
        return { ingested: normalizedTools.length, mode: this.mode };
      } catch (error) {
        this.lastError = error;
        this.vectorClient = null;
        this.mode = 'memory';
      }
    }

    if (this.mode === 'chroma' && this.vectorClient) {
      try {
        const ids = normalizedTools.map(tool => tool.id);
        const documents = normalizedTools.map(tool => this.serializeTool(tool));
        const metadatas = normalizedTools.map(tool => tool);

        if (typeof this.vectorClient.upsert === 'function') {
          await this.vectorClient.upsert({ ids, documents, metadatas });
        } else if (typeof this.vectorClient.add === 'function') {
          await this.vectorClient.add({ ids, documents, metadatas });
        }

        this.lastSignature = signature;
        return { ingested: normalizedTools.length, mode: this.mode };
      } catch (error) {
        this.lastError = error;
        this.vectorClient = null;
        this.mode = 'memory';
      }
    }

    // Memory fallback ingestion
    this.memoryStore.clear();
    normalizedTools.forEach(tool => {
      const vector = this.computeEmbedding(this.serializeTool(tool));
      this.memoryStore.set(tool.id, { vector, metadata: tool });
    });

    this.lastSignature = signature;
    if (this.mode === 'uninitialized') {
      this.mode = 'memory';
    }

    return { ingested: normalizedTools.length, mode: this.mode };
  }

  async query(query, limit = 5) {
    await this.ensureReady();

    const sanitizedQuery = (query || '').trim();
    if (!sanitizedQuery) {
      return [];
    }

    const maxResults = Math.max(1, Math.min(limit || 5, 50));

    if (this.mode === 'qdrant' && this.vectorClient) {
      try {
        const vector = this.computeEmbedding(sanitizedQuery);
        const response = await this.vectorClient.search(this.collectionName, {
          vector,
          limit: maxResults
        });

        if (Array.isArray(response)) {
          return response.map(point => {
            const payload = this.normalizeTool(point.payload || {});
            return {
              ...payload,
              score: typeof point.score === 'number' ? point.score : 0,
              source: this.mode
            };
          });
        }
      } catch (error) {
        this.lastError = error;
        this.vectorClient = null;
        this.mode = 'memory';
      }
    }

    if (this.mode === 'chroma' && this.vectorClient) {
      try {
        const response = await this.vectorClient.query({
          queryTexts: [sanitizedQuery],
          nResults: maxResults
        });

        const ids = response.ids?.[0] || [];
        const metadatas = response.metadatas?.[0] || [];
        const distances = response.distances?.[0] || [];
        const results = [];

        for (let index = 0; index < ids.length; index++) {
          const metadata = this.normalizeTool({ id: ids[index], ...(metadatas[index] || {}) });
          results.push({
            ...metadata,
            score: typeof distances[index] === 'number' ? distances[index] : 0,
            source: this.mode
          });
        }

        if (results.length > 0) {
          return results;
        }
      } catch (error) {
        this.lastError = error;
        this.vectorClient = null;
        this.mode = 'memory';
      }
    }

    // Memory search fallback
    const queryVector = this.computeEmbedding(sanitizedQuery);
    const scored = [];

    for (const { vector, metadata } of this.memoryStore.values()) {
      const score = this.cosineSimilarity(queryVector, vector);
      scored.push({ metadata, score });
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map(({ metadata, score }) => ({
        ...metadata,
        score,
        source: this.mode === 'unavailable' ? 'fallback' : this.mode
      }));
  }

  normalizeTool(tool) {
    if (!tool) {
      return null;
    }

    const inferredId = tool.id || this.slugify(tool.name || tool.package || tool.command || `tool-${Math.random()}`);
    const categories = Array.isArray(tool.categories)
      ? tool.categories
      : tool.categories
        ? [tool.categories]
        : [];

    const requiredEnv = Array.isArray(tool.requiredEnv)
      ? tool.requiredEnv
      : tool.requiredEnv
        ? [tool.requiredEnv]
        : [];

    return {
      id: inferredId,
      name: tool.name || this.formatNameFromId(inferredId),
      description: tool.description || '',
      package: tool.package || '',
      categories,
      command: tool.command,
      args: tool.args,
      requiredEnv,
      source: tool.source || tool.origin || 'registry'
    };
  }

  formatNameFromId(id) {
    return (id || '')
      .split(/[-_]/)
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  slugify(value) {
    return (value || '')
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      || 'tool';
  }

  serializeTool(tool) {
    const sections = [
      tool.id,
      tool.name,
      tool.description,
      Array.isArray(tool.categories) ? tool.categories.join(' ') : '',
      Array.isArray(tool.requiredEnv) ? tool.requiredEnv.join(' ') : '',
      Array.isArray(tool.args) ? tool.args.join(' ') : ''
    ];

    if (tool.package) {
      sections.push(tool.package);
    }

    if (tool.command) {
      sections.push(tool.command);
    }

    return sections.filter(Boolean).join(' ');
  }

  createSignature(tools) {
    const hash = createHash('sha256');
    const sorted = [...tools].sort((a, b) => a.id.localeCompare(b.id));

    for (const tool of sorted) {
      hash.update(tool.id);
      hash.update('|');
      hash.update(tool.name || '');
      hash.update('|');
      hash.update(tool.description || '');
    }

    return hash.digest('hex');
  }

  computeEmbedding(text) {
    const tokens = (text || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);

    const vector = new Array(this.dimensions).fill(0);

    tokens.forEach(token => {
      const hash = this.simpleHash(token);
      const index = hash % this.dimensions;
      vector[index] += 1;
    });

    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
    return vector.map(value => value / norm);
  }

  simpleHash(token) {
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      hash = (hash * 31 + token.charCodeAt(i)) >>> 0;
    }
    return hash;
  }

  cosineSimilarity(a, b) {
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB) || 1;
    return dot / denominator;
  }
}

export default VectorRouter;
