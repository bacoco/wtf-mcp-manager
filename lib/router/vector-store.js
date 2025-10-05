import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { readFile } from 'fs/promises';
import dotenv from 'dotenv';
import crypto from 'crypto';
import fetch from 'node-fetch';
import { MCPRegistry } from '../registry.js';
import { API_DATABASE } from '../discovery/api-database.js';
import { WebSearchService } from '../discovery/web-search.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');

function loadClaudeEnv(envPath = join(PROJECT_ROOT, '.claude', '.env')) {
  if (process.env.__WTF_MCP_ENV_LOADED) {
    return;
  }

  try {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath, override: false });
    }
  } catch (error) {
    console.warn('[vector-store] Unable to load .claude/.env:', error.message);
  }

  process.env.__WTF_MCP_ENV_LOADED = 'true';
}

function serializeSchema(schema) {
  if (!schema) return '';
  if (typeof schema === 'string') return schema;
  try {
    return JSON.stringify(schema, null, 2);
  } catch (error) {
    return String(schema);
  }
}

function normalizeDocument({ id, source, name, description, schema, example, metadata = {} }) {
  const schemaText = serializeSchema(schema);
  const exampleText = example || '';
  const base = {
    id,
    source,
    name,
    description: description || '',
    schema,
    example: exampleText,
    metadata
  };

  return {
    ...base,
    text: [
      `Source: ${source}`,
      name ? `Name: ${name}` : '',
      description ? `Description: ${description}` : '',
      schemaText ? `Schema: ${schemaText}` : '',
      exampleText ? `Example: ${exampleText}` : ''
    ].filter(Boolean).join('\n')
  };
}

function hashToVector(value, dimensions = 8) {
  const hash = crypto.createHash('sha256').update(value).digest();
  const vector = [];
  for (let i = 0; i < dimensions; i++) {
    const slice = hash.readUInt32BE((i * 4) % hash.length);
    vector.push((slice / 0xffffffff) * 2 - 1);
  }
  return vector;
}

class EmbeddingClient {
  constructor({ provider = 'mock', apiKey, model, endpoint } = {}) {
    this.provider = provider.toLowerCase();
    this.apiKey = apiKey;
    this.model = model;
    this.endpoint = endpoint;
  }

  async embed(texts) {
    if (!Array.isArray(texts)) {
      return this.embed([texts]);
    }

    switch (this.provider) {
      case 'openai':
        return this.embedWithOpenAI(texts);
      case 'mock':
      default:
        return texts.map(text => hashToVector(text));
    }
  }

  async embedWithOpenAI(texts) {
    if (!this.apiKey) {
      throw new Error('OpenAI API key is required for embeddings');
    }

    const endpoint = this.endpoint || 'https://api.openai.com/v1/embeddings';
    const model = this.model || 'text-embedding-3-large';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model,
        input: texts
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI embedding failed: ${response.status} ${errorBody}`);
    }

    const data = await response.json();
    return data.data.map(item => item.embedding);
  }
}

export class MockEmbeddingClient extends EmbeddingClient {
  constructor() {
    super({ provider: 'mock' });
  }
}

class EmbeddingProviderFactory {
  static async create(options = {}) {
    if (options.embeddingClient) {
      return options.embeddingClient;
    }

    const provider = (options.embeddingProvider || options.provider || process.env.EMBEDDING_PROVIDER || 'mock').toLowerCase();
    const apiKey = options.embeddingApiKey || options.apiKey || process.env.EMBEDDING_API_KEY;
    const model = options.embeddingModel || options.model || process.env.EMBEDDING_MODEL;
    const endpoint = options.embeddingEndpoint || options.endpoint || process.env.EMBEDDING_ENDPOINT;

    return new EmbeddingClient({ provider, apiKey, model, endpoint });
  }
}

class AbstractVectorDatabase {
  constructor(provider) {
    this.provider = provider;
  }

  async upsertMany(records) {
    throw new Error('upsertMany not implemented');
  }
}

export class MemoryVectorDatabase extends AbstractVectorDatabase {
  constructor() {
    super('memory');
    this.records = [];
  }

  async upsertMany(records) {
    this.records.push(...records);
  }
}

class ChromaVectorDatabase extends AbstractVectorDatabase {
  constructor(options = {}) {
    super('chroma');
    this.url = options.url || process.env.VECTOR_DB_URL || 'http://localhost:8000';
    this.collection = options.collection || process.env.VECTOR_DB_COLLECTION || 'mcp_metadata';
    this.apiKey = options.apiKey || process.env.VECTOR_DB_API_KEY;
  }

  async upsertMany(records) {
    const endpoint = new URL(`/api/v1/collections/${this.collection}/upsert`, this.url).toString();
    const body = {
      ids: records.map(record => record.id),
      embeddings: records.map(record => record.embedding),
      metadatas: records.map(record => ({
        source: record.source,
        name: record.name,
        description: record.description,
        example: record.example,
        ...record.metadata
      })),
      documents: records.map(record => record.text)
    };

    const headers = {
      'Content-Type': 'application/json'
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Failed to upsert embeddings into Chroma: ${response.status} ${errorBody}`);
    }
  }
}

