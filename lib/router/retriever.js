const DEFAULT_TOP_K = 10;

class VectorStoreUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'VectorStoreUnavailableError';
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function resolveFetch(fetchImpl) {
  if (fetchImpl) {
    return fetchImpl;
  }

  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch.bind(globalThis);
  }

  throw new Error('A fetch implementation is required to use MCPVectorRetriever');
}

export class MCPVectorRetriever {
  constructor(options = {}) {
    const {
      endpoint = process.env.MCP_VECTOR_DB_URL,
      topK = process.env.MCP_VECTOR_DB_TOP_K,
      fetchImpl
    } = options;

    this.endpoint = endpoint;
    const parsedTopK = Number.parseInt(topK, 10);
    this.topK = Number.isFinite(parsedTopK) && parsedTopK > 0 ? parsedTopK : DEFAULT_TOP_K;
    this.fetch = resolveFetch(fetchImpl);
  }

  isEnabled() {
    return Boolean(this.endpoint);
  }

  async retrieve(query, options = {}) {
    if (!query || !query.trim()) {
      return [];
    }

    if (!this.isEnabled()) {
      throw new VectorStoreUnavailableError('Vector store endpoint not configured');
    }

    const limit = Number.isFinite(options.topK) && options.topK > 0 ? options.topK : this.topK;
    const payload = {
      query,
      topK: limit
    };

    let response;
    try {
      response = await this.fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      throw new VectorStoreUnavailableError(`Failed to reach vector store: ${error.message}`);
    }

    if (!response.ok) {
      let details = '';
      try {
        details = await response.text();
      } catch (error) {
        details = error.message;
      }
      const statusLine = `${response.status} ${response.statusText}`.trim();
      const suffix = details ? ` - ${details}` : '';
      throw new VectorStoreUnavailableError(`Vector store responded with ${statusLine}${suffix}`);
    }

    let data;
    try {
      data = await response.json();
    } catch (error) {
      throw new VectorStoreUnavailableError(`Vector store returned invalid JSON: ${error.message}`);
    }

    const rawResults = Array.isArray(data.results)
      ? data.results
      : Array.isArray(data.matches)
        ? data.matches
        : [];

    return rawResults.slice(0, limit).map((match, index) => this.mapResult(match, index));
  }

  mapResult(match, index) {
    const metadata = isPlainObject(match.metadata) ? match.metadata : {};
    const name = match.name ?? metadata.name ?? match.id ?? `mcp-${index}`;
    const description = match.description ?? metadata.description ?? '';

    const scoreCandidates = [
      match.score,
      match.similarity,
      match.relevance,
      metadata.score,
      metadata.similarity,
      metadata.relevance
    ];

    const relevance = scoreCandidates.find(value => typeof value === 'number' && Number.isFinite(value)) ?? 0;

    const result = {
      id: match.id ?? metadata.id ?? name,
      name,
      description,
      relevance,
      score: relevance,
      source: match.source ?? metadata.source ?? 'vector'
    };

    if (metadata && Object.keys(metadata).length > 0) {
      result.metadata = metadata;
    }

    return result;
  }
}

export { VectorStoreUnavailableError };
