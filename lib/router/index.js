import { RouterConfig } from './config.js';
import { MetadataNormalizer } from './metadata-normalizer.js';
import { EmbeddingProviderFactory } from './embeddings.js';
import { VectorStoreFactory } from './vector-store.js';
import { RouterIngestor } from './ingestor.js';
import { RouterRetriever } from './retriever.js';
import { QueryCache } from './cache.js';

export class MCPRouterService {
  constructor(options = {}) {
    this.config = options.config || new RouterConfig(options);
    this.normalizer = new MetadataNormalizer();
    this.cache = new QueryCache(this.config.cacheTtlMs, options.cacheSize || 200);
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    this.embeddingProvider = await EmbeddingProviderFactory.create({
      embeddingProvider: this.config.embeddingProvider,
      apiKey: this.config.embeddingApiKey,
      model: this.config.embeddingModel,
      endpoint: this.config.embeddingEndpoint,
      dimension: this.config.embeddingDimension
    });
    this.vectorStore = await VectorStoreFactory.create(this.config);
    this.ingestor = new RouterIngestor({
      config: this.config,
      vectorStore: this.vectorStore,
      embeddingProvider: this.embeddingProvider,
      normalizer: this.normalizer
    });
    this.retriever = new RouterRetriever({
      config: this.config,
      vectorStore: this.vectorStore,
      embeddingProvider: this.embeddingProvider
    });
    this.initialized = true;

    if (this.config.autoIngest) {
      try {
        await this.ingestor.ingest();
      } catch (error) {
        console.warn('Automatic router ingestion failed:', error.message);
      }
    }
  }

  async ingest(options = {}) {
    await this.init();
    const start = Date.now();
    const result = await this.ingestor.ingest(options);
    this.#emit('ingest', {
      durationMs: Date.now() - start,
      count: result.count,
      sources: result.sources
    });
    return result;
  }

  async retrieve(query, options = {}) {
    await this.init();
    const cacheKey = JSON.stringify({ query, options });
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.#emit('retrieve', {
        query,
        durationMs: 0,
        topK: options.topK || this.config.defaultTopK,
        count: cached.length,
        cached: true
      });
      return { results: cached, cached: true, durationMs: 0 };
    }

    const start = Date.now();
    const results = await this.retriever.retrieve(query, options);
    this.cache.set(cacheKey, results);

    const durationMs = Date.now() - start;
    this.#emit('retrieve', {
      query,
      durationMs,
      topK: options.topK || this.config.defaultTopK,
      count: results.length,
      cached: false
    });

    return { results, cached: false, durationMs };
  }

  #emit(event, payload) {
    if (!this.config.observability?.enabled) return;
    const message = {
      component: 'mcp-router',
      event,
      timestamp: new Date().toISOString(),
      ...payload
    };

    switch (this.config.observability.emitter) {
      case 'stdout':
      case 'console':
      default:
        console.debug('[router]', JSON.stringify(message));
        break;
    }
  }
}

export { RouterConfig, RouterIngestor, RouterRetriever, MetadataNormalizer };
