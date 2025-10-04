import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import fetch from 'node-fetch';
import { MCPRegistry } from '../registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

function coerceExamples(examples) {
  if (!examples) {
    return [];
  }

  if (Array.isArray(examples)) {
    return examples.map(example => {
      if (typeof example === 'string') {
        return example;
      }
      return JSON.stringify(example);
    });
  }

  return [typeof examples === 'string' ? examples : JSON.stringify(examples)];
}

export function normalizeMetadata(entry) {
  if (!entry || !entry.id) {
    throw new Error('Metadata entry must include an id');
  }

  return {
    id: String(entry.id),
    name: entry.name ? String(entry.name) : entry.id,
    description: entry.description ? String(entry.description) : '',
    schema: entry.schema ?? null,
    examples: coerceExamples(entry.examples),
    source: entry.source || 'unknown',
    metadata: entry.metadata || {}
  };
}

export function createDocument(entry) {
  const parts = [
    `Name: ${entry.name}`,
    entry.description ? `Description: ${entry.description}` : null,
    entry.schema ? `Schema: ${JSON.stringify(entry.schema, null, 2)}` : null,
    entry.examples?.length ? `Examples:\n${entry.examples.join('\n')}` : null,
    entry.metadata && Object.keys(entry.metadata).length
      ? `Metadata: ${JSON.stringify(entry.metadata, null, 2)}`
      : null,
    `Source: ${entry.source}`
  ];

  return parts.filter(Boolean).join('\n\n');
}

export function toVectorRecord(entry) {
  const normalized = normalizeMetadata(entry);
  return {
    ...normalized,
    document: createDocument(normalized)
  };
}

async function collectRegistryMetadata() {
  const registry = new MCPRegistry();
  const all = registry.getAll();
  return Object.entries(all).map(([id, info]) => ({
    id: `registry:${id}`,
    name: info.name || id,
    description: info.description || '',
    schema: {
      package: info.package,
      command: info.command,
      args: info.args,
      requiredEnv: info.requiredEnv || []
    },
    examples: [],
    source: 'registry',
    metadata: {
      categories: info.categories || [],
      autoDetect: info.autoDetect || []
    }
  }));
}

async function collectToolMetadata(rootDir = PROJECT_ROOT) {
  const file = path.join(rootDir, 'mcp-tools.json');
  const content = await fs.readFile(file, 'utf8');
  const parsed = JSON.parse(content);
  const tools = (parsed.tools || []).map(tool => ({
    id: `tool:${tool.name}`,
    name: tool.name,
    description: tool.description || '',
    schema: tool.inputSchema || null,
    examples: [],
    source: 'tool',
    metadata: { type: 'mcp-tool' }
  }));

  const examples = parsed.examples?.map((example, index) => ({
    id: `tool-example:${index}`,
    name: example.user || `example-${index}`,
    description: example.assistant || '',
    schema: example.tool_calls || null,
    examples: [],
    source: 'tool-example',
    metadata: { type: 'conversation-example' }
  })) || [];

  return [...tools, ...examples];
}

function extractRecordsFromObject(obj, source) {
  if (!obj || typeof obj !== 'object') {
    return [];
  }

  if (Array.isArray(obj)) {
    return obj
      .filter(item => item && typeof item === 'object')
      .map((item, index) => ({
        id: `${source}:${index}`,
        name: item.name || `${source}-${index}`,
        description: item.description || '',
        schema: item.parameters || item.schema || null,
        examples: item.examples || [],
        source,
        metadata: { ...item }
      }));
  }

  return Object.entries(obj)
    .filter(([, value]) => value && typeof value === 'object')
    .map(([key, value]) => ({
      id: `${source}:${key}`,
      name: value.name || key,
      description: value.description || '',
      schema: value.parameters || value.schema || value.endpoints || null,
      examples: value.examples || [],
      source,
      metadata: { ...value }
    }));
}

async function collectDiscoveryMetadata() {
  const discoveryDir = path.join(__dirname, '..', 'discovery');
  const files = await fs.readdir(discoveryDir);
  const entries = [];

  for (const file of files) {
    if (!file.endsWith('.js')) continue;
    const modulePath = path.join(discoveryDir, file);
    const mod = await import(pathToFileURL(modulePath).href);
    const exportEntries = Object.entries(mod)
      .filter(([, value]) => typeof value === 'object' && value !== null);

    for (const [exportName, value] of exportEntries) {
      const source = `discovery:${path.basename(file, '.js')}:${exportName}`;
      entries.push(...extractRecordsFromObject(value, source));
    }
  }

  return entries;
}

