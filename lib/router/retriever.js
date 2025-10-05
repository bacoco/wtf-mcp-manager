const DEFAULT_TOP_K = 10;

function normalizeString(value) {
  return typeof value === 'string' ? value : '';
}

function splitTerms(text) {
  return normalizeString(text)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

const TERM_SYNONYMS = [
  { target: 'database', terms: ['db', 'database', 'databases', 'sql', 'postgres', 'postgresql', 'mysql', 'schema', 'data'] },
  { target: 'auth', terms: ['auth', 'authentication', 'authorize', 'authorization', 'identity', 'login'] },
  { target: 'security', terms: ['security', 'secure', 'vulnerability', 'vulnerabilities', 'threat', 'scan', 'auditing'] },
  { target: 'automation', terms: ['automation', 'automate', 'headless', 'browser', 'browsers', 'playwright', 'puppeteer'] },
  { target: 'testing', terms: ['testing', 'tests', 'test', 'qa', 'end-to-end', 'e2e'] },
  { target: 'api', terms: ['api', 'apis', 'rest', 'endpoint', 'http', 'integration'] }
];

const synonymLookup = TERM_SYNONYMS.reduce((map, group) => {
  for (const term of group.terms) {
    map.set(term, group.target);
  }
  return map;
}, new Map());

function expandTerms(query) {
  const baseTerms = splitTerms(query);
  const expanded = new Set(baseTerms);
  for (const term of baseTerms) {
    const synonym = synonymLookup.get(term);
    if (synonym) {
      expanded.add(synonym);
    }
  }
  return Array.from(expanded);
}

function scoreDocument(doc, terms) {
  if (!terms.length) return 0;

  const name = normalizeString(doc.name).toLowerCase();
  const id = normalizeString(doc.id).toLowerCase();
  const description = normalizeString(doc.description).toLowerCase();
  const categories = (doc.categories || []).map(cat => normalizeString(cat).toLowerCase());
  const tags = (doc.tags || []).map(tag => normalizeString(tag).toLowerCase());

  let score = 0;

  for (const term of terms) {
    if (!term) continue;
    const exactCategoryMatch = categories.includes(term);
    const exactTagMatch = tags.includes(term);

    if (id.includes(term)) score += 5;
    if (name.includes(term)) score += 4;
    if (description.includes(term)) score += 2;
    if (exactCategoryMatch) score += 5;
    if (exactTagMatch) score += 4;

    if (!exactCategoryMatch) {
      score += categories.some(cat => cat.includes(term)) ? 3 : 0;
    }

    if (!exactTagMatch) {
      score += tags.some(tag => tag.includes(term)) ? 2 : 0;
    }
  }

  return score;
}

function normalizeDocument(id, info = {}) {
  if (!id && info.id) id = info.id;
  return {
    id,
    name: info.name || id,
    description: info.description || '',
    categories: info.categories || [],
    tags: info.tags || info.keywords || [],
    source: info.source || 'registry',
    raw: { id, ...info }
  };
}

export class ToolRetriever {
  constructor(options = {}) {
    this.documents = [];
    this.topK = options.topK || DEFAULT_TOP_K;
    this.logger = options.logger || console;
  }

  setDocuments(documents) {
    if (!documents) {
      this.documents = [];
      return;
    }

    if (Array.isArray(documents)) {
      this.documents = documents.map(doc => normalizeDocument(doc.id, doc));
      return;
    }

    if (typeof documents === 'object') {
      this.documents = Object.entries(documents).map(([id, info]) => normalizeDocument(id, info));
      return;
    }

    this.logger?.warn?.('Unsupported document format passed to ToolRetriever#setDocuments');
    this.documents = [];
  }

  async retrieve(query, options = {}) {
    const text = normalizeString(query).trim();
    if (!text) return [];

    const terms = expandTerms(text);
    const limit = Math.max(1, options.topK || options.limit || this.topK);

    const scored = this.documents
      .map(doc => ({
        doc,
        score: scoreDocument(doc, terms)
      }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || a.doc.name.localeCompare(b.doc.name));

    return scored.slice(0, limit).map(item => ({
      id: item.doc.id,
      name: item.doc.name,
      description: item.doc.description,
      categories: item.doc.categories,
      tags: item.doc.tags,
      source: item.doc.source,
      relevance: item.score,
      raw: item.doc.raw
    }));
  }
}

export class VectorStoreUnavailableError extends Error {
  constructor(message = 'Vector store endpoint is not configured') {
    super(message);
    this.name = 'VectorStoreUnavailableError';
  }
}

export class MCPVectorRetriever {
  constructor(options = {}) {
    this.endpoint = options.endpoint || options.url || null;
    this.topK = options.topK || DEFAULT_TOP_K;
    this.fetch = options.fetchImpl || globalThis.fetch?.bind(globalThis) || null;
    this.defaultHeaders = options.headers || {};
    this.timeoutMs = options.timeoutMs || 10000;
    this.logger = options.logger || console;
  }

  async retrieve(query, options = {}) {
    const text = typeof query === 'string' ? query : query?.query;
    const trimmed = normalizeString(text).trim();
    if (!trimmed) {
      return [];
    }

    if (!this.endpoint) {
      throw new VectorStoreUnavailableError('MCP vector store endpoint is not configured');
    }

    if (typeof this.fetch !== 'function') {
      throw new VectorStoreUnavailableError('Fetch implementation is not available for MCPVectorRetriever');
    }

    const topK = Math.max(1, options.topK || options.limit || this.topK);

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), this.timeoutMs) : null;

    try {
      const response = await this.fetch(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...this.defaultHeaders },
        body: JSON.stringify({ query: trimmed, topK, ...options.payload }),
        signal: controller?.signal
      });

      if (!response?.ok) {
        this.logger?.warn?.(`MCP vector retriever request failed: ${response?.status} ${response?.statusText || ''}`.trim());
        throw new Error(`Vector store responded with status ${response?.status}`);
      }

      const data = await response.json();
      const results = this.#extractResults(data);

      return results.slice(0, topK).map(item => this.#normalizeResult(item));
    } catch (error) {
      if (error.name === 'AbortError') {
        this.logger?.warn?.('MCP vector retriever request timed out');
      }
      if (error instanceof VectorStoreUnavailableError) throw error;
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  #extractResults(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.results)) return payload.results;
    if (Array.isArray(payload.result)) return payload.result;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.items)) return payload.items;
    return [];
  }

  #normalizeResult(item = {}) {
    const metadata = item.metadata || {};
    const id = item.id || metadata.id || item.name;
    const name = item.name || metadata.name || id;
    const description = item.description || metadata.description || '';
    const categories = metadata.categories || item.categories || [];
    const tags = metadata.tags || item.tags || [];
    const relevance = typeof item.score === 'number'
      ? item.score
      : (typeof item.relevance === 'number' ? item.relevance : 0);

    return {
      id,
      name,
      description,
      categories,
      tags,
      relevance,
      metadata,
      raw: item
    };
  }
}

export class RouterRetriever {
  constructor({ config, vectorStore, embeddingProvider } = {}) {
    this.config = config;
    this.vectorStore = vectorStore;
    this.embeddingProvider = embeddingProvider;
  }

  async retrieve(query, options = {}) {
    if (!query) return [];
    const [embedding] = await this.embeddingProvider.embed([query]);
    const matches = await this.vectorStore.query(embedding, {
      topK: options.topK || this.config?.defaultTopK,
      filter: options.filter
    });

    return matches.map(match => this.#toResult(match));
  }

  #toResult(match) {
    const metadata = match.metadata || {};
    return {
      id: match.id,
      score: match.score,
      name: match.name || metadata.name,
      description: match.description || metadata.description,
      source: match.source || metadata.source,
      categories: metadata.categories || [],
      tags: metadata.tags || [],
      command: metadata.command,
      args: metadata.args,
      env: metadata.env,
      sampleCalls: metadata.sampleCalls || [],
      schema: metadata.schema,
      sourceId: metadata.sourceId,
      raw: metadata.raw
    };
  }
}