class QdrantVectorDatabase extends AbstractVectorDatabase {
  constructor(options = {}) {
    super('qdrant');
    this.url = options.url || process.env.VECTOR_DB_URL || 'http://localhost:6333';
    this.collection = options.collection || process.env.VECTOR_DB_COLLECTION || 'mcp_metadata';
    this.apiKey = options.apiKey || process.env.VECTOR_DB_API_KEY;
  }

  async upsertMany(records) {
    const endpoint = new URL(`/collections/${this.collection}/points?wait=true`, this.url).toString();
    const body = {
      points: records.map(record => ({
        id: record.id,
        vector: record.embedding,
        payload: {
          source: record.source,
          name: record.name,
          description: record.description,
          schema: record.schema,
          example: record.example,
          ...record.metadata
        }
      }))
    };

    const headers = {
      'Content-Type': 'application/json'
    };

    if (this.apiKey) {
      headers['api-key'] = this.apiKey;
    }

    const response = await fetch(endpoint, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Failed to upsert embeddings into Qdrant: ${response.status} ${errorBody}`);
    }
  }
}

class SupabaseVectorDatabase extends AbstractVectorDatabase {
  constructor(options = {}) {
    super('supabase');
    this.url = options.url || process.env.VECTOR_DB_URL;
    this.table = options.table || process.env.VECTOR_DB_TABLE || 'mcp_vectors';
    this.apiKey = options.apiKey || process.env.VECTOR_DB_API_KEY;

    if (!this.url) {
      throw new Error('Supabase VECTOR_DB_URL is required');
    }
    if (!this.apiKey) {
      throw new Error('Supabase VECTOR_DB_API_KEY is required');
    }
  }

  async upsertMany(records) {
    const endpoint = `${this.url.replace(/\/$/, '')}/${this.table}`;

    const payload = records.map(record => ({
      id: record.id,
      source: record.source,
      name: record.name,
      description: record.description,
      schema: record.schema ? JSON.stringify(record.schema) : null,
      example: record.example,
      text: record.text,
      embedding: record.embedding,
      metadata: record.metadata
    }));

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.apiKey,
        'Authorization': `Bearer ${this.apiKey}`,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Failed to upsert embeddings into Supabase: ${response.status} ${errorBody}`);
    }
  }
}

class VectorDatabaseFactory {
  static create(options = {}) {
    if (options.vectorDb) {
      return options.vectorDb;
    }

    const provider = (options.vectorProvider || options.provider || process.env.VECTOR_DB_PROVIDER || 'memory').toLowerCase();

    switch (provider) {
      case 'chroma':
        return new ChromaVectorDatabase(options);
      case 'qdrant':
        return new QdrantVectorDatabase(options);
      case 'supabase':
        return new SupabaseVectorDatabase(options);
      case 'memory':
      default:
        return new MemoryVectorDatabase(options);
    }
  }
}

export class VectorStoreIngestor {
  constructor(options = {}) {
    loadClaudeEnv(options.envPath);
    this.envPath = options.envPath;
    const vectorOptions = {
      vectorDb: options.vectorDb,
      provider: options.vectorProvider || options.provider,
      vectorProvider: options.vectorProvider || options.provider,
      url: options.url || options.vectorUrl,
      collection: options.collection || options.vectorCollection,
      table: options.table || options.vectorTable,
      apiKey: options.vectorApiKey || options.apiKey
    };
    const embeddingOptions = {
      embeddingClient: options.embeddingClient,
      embeddingProvider: options.embeddingProvider,
      embeddingApiKey: options.embeddingApiKey,
      embeddingModel: options.embeddingModel,
      embeddingEndpoint: options.embeddingEndpoint
    };

    this.vectorDb = options.vectorDb || VectorDatabaseFactory.create(vectorOptions);
    this.embeddingClient = options.embeddingClient || null;
    this.embeddingClientPromise = (async () => {
      if (this.embeddingClient) {
        return this.embeddingClient;
      }

      const client = await EmbeddingProviderFactory.create(embeddingOptions);
      this.embeddingClient = client;
      return client;
    })();
  }

