#!/usr/bin/env node
/**
 * Vector retriever for the WTF MCP router.
 * Provides utilities for embedding MCP metadata and
 * storing/searching vectors inside a Qdrant-compatible database.
 */

import fetch from 'node-fetch';

const DEFAULT_DIMENSIONS = 512;
const DEFAULT_COLLECTION = 'wtf-mcp-router';

export class VectorRetriever {
  constructor(options = {}) {
    this.vectorDbUrl = (options.vectorDbUrl || process.env.VECTOR_DB_URL || 'http://localhost:6333').replace(/\/$/, '');
    this.collection = options.collection || process.env.VECTOR_DB_COLLECTION || DEFAULT_COLLECTION;
    this.dimensions = options.dimensions || DEFAULT_DIMENSIONS;
    this.timeoutMs = options.timeoutMs || 5000;
    this.registry = options.registry;
    this.ready = false;
  }

  /**
   * Basic deterministic string hash. Adapted from Java's String.hashCode.
   */
  hashToken(token) {
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      hash = ((hash << 5) - hash) + token.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    return hash;
  }

  /**
   * Convert text into a fixed-size vector using hashed bag-of-words.
   */
  embedText(text) {
    const tokens = (text || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter(Boolean);

    if (tokens.length === 0) {
      return new Array(this.dimensions).fill(0);
    }

    const vector = new Array(this.dimensions).fill(0);

    tokens.forEach(token => {
      const index = Math.abs(this.hashToken(token)) % this.dimensions;
      vector[index] += 1;
    });

    // Normalize to unit length to make cosine similarity meaningful
    const norm = Math.sqrt(vector.reduce((acc, value) => acc + (value * value), 0));
    if (norm === 0) {
      return vector;
    }

    return vector.map(value => value / norm);
  }

  async fetchJson(path, { method = 'GET', body, headers = {} } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.vectorDbUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body,
        signal: controller.signal
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Vector DB request failed: ${response.status} ${response.statusText} ${text}`.trim());
      }

      if (response.status === 204) {
        return null;
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }

      return await response.text();
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Vector DB request timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async ensureCollection() {
    try {
      await this.fetchJson(`/collections/${this.collection}`);
      this.ready = true;
      return;
    } catch (error) {
      if (!/404/.test(error.message)) {
        throw error;
      }
    }

    const payload = {
      vectors: {
        size: this.dimensions,
        distance: 'Cosine'
      }
    };

    await this.fetchJson(`/collections/${this.collection}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });

