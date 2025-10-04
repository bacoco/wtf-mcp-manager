import fs from 'fs/promises';
import path from 'path';

class BaseVectorStore {
  constructor(config = {}) {
    this.config = config;
  }

  async init() {}

  async upsert(records) {
    throw new Error('upsert(records) must be implemented by subclasses');
  }

  async query(embedding, options = {}) {
    throw new Error('query(embedding) must be implemented by subclasses');
  }
}

class MemoryVectorStore extends BaseVectorStore {
  constructor(config = {}) {
    super(config);
    this.indexPath = config.memoryStorePath;
    this.points = [];
  }

  async init() {
    if (!this.indexPath) return;
    try {
      const data = await fs.readFile(this.indexPath, 'utf-8');
      const parsed = JSON.parse(data);
      this.points = parsed.points || [];
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('Failed to load router memory store:', error.message);
      }
    }
  }

  async upsert(records) {
    const existingIds = new Map(this.points.map((point) => [point.id, point]));
    for (const record of records) {
      existingIds.set(record.id, record);
    }
    this.points = Array.from(existingIds.values());

    if (this.indexPath) {
      await fs.mkdir(path.dirname(this.indexPath), { recursive: true });
      await fs.writeFile(this.indexPath, JSON.stringify({ points: this.points }, null, 2));
    }

    return { count: records.length };
  }

  async query(embedding, options = {}) {
    const topK = options.topK || this.config.defaultTopK || 5;

    const scored = this.points
      .map((point) => ({
        point,
        score: this.#cosineSimilarity(embedding, point.embedding)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored.map(({ point, score }) => ({ ...point, score }));
  }

  #cosineSimilarity(a, b) {
    if (!a || !b) return 0;
    const length = Math.min(a.length, b.length);
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA) || 1;
    normB = Math.sqrt(normB) || 1;
    return dot / (normA * normB);
  }
}

class SupabaseVectorStore extends BaseVectorStore {
  async init() {
    let supabaseModule;
    try {
      supabaseModule = await import('@supabase/supabase-js');
    } catch (error) {
      throw new Error('Supabase vector store requires @supabase/supabase-js. Install it with `npm install @supabase/supabase-js`.');
    }
    const { createClient } = supabaseModule;
    if (!this.config.vectorStoreUrl || !this.config.vectorStoreApiKey) {
      throw new Error('Supabase vector store requires ROUTER_VECTOR_STORE_URL and ROUTER_VECTOR_STORE_API_KEY');
    }
    this.client = createClient(this.config.vectorStoreUrl, this.config.vectorStoreApiKey, {
      auth: { persistSession: false }
    });
  }

  async upsert(records) {
    const payload = records.map((record) => ({
      id: record.id,
      embedding: record.embedding,
      metadata: record.metadata,
      name: record.name,
      description: record.description,
      source: record.source
    }));

    let query = this.client.from(this.config.supabase.table);
    if (this.config.supabase.schema) {
      query = query.schema(this.config.supabase.schema);
    }

    const { error } = await query.upsert(payload, { onConflict: 'id' });
    if (error) {
      throw new Error(`Supabase upsert failed: ${error.message}`);
    }

    return { count: records.length };
  }

  async query(embedding, options = {}) {
    const matchFn = this.config.supabase.matchFn;
    const topK = options.topK || this.config.defaultTopK || 5;
    const filters = options.filter || {};

    const { data, error } = await this.client.rpc(matchFn, {
      query_embedding: embedding,
      match_count: topK,
      filter: filters
    });

    if (error) {
      throw new Error(`Supabase match function failed: ${error.message}`);
    }

    return (data || []).map((item) => ({
      id: item.id,
      score: item.score,
      embedding: item.embedding,
      name: item.name,
      description: item.description,
      source: item.source,
      metadata: item.metadata
    }));
  }
}

class QdrantVectorStore extends BaseVectorStore {
  async init() {
    let qdrantModule;
    try {
      qdrantModule = await import('@qdrant/js-client-rest');
    } catch (error) {
      throw new Error('Qdrant vector store requires @qdrant/js-client-rest. Install it with `npm install @qdrant/js-client-rest`.');
    }
    const { QdrantClient } = qdrantModule;
    this.client = new QdrantClient({
      url: this.config.vectorStoreUrl,
      apiKey: this.config.vectorStoreApiKey,
      timeout: this.config.qdrant.timeout
    });

    const collections = await this.client.getCollections();
    const exists = collections.collections.some((collection) => collection.name === this.config.qdrant.collection);
    if (!exists) {
      await this.client.createCollection(this.config.qdrant.collection, {
        vectors: {
          size: this.config.embeddingDimension || 1536,
          distance: 'Cosine'
        }
      });
    }
  }

  async upsert(records) {
    await this.client.upsert(this.config.qdrant.collection, {
      points: records.map((record) => ({
        id: record.id,
        vector: record.embedding,
        payload: {
          name: record.name,
          description: record.description,
          source: record.source,
          metadata: record.metadata
        }
      }))
    });
    return { count: records.length };
  }

  async query(embedding, options = {}) {
    const topK = options.topK || this.config.defaultTopK || 5;
    const filter = options.filter;

    const response = await this.client.search(this.config.qdrant.collection, {
      vector: embedding,
      limit: topK,
      filter
    });

    return response.map((item) => ({
      id: item.id,
      score: item.score,
      embedding: item.vector,
      name: item.payload?.name,
      description: item.payload?.description,
      source: item.payload?.source,
      metadata: item.payload?.metadata
    }));
  }
}

class ChromaVectorStore extends BaseVectorStore {
  async init() {
    let chromaModule;
    try {
      chromaModule = await import('chromadb');
    } catch (error) {
      throw new Error('Chroma vector store requires chromadb. Install it with `npm install chromadb`.');
    }
    const { ChromaClient } = chromaModule;
    this.client = new ChromaClient({
      path: this.config.vectorStoreUrl,
      auth: this.config.vectorStoreApiKey ? { provider: 'token', token: this.config.vectorStoreApiKey } : undefined,
      tenant: this.config.chroma.tenant,
      database: this.config.chroma.database
    });

    this.collection = await this.client.getOrCreateCollection({
      name: this.config.chroma.collection
    });
  }

  async upsert(records) {
    await this.collection.upsert({
      ids: records.map((record) => record.id),
      embeddings: records.map((record) => record.embedding),
      metadatas: records.map((record) => ({
        name: record.name,
        description: record.description,
        source: record.source,
        metadata: record.metadata
      })),
      documents: records.map((record) => record.text)
    });
    return { count: records.length };
  }

  async query(embedding, options = {}) {
    const topK = options.topK || this.config.defaultTopK || 5;

    const result = await this.collection.query({
      queryEmbeddings: [embedding],
      nResults: topK
    });

    const ids = result.ids?.[0] || [];
    const scores = result.distances?.[0] || [];
    const metadatas = result.metadatas?.[0] || [];

    return ids.map((id, index) => ({
      id,
      score: scores[index],
      metadata: metadatas[index]
    }));
  }
}

export class VectorStoreFactory {
  static async create(config = {}) {
    let store;
    switch (config.vectorStore) {
      case 'supabase':
        store = new SupabaseVectorStore(config);
        break;
      case 'qdrant':
        store = new QdrantVectorStore(config);
        break;
      case 'chroma':
        store = new ChromaVectorStore(config);
        break;
      case 'memory':
      default:
        store = new MemoryVectorStore(config);
        break;
    }

    await store.init();
    return store;
  }
}
