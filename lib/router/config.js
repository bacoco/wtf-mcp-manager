export class RouterConfig {
  constructor(overrides = {}) {
    const env = process.env;

    this.projectRoot = overrides.projectRoot || env.ROUTER_PROJECT_ROOT || process.cwd();
    this.vectorStore = (overrides.vectorStore || env.ROUTER_VECTOR_STORE || 'memory').toLowerCase();
    this.vectorStoreUrl = overrides.vectorStoreUrl || env.ROUTER_VECTOR_STORE_URL;
    this.vectorStoreApiKey = overrides.vectorStoreApiKey || env.ROUTER_VECTOR_STORE_API_KEY;
    this.supabase = {
      table: overrides.supabase?.table || env.ROUTER_SUPABASE_TABLE || 'mcp_router_embeddings',
      schema: overrides.supabase?.schema || env.ROUTER_SUPABASE_SCHEMA || 'public',
      matchFn: overrides.supabase?.matchFn || env.ROUTER_SUPABASE_MATCH_FN || 'match_mcp_router'
    };
    this.qdrant = {
      collection: overrides.qdrant?.collection || env.ROUTER_QDRANT_COLLECTION || 'mcp-router',
      timeout: overrides.qdrant?.timeout || Number(env.ROUTER_QDRANT_TIMEOUT_MS || 20000)
    };
    this.chroma = {
      collection: overrides.chroma?.collection || env.ROUTER_CHROMA_COLLECTION || 'mcp-router',
      tenant: overrides.chroma?.tenant || env.ROUTER_CHROMA_TENANT,
      database: overrides.chroma?.database || env.ROUTER_CHROMA_DATABASE
    };

    this.embeddingProvider = (overrides.embeddingProvider || env.ROUTER_EMBEDDING_PROVIDER || 'openai').toLowerCase();
    this.embeddingModel = overrides.embeddingModel || env.ROUTER_EMBEDDING_MODEL;
    this.embeddingApiKey = overrides.embeddingApiKey || env.ROUTER_EMBEDDING_API_KEY;
    this.embeddingEndpoint = overrides.embeddingEndpoint || env.ROUTER_EMBEDDING_ENDPOINT;
    this.embeddingDimension = Number(overrides.embeddingDimension || env.ROUTER_EMBEDDING_DIMENSION || 1536);

    this.remoteRegistries = this.#parseList(overrides.remoteRegistries || env.ROUTER_REMOTE_REGISTRIES);
    this.additionalGlobs = this.#parseList(overrides.additionalGlobs || env.ROUTER_ADDITIONAL_GLOBS);
    this.dynamicConfigDir = overrides.dynamicConfigDir || env.ROUTER_DYNAMIC_CONFIG_DIR || '.claude';

    this.defaultTopK = Number(overrides.defaultTopK || env.ROUTER_TOP_K || 8);
    this.cacheTtlMs = Number(overrides.cacheTtlMs || env.ROUTER_CACHE_TTL_MS || 5 * 60 * 1000);
    this.memoryStorePath = overrides.memoryStorePath || env.ROUTER_MEMORY_STORE_PATH || `${this.projectRoot}/.claude/router-index.json`;
    this.observability = {
      enabled: overrides.observability?.enabled ?? (env.ROUTER_OBSERVABILITY_ENABLED === 'true'),
      emitter: overrides.observability?.emitter || env.ROUTER_OBSERVABILITY_EMITTER || 'console'
    };
    this.autoIngest = overrides.autoIngest ?? (env.ROUTER_AUTO_INGEST === 'true');
  }

  #parseList(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    return value
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
}
