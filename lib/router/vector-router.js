import { createHash } from 'crypto';

/**
 * Simple vector router for MCP tool metadata backed by Qdrant.
 * Uses a lightweight hashing-based embedding to avoid external dependencies.
 */
export class VectorRouter {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || process.env.QDRANT_URL || 'http://localhost:6333';
    this.collection = options.collection || 'mcp_tools';
    this.dimensions = options.dimensions || 384;
    this.distance = options.distance || 'Cosine';
    this.fetch = options.fetch || globalThis.fetch?.bind(globalThis);
    this.logger = options.logger || console;
    this.initialized = false;
    this.available = true;
    this.lastError = null;
  }

  async ensureCollection() {
    if (!this.fetch) {
      throw new Error('Fetch implementation required for VectorRouter');
    }

    if (this.initialized) {
      return true;
    }

    const collectionUrl = `${this.baseUrl}/collections/${this.collection}`;

    try {
      const response = await this.fetch(collectionUrl);

      if (response.ok) {
        this.initialized = true;
        this.available = true;
        return true;
      }

      if (response.status === 404) {
        const createResponse = await this.fetch(collectionUrl, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            vectors: {
              size: this.dimensions,
              distance: this.distance
            }
          })
        });

        if (!createResponse.ok) {
          const message = await createResponse.text().catch(() => '');
          throw new Error(`Failed to create vector collection: ${createResponse.status} ${message}`);
        }

        this.initialized = true;
        this.available = true;
        return true;
      }

      const message = await response.text().catch(() => '');
      throw new Error(`Unexpected response from vector store: ${response.status} ${message}`);
    } catch (error) {
      this.available = false;
      this.lastError = error;
      throw error;
    }
  }

  buildEmbeddingFromText(text = '') {
    const normalized = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);

    if (normalized.length === 0) {
      return new Array(this.dimensions).fill(0);
    }

    const vector = new Array(this.dimensions).fill(0);

    for (const token of normalized) {
      const digest = createHash('sha256').update(token).digest();
      const index = digest.readUInt32BE(0) % this.dimensions;
      const sign = (digest[4] & 1) === 0 ? 1 : -1;
      vector[index] += sign;
    }

    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
    return vector.map(value => Number((value / norm).toFixed(6)));
  }

  stringifyRecord(record) {
    const segments = [record.name || '', record.description || ''];

    if (Array.isArray(record.categories) && record.categories.length > 0) {
      segments.push(record.categories.join(' '));
    }

    if (record.schema) {
      segments.push(JSON.stringify(record.schema));
    }

    if (Array.isArray(record.examples) && record.examples.length > 0) {
      for (const example of record.examples) {
        segments.push(typeof example === 'string' ? example : JSON.stringify(example));
      }
    }

    if (record.metadata) {
      segments.push(JSON.stringify(record.metadata));
    }

    return segments.join('\n');
  }

  async upsertTools(records = []) {
    if (!Array.isArray(records) || records.length === 0) {
      return false;
    }

    try {
      await this.ensureCollection();

      const points = records.map(record => ({
        id: record.id,
        vector: this.buildEmbeddingFromText(this.stringifyRecord(record)),
        payload: {
          record,
          type: record.type,
          name: record.name,
          categories: record.categories || [],
          source: record.source || null
        }
      }));

      const response = await this.fetch(`${this.baseUrl}/collections/${this.collection}/points`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ points })
      });

      if (!response.ok) {
        const message = await response.text().catch(() => '');
        throw new Error(`Failed to upsert points: ${response.status} ${message}`);
      }

      this.available = true;
      return true;
    } catch (error) {
      this.available = false;
      this.lastError = error;
      if (this.logger && typeof this.logger.warn === 'function') {
        this.logger.warn(`[VectorRouter] ${error.message}`);
      }
      return false;
    }
  }

  buildFilter(filter) {
    if (!filter) {
      return undefined;
    }

    const must = [];

    if (filter.type) {
      must.push({ key: 'type', match: { value: filter.type } });
    }

    if (Array.isArray(filter.categories) && filter.categories.length > 0) {
      must.push({ key: 'categories', match: { any: filter.categories } });
    }

    if (filter.source) {
      must.push({ key: 'source', match: { value: filter.source } });
    }

    return must.length > 0 ? { must } : undefined;
  }

  async query(query, { topK = 5, filter } = {}) {
    if (!query || !query.trim()) {
      return [];
    }

    try {
      await this.ensureCollection();

      const body = {
        vector: this.buildEmbeddingFromText(query),
        limit: topK,
        with_payload: true
      };

      const qdrantFilter = this.buildFilter(filter);
      if (qdrantFilter) {
        body.filter = qdrantFilter;
      }

      const response = await this.fetch(`${this.baseUrl}/collections/${this.collection}/points/search`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const message = await response.text().catch(() => '');
        throw new Error(`Vector search failed: ${response.status} ${message}`);
      }

      const data = await response.json();
      const hits = Array.isArray(data?.result) ? data.result : [];

      this.available = true;
      return hits.map(hit => ({
        id: hit.id,
        score: hit.score,
        payload: hit.payload?.record || hit.payload || null
      }));
    } catch (error) {
      this.available = false;
      this.lastError = error;
      if (this.logger && typeof this.logger.warn === 'function') {
        this.logger.warn(`[VectorRouter] ${error.message}`);
      }
      return null;
    }
  }
}