  async collectRegistryDocuments() {
    const registry = new MCPRegistry();
    const docs = [];

    for (const [id, info] of Object.entries(registry.getAll())) {
      docs.push(normalizeDocument({
        id: `registry:${id}`,
        source: 'registry',
        name: info.name || id,
        description: info.description || '',
        schema: {
          package: info.package,
          command: info.command,
          args: info.args,
          requiredEnv: info.requiredEnv,
          categories: info.categories
        },
        example: info.command ? `${info.command} ${Array.isArray(info.args) ? info.args.join(' ') : ''}`.trim() : ''
      }));
    }

    return docs;
  }

  async collectApiDatabaseDocuments() {
    const docs = [];

    for (const [id, api] of Object.entries(API_DATABASE)) {
      docs.push(normalizeDocument({
        id: `api-database:${id}`,
        source: 'discovery:api-database',
        name: api.name || id,
        description: api.description || '',
        schema: {
          baseUrl: api.baseUrl,
          auth: api.auth,
          endpoints: api.endpoints,
          documentation: api.documentation
        },
        example: api.endpoints?.[0]?.description || ''
      }));
    }

    return docs;
  }

  async collectWebDiscoveryDocuments() {
    const service = new WebSearchService();
    const docs = [];
    const combined = {
      ...service.knownMaritimeAPIs,
      ...service.marineWeatherAPIs
    };

    for (const [id, info] of Object.entries(combined)) {
      docs.push(normalizeDocument({
        id: `web-discovery:${id}`,
        source: 'discovery:web-search',
        name: info.name || id,
        description: info.description || '',
        schema: {
          baseUrl: info.baseUrl,
          auth: info.auth,
          endpoints: info.endpoints,
          documentation: info.documentation,
          category: info.category
        },
        example: info.endpoints?.[0]?.description || ''
      }));
    }

    return docs;
  }

  async collectToolDocuments() {
    const docs = [];
    const toolsPath = join(PROJECT_ROOT, 'mcp-tools.json');

    if (!fs.existsSync(toolsPath)) {
      return docs;
    }

    const raw = await readFile(toolsPath, 'utf8');
    const json = JSON.parse(raw);
    const exampleMap = new Map();

    for (const example of json.examples || []) {
      const tool = example.tool_calls?.[0]?.tool;
      if (tool) {
        exampleMap.set(tool, `${example.user} -> ${example.assistant}`);
      }
      docs.push(normalizeDocument({
        id: `tool-example:${crypto.createHash('md5').update(JSON.stringify(example)).digest('hex')}`,
        source: 'mcp-tools:example',
        name: example.user,
        description: example.assistant,
        schema: example.tool_calls,
        example: example.assistant
      }));
    }

    for (const tool of json.tools || []) {
      docs.push(normalizeDocument({
        id: `tool:${tool.name}`,
        source: 'mcp-tools:tool',
        name: tool.name,
        description: tool.description,
        schema: tool.inputSchema,
        example: exampleMap.get(tool.name) || ''
      }));
    }

    return docs;
  }

  async collectDocuments() {
    const [registryDocs, apiDocs, webDocs, toolDocs] = await Promise.all([
      this.collectRegistryDocuments(),
      this.collectApiDatabaseDocuments(),
      this.collectWebDiscoveryDocuments(),
      this.collectToolDocuments()
    ]);

    const docs = [...registryDocs, ...apiDocs, ...webDocs, ...toolDocs];

    const seen = new Set();
    return docs.filter(doc => {
      if (seen.has(doc.id)) return false;
      seen.add(doc.id);
      return true;
    });
  }

  async embedDocuments(documents) {
    const embeddingClient = await this.embeddingClientPromise;
    const embeddings = await embeddingClient.embed(documents.map(doc => doc.text));
    return documents.map((doc, index) => ({
      ...doc,
      embedding: embeddings[index]
    }));
  }

  async ingestAll() {
    const documents = await this.collectDocuments();
    if (documents.length === 0) {
      return { count: 0, provider: this.vectorDb.provider };
    }

    const embedded = await this.embedDocuments(documents);
    await this.vectorDb.upsertMany(embedded);

    return {
      count: embedded.length,
      provider: this.vectorDb.provider,
      ids: embedded.map(doc => doc.id)
    };
  }
}

export default VectorStoreIngestor;