    this.ready = true;
  }

  async ensureReady() {
    if (this.ready) return;
    await this.ensureCollection();
  }

  async upsertDocuments(documents = []) {
    if (!documents.length) {
      return { upserted: 0 };
    }

    await this.ensureReady();

    const points = documents.map(doc => {
      const vector = Array.isArray(doc.vector) ? doc.vector : this.embedText(doc.text || '');
      const payload = doc.metadata || {};
      if (doc.id && !payload.id) {
        payload.id = doc.id;
      }
      if (doc.name && !payload.name) {
        payload.name = doc.name;
      }
      if (doc.description && !payload.description) {
        payload.description = doc.description;
      }
      if (doc.categories && !payload.categories) {
        payload.categories = doc.categories;
      }

      return {
        id: doc.id || payload.id,
        vector,
        payload
      };
    });

    await this.fetchJson(`/collections/${this.collection}/points?wait=true`, {
      method: 'PUT',
      body: JSON.stringify({ points })
    });

    return { upserted: points.length };
  }

  async deleteDocuments(ids = []) {
    if (!ids.length) {
      return { deleted: 0 };
    }

    await this.ensureReady();

    await this.fetchJson(`/collections/${this.collection}/points/delete`, {
      method: 'POST',
      body: JSON.stringify({ points: ids })
    });

    return { deleted: ids.length };
  }

  async query({ query, topK = 10, filter = null, scoreThreshold = null } = {}) {
    await this.ensureReady();

    const vector = Array.isArray(query) ? query : this.embedText(query || '');

    const payload = {
      vector,
      limit: topK,
      with_payload: true,
      with_vector: false
    };

    if (filter) {
      payload.filter = filter;
    }

    if (typeof scoreThreshold === 'number') {
      payload.score_threshold = scoreThreshold;
    }

    const response = await this.fetchJson(`/collections/${this.collection}/points/search`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    const results = (response?.result || []).map(item => ({
      id: item.payload?.id || item.id,
      name: item.payload?.name || item.id,
      description: item.payload?.description || '',
      categories: item.payload?.categories || [],
      score: item.score,
      source: 'vector-db',
      payload: item.payload
    }));

    return results;
  }

  async health() {
    try {
      await this.ensureCollection();
      const stats = await this.fetchJson(`/collections/${this.collection}`);
      return {
        status: 'ready',
        collection: this.collection,
        vectors: stats?.result?.vectors_count ?? null
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  }

  async bootstrapRegistry({ force = false } = {}) {
    if (!this.registry) {
      return { bootstrapped: 0 };
    }

    await this.ensureReady();

    if (!force) {
      try {
        const info = await this.fetchJson(`/collections/${this.collection}`);
        const vectors = info?.result?.vectors_count || 0;
        if (vectors > 0) {
          return { bootstrapped: 0, skipped: true, existing: vectors };
        }
      } catch (error) {
        // Ignore and proceed
      }
    }

    const docs = Object.entries(this.registry.getAll()).map(([id, info]) => ({
      id: `mcp:${id}`,
      name: info.name,
      description: info.description,
      categories: info.categories || [],
      metadata: {
        id,
        name: info.name,
        description: info.description,
        categories: info.categories || [],
        package: info.package,
        command: info.command,
        args: info.args
      },
      text: `${info.name}\n${info.description || ''}\n${(info.categories || []).join(' ')}`
    }));

    const result = await this.upsertDocuments(docs);
    return { bootstrapped: result.upserted };
  }
}

export default VectorRetriever;
EOF
rm wtf-mcp-manager/lib/router/vector-retriever.js
cat <<'EOF' > wtf-mcp-manager/lib/router/vector-retriever.js
#!/usr/bin/env node
/**
 * Vector retriever for the WTF MCP router.
 * Provides utilities for embedding MCP metadata and
 * storing/searching vectors inside a Qdrant-compatible database.
 */

import fetch from 'node-fetch';

const DEFAULT_DIMENSIONS = 512;
const DEFAULT_COLLECTION = 'wtf-mcp-router';

export class VectorRetriever {
  constructor(options = {}) {
    this.vectorDbUrl = (options.vectorDbUrl || process.env.VECTOR_DB_URL || 'http://localhost:6333').replace(/\/$/, '');
    this.collection = options.collection || process.env.VECTOR_DB_COLLECTION || DEFAULT_COLLECTION;
    this.dimensions = options.dimensions || DEFAULT_DIMENSIONS;
    this.timeoutMs = options.timeoutMs || 5000;
    this.registry = options.registry;
    this.ready = false;
  }

  /**
   * Basic deterministic string hash. Adapted from Java's String.hashCode.
   */
  hashToken(token) {
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      hash = ((hash << 5) - hash) + token.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    return hash;
  }

  /**
   * Convert text into a fixed-size vector using hashed bag-of-words.
   */
  embedText(text) {
    const tokens = (text || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter(Boolean);

    if (tokens.length === 0) {
      return new Array(this.dimensions).fill(0);
    }

    const vector = new Array(this.dimensions).fill(0);

    tokens.forEach(token => {
      const index = Math.abs(this.hashToken(token)) % this.dimensions;
      vector[index] += 1;
    });

    // Normalize to unit length to make cosine similarity meaningful
    const norm = Math.sqrt(vector.reduce((acc, value) => acc + (value * value), 0));
    if (norm === 0) {
      return vector;
    }

    return vector.map(value => value / norm);
  }

  async fetchJson(path, { method = 'GET', body, headers = {} } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.vectorDbUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body,
        signal: controller.signal
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Vector DB request failed: ${response.status} ${response.statusText} ${text}`.trim());
      }

      if (response.status === 204) {
        return null;
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }

      return await response.text();
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Vector DB request timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async ensureCollection() {
    try {
      await this.fetchJson(`/collections/${this.collection}`);
      this.ready = true;
      return;
    } catch (error) {
      if (!/404/.test(error.message)) {
        throw error;
      }
    }

    const payload = {
      vectors: {
        size: this.dimensions,
        distance: 'Cosine'
      }
    };

    await this.fetchJson(`/collections/${this.collection}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });

    this.ready = true;
  }

  async ensureReady() {
    if (this.ready) return;
    await this.ensureCollection();
  }

  async upsertDocuments(documents = []) {
    if (!documents.length) {
      return { upserted: 0 };
    }

    await this.ensureReady();

    const points = documents.map(doc => {
      const vector = Array.isArray(doc.vector) ? doc.vector : this.embedText(doc.text || '');
      const payload = doc.metadata || {};
      if (doc.id && !payload.id) {
        payload.id = doc.id;
      }
      if (doc.name && !payload.name) {
        payload.name = doc.name;
      }
      if (doc.description && !payload.description) {
        payload.description = doc.description;
      }
      if (doc.categories && !payload.categories) {
        payload.categories = doc.categories;
      }

      return {
        id: doc.id || payload.id,
        vector,
        payload
      };
    });

    await this.fetchJson(`/collections/${this.collection}/points?wait=true`, {
      method: 'PUT',
      body: JSON.stringify({ points })
    });

    return { upserted: points.length };
  }

  async deleteDocuments(ids = []) {
    if (!ids.length) {
      return { deleted: 0 };
    }

    await this.ensureReady();

    await this.fetchJson(`/collections/${this.collection}/points/delete`, {
      method: 'POST',
      body: JSON.stringify({ points: ids })
    });

    return { deleted: ids.length };
  }

  async query({ query, topK = 10, filter = null, scoreThreshold = null } = {}) {
    await this.ensureReady();

    const vector = Array.isArray(query) ? query : this.embedText(query || '');

    const payload = {
      vector,
      limit: topK,
      with_payload: true,
      with_vector: false
    };

    if (filter) {
      payload.filter = filter;
    }

    if (typeof scoreThreshold === 'number') {
      payload.score_threshold = scoreThreshold;
    }

    const response = await this.fetchJson(`/collections/${this.collection}/points/search`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    const results = (response?.result || []).map(item => ({
      id: item.payload?.id || item.id,
      name: item.payload?.name || item.id,
      description: item.payload?.description || '',
      categories: item.payload?.categories || [],
      score: item.score,
      source: 'vector-db',
      payload: item.payload
    }));

    return results;
  }

  async health() {
    try {
      await this.ensureCollection();
      const stats = await this.fetchJson(`/collections/${this.collection}`);
      return {
        status: 'ready',
        collection: this.collection,
        vectors: stats?.result?.vectors_count ?? null
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  }

  async bootstrapRegistry({ force = false } = {}) {
    if (!this.registry) {
      return { bootstrapped: 0 };
    }

    await this.ensureReady();

    if (!force) {
      try {
        const info = await this.fetchJson(`/collections/${this.collection}`);
        const vectors = info?.result?.vectors_count || 0;
        if (vectors > 0) {
          return { bootstrapped: 0, skipped: true, existing: vectors };
        }
      } catch (error) {
        // Ignore and proceed
      }
    }

    const docs = Object.entries(this.registry.getAll()).map(([id, info]) => ({
      id: `mcp:${id}`,
      name: info.name,
      description: info.description,
      categories: info.categories || [],
      metadata: {
        id,
        name: info.name,
        description: info.description,
        categories: info.categories || [],
        package: info.package,
        command: info.command,
        args: info.args
      },
      text: `${info.name}\n${info.description || ''}\n${(info.categories || []).join(' ')}`
    }));

    const result = await this.upsertDocuments(docs);
    return { bootstrapped: result.upserted };
  }
}

export default VectorRetriever;
