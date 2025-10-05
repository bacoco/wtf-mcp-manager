import { MCPRegistry } from '../registry.js';

const DEFAULT_TOP_K = parseInt(process.env.ROUTER_TOP_K || '10', 10);
const DEFAULT_TIMEOUT = parseInt(process.env.ROUTER_HTTP_TIMEOUT || '10000', 10);

function normalizeBaseUrl(url) {
  if (!url) return null;
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function uniqueById(results = []) {
  const seen = new Set();
  return results.filter(result => {
    const id = result?.id || result?.name;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export class RouterRetriever {
  constructor(options = {}) {
    this.registry = options.registry || new MCPRegistry();
    this.vectorUrl = options.vectorUrl || process.env.ROUTER_VECTOR_URL || process.env.VECTOR_DB_URL;
    this.collection = options.collection || process.env.ROUTER_VECTOR_COLLECTION || 'wtf-mcp-router';
    this.embedUrl = options.embedUrl || process.env.ROUTER_EMBEDDINGS_URL;
    this.embedApiKey = options.embedApiKey || process.env.ROUTER_EMBEDDINGS_API_KEY;
    this.embedModel = options.embedModel || process.env.ROUTER_EMBEDDINGS_MODEL;
    this.topK = options.topK || DEFAULT_TOP_K;
    this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT;
    this.logger = options.logger || console;
    this.fallback = options.fallback || null;
  }

  async query(queryInput, options = {}) {
    const query = typeof queryInput === 'string' ? queryInput : queryInput?.query || '';
    if (!query || !query.trim()) {
      throw new Error('Query text is required for router retrieval');
    }

    const limit = Math.max(1, options.limit || options.topK || queryInput?.limit || this.topK);
    const registryText = options.registryText || queryInput?.registryText;
    const availableMCPs = options.availableMCPs || queryInput?.availableMCPs;
    const filter = options.filter || queryInput?.filter;
    const metadata = options.metadata || queryInput?.metadata;

    const vectorResults = await this.queryVectorDB(query, { limit, filter, metadata });
    if (Array.isArray(vectorResults) && vectorResults.length > 0) {
      return uniqueById(vectorResults).slice(0, limit);
    }

    const registryTextResults = this.searchRegistryText(query, registryText, limit);
    if (registryTextResults.length > 0) {
      return uniqueById(registryTextResults).slice(0, limit);
    }

    if (this.fallback) {
      try {
        const fallbackResults = await this.fallback(query, limit);
        if (Array.isArray(fallbackResults) && fallbackResults.length > 0) {
          return uniqueById(fallbackResults).slice(0, limit);
        }
      } catch (error) {
        this.logger?.warn?.('Router fallback handler threw an error:', error);
      }
    }

    return uniqueById(this.registryFallback(query, limit, availableMCPs));
  }

  async queryVectorDB(query, { limit, filter, metadata } = {}) {
    if (!this.vectorUrl) return null;

    const baseUrl = normalizeBaseUrl(this.vectorUrl);
    if (!baseUrl) return null;

    const embedding = await this.getEmbedding(query);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const endpointBase = `${baseUrl}/collections/${this.collection}/points`;
      let url;
      let body;

      if (embedding && Array.isArray(embedding)) {
        url = `${endpointBase}/search`;
        body = {
          vector: embedding,
          limit,
          with_payload: true,
          filter
        };
      } else {
        url = `${endpointBase}/scroll`;
        body = {
          filter: this.buildFullTextFilter(query, filter),
          limit,
          with_payload: true,
          with_vectors: false
        };
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        this.logger?.warn?.(`Router vector DB request failed: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json();
      const points = Array.isArray(data.result) ? data.result : (data.points || []);

      return points.map(point => this.formatVectorResult(point, metadata)).filter(Boolean);
    } catch (error) {
      if (error.name === 'AbortError') {
        this.logger?.warn?.('Router vector DB request timed out');
      } else {
        this.logger?.warn?.('Router vector DB request error:', error);
      }
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getEmbedding(text) {
    if (!this.embedUrl) return null;

    try {
      const headers = { 'content-type': 'application/json' };
      if (this.embedApiKey) {
        headers.Authorization = `Bearer ${this.embedApiKey}`;
      }

      const body = { input: text };
      if (this.embedModel) {
        body.model = this.embedModel;
      }

      const response = await fetch(this.embedUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        this.logger?.warn?.(`Embedding request failed: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json();
      return this.extractEmbedding(data);
    } catch (error) {
      this.logger?.warn?.('Embedding request error:', error);
      return null;
    }
  }

  extractEmbedding(data) {
    if (!data) return null;

    if (Array.isArray(data)) {
      const item = data[0];
      if (!item) return null;
      if (Array.isArray(item)) return item;
      if (Array.isArray(item.embedding)) return item.embedding;
    }

    if (Array.isArray(data.embedding)) {
      return data.embedding;
    }

    if (Array.isArray(data.vector)) {
      return data.vector;
    }

    if (Array.isArray(data.data) && data.data[0] && Array.isArray(data.data[0].embedding)) {
      return data.data[0].embedding;
    }

    return null;
  }

  buildFullTextFilter(query, filter = {}) {
    const filterClone = {
      must: [...(filter.must || [])],
      should: [...(filter.should || [])],
      must_not: [...(filter.must_not || [])]
    };

    filterClone.must.push({ key: 'text', match: { text: query } });
    return filterClone;
  }

  formatVectorResult(point, metadata = {}) {
    if (!point) return null;

    const payload = point.payload || {};
    const id = payload.id || payload.mcpId || point.id;
    const name = payload.name || payload.title || id;
    const description = payload.description || payload.text || '';
    const categories = payload.categories || payload.tags || [];
    const source = payload.source || 'vector';
    const score = typeof point.score === 'number' ? point.score : (payload.score || 0);

    const result = {
      id,
      name,
      description,
      categories,
      score,
      source
    };

    if (metadata.includePayload !== false) {
      result.payload = payload;
    }

    return result;
  }

  searchRegistryText(query, registryText, limit) {
    if (!registryText) return [];

    const queryLower = query.toLowerCase();
    const lines = registryText.split('\n');
    const results = [];

    for (const line of lines) {
      if (!line) continue;
      if (line.toLowerCase().includes(queryLower)) {
        const match = line.match(/@[\w-]+\/[\w-]+|[\w-]+-mcp|mcp-[\w-]+/);
        if (match) {
          results.push({
            id: match[0],
            name: match[0],
            description: line.trim(),
            score: 1,
            source: 'registry-text'
          });
        }
      }

      if (results.length >= limit) break;
    }

    return results;
  }

  registryFallback(query, limit, availableMCPs) {
    const keywords = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
    if (keywords.length === 0) return [];

    const mcps = availableMCPs || this.registry?.getAll?.() || {};
    const results = [];

    for (const [id, info] of Object.entries(mcps)) {
      let score = 0;

      for (const keyword of keywords) {
        if (info.name && info.name.toLowerCase().includes(keyword)) score += 3;
        if (info.description && info.description.toLowerCase().includes(keyword)) score += 2;
        if (Array.isArray(info.categories) && info.categories.some(cat => cat.toLowerCase().includes(keyword))) score += 2;
        if (id.includes(keyword)) score += 1;
      }

      if (score > 0) {
        results.push({
          id,
          name: info.name || id,
          description: info.description || '',
          categories: info.categories || [],
          score,
          source: 'registry'
        });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}

export default RouterRetriever;