export async function collectMCPMetadata(options = {}) {
  const rootDir = options.rootDir || PROJECT_ROOT;
  const [registry, tools, discovery] = await Promise.all([
    collectRegistryMetadata(),
    collectToolMetadata(rootDir),
    collectDiscoveryMetadata()
  ]);

  return [...registry, ...tools, ...discovery];
}

export async function generateEmbeddings(records, embeddingProvider) {
  if (!embeddingProvider || typeof embeddingProvider.embed !== 'function') {
    throw new Error('embeddingProvider must implement an embed(text, metadata) method');
  }

  const results = [];

  for (const record of records) {
    const embedding = await embeddingProvider.embed(record.document, record);
    if (!Array.isArray(embedding)) {
      throw new Error('Embedding provider must return an array of numbers');
    }
    results.push({ ...record, embedding });
  }

  return results;
}

export class AnthropicEmbeddingProvider {
  constructor({ apiKey, model = 'text-embedding-001', fetchImpl = fetch } = {}) {
    if (!apiKey) {
      throw new Error('Anthropic API key is required for embeddings');
    }
    this.apiKey = apiKey;
    this.model = model;
    this.fetch = fetchImpl;
  }

  async embed(text) {
    const response = await this.fetch('https://api.anthropic.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: this.model,
        input: text
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic embedding request failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data.embedding;
  }
}

export function createEmbeddingProviderFromEnv(options = {}) {
  const provider = options.provider || process.env.EMBEDDING_PROVIDER || 'anthropic';

  if (provider === 'anthropic') {
    const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
    const model = options.model || process.env.ANTHROPIC_EMBEDDING_MODEL;
    return new AnthropicEmbeddingProvider({ apiKey, model, fetchImpl: options.fetch });
  }

  throw new Error(`Unsupported embedding provider: ${provider}`);
}

export function getVectorStoreConfigFromEnv(env = process.env) {
  const provider = env.VECTOR_DB_PROVIDER || 'chroma';
  const url = env.VECTOR_DB_URL;
  const collection = env.VECTOR_DB_COLLECTION || 'wtf-mcps';
  const apiKey = env.VECTOR_DB_API_KEY;

  if (!url) {
    throw new Error('VECTOR_DB_URL environment variable is required');
  }

  return { provider, url, collection, apiKey };
}

export class VectorStoreClient {
  constructor(config, fetchImpl = fetch) {
    if (!config || !config.provider) {
      throw new Error('Vector store configuration must include provider');
    }
    this.config = config;
    this.fetch = fetchImpl;
  }

  async ensureCollection() {
    if (this.config.provider !== 'chroma') {
      throw new Error(`Unsupported vector store provider: ${this.config.provider}`);
    }

    const response = await this.fetch(`${this.config.url}/collections`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({ name: this.config.collection })
    });

    if (!response.ok && response.status !== 409) {
      const text = await response.text();
      throw new Error(`Failed to ensure collection: ${response.status} ${text}`);
    }
  }

  buildHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    return headers;
  }

  async upsert(records) {
    if (this.config.provider !== 'chroma') {
      throw new Error(`Unsupported vector store provider: ${this.config.provider}`);
    }

    if (!Array.isArray(records) || records.length === 0) {
      return;
    }

    const payload = {
      ids: records.map(record => record.id),
      embeddings: records.map(record => record.embedding),
      documents: records.map(record => record.document),
      metadatas: records.map(record => ({
        name: record.name,
        description: record.description,
        source: record.source,
        schema: record.schema,
        examples: record.examples,
        metadata: record.metadata
      }))
    };

    const response = await this.fetch(`${this.config.url}/collections/${encodeURIComponent(this.config.collection)}/upsert`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to upsert records: ${response.status} ${text}`);
    }
  }
}

export async function ingestToVectorStore(options = {}) {
  const records = await collectMCPMetadata({ rootDir: options.rootDir });
  const vectorRecords = records.map(toVectorRecord);
  const embeddingProvider = options.embeddingProvider || createEmbeddingProviderFromEnv({
    provider: options.embeddingProviderName,
    apiKey: options.embeddingApiKey,
    model: options.embeddingModel,
    fetch: options.fetch
  });
  const embedded = await generateEmbeddings(vectorRecords, embeddingProvider);
  const vectorStoreConfig = options.vectorStoreConfig || getVectorStoreConfigFromEnv();
  const vectorStore = options.vectorStore || new VectorStoreClient(vectorStoreConfig, options.fetch);

  await vectorStore.ensureCollection();
  await vectorStore.upsert(embedded);

  return {
    count: embedded.length,
    provider: vectorStoreConfig.provider,
    collection: vectorStoreConfig.collection
  };
}

export default {
  collectMCPMetadata,
  ingestToVectorStore,
  VectorStoreClient,
  createEmbeddingProviderFromEnv,
  getVectorStoreConfigFromEnv
};
