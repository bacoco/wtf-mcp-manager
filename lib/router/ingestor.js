import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import YAML from 'yaml';
import { MCPRegistry } from '../registry.js';
import { MCPManager } from '../manager.js';
import { MetadataNormalizer } from './metadata-normalizer.js';

export class RouterIngestor {
  constructor({ config, vectorStore, embeddingProvider, normalizer } = {}) {
    this.config = config;
    this.vectorStore = vectorStore;
    this.embeddingProvider = embeddingProvider;
    this.normalizer = normalizer || new MetadataNormalizer();
    this.registry = new MCPRegistry();
  }

  async ingest(options = {}) {
    const records = await this.loadRecords(options);
    if (records.length === 0) {
      return { count: 0, sources: {} };
    }

    const embeddings = await this.#embedInBatches(records.map((record) => record.text));

    const upsertRecords = records.map((record, index) => ({
      id: `${record.source}:${record.slug}`,
      name: record.name,
      description: record.description,
      source: record.source,
      embedding: embeddings[index],
      text: record.text,
      metadata: {
        sourceId: record.sourceId,
        categories: record.categories,
        tags: record.tags,
        command: record.command,
        args: record.args,
        env: record.env,
        sampleCalls: record.sampleCalls,
        schema: record.schema,
        raw: record.metadata
      }
    }));

    await this.vectorStore.upsert(upsertRecords);

    const sourceCounts = records.reduce((acc, record) => {
      acc[record.source] = (acc[record.source] || 0) + 1;
      return acc;
    }, {});

    return {
      count: upsertRecords.length,
      sources: sourceCounts
    };
  }

  async loadRecords(options = {}) {
    const records = new Map();

    const loaders = [
      this.#loadRegistryRecords(),
      this.#loadProjectConfigRecords(),
      this.#loadDynamicRecords(),
      this.#loadAdditionalDefinitions(),
      this.#loadRemoteRegistries()
    ];

    const results = await Promise.all(loaders);
    for (const result of results) {
      for (const record of result) {
        records.set(`${record.source}:${record.slug}`, record);
      }
    }

    return Array.from(records.values());
  }

  async #loadRegistryRecords() {
    const registry = this.registry.getAll();
    return Object.entries(registry).map(([id, info]) =>
      this.normalizer.normalize({
        id,
        ...info,
        source: 'registry'
      })
    );
  }

  async #loadProjectConfigRecords() {
    const manager = new MCPManager(this.config?.projectRoot);
    try {
      const config = await manager.load();
      return Object.entries(config.mcpServers || {}).map(([id, info]) => {
        const registryInfo = this.registry.get(id) || {};
        return this.normalizer.normalize({
          id,
          source: 'project',
          name: registryInfo.name || id,
          description: registryInfo.description || info.description,
          categories: registryInfo.categories,
          tags: registryInfo.tags,
          command: info.command,
          args: info.args,
          env: info.env
        });
      });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('Failed to load project MCP config:', error.message);
      }
      return [];
    }
  }

  async #loadDynamicRecords() {
    const dynamicDir = path.join(this.config?.projectRoot || process.cwd(), this.config?.dynamicConfigDir || '.claude');
    const patterns = ['dynamic-mcps/**/*.json', 'dynamic-mcps/**/*.yaml', 'dynamic-mcps/**/*.yml'];
    const records = [];

    for (const pattern of patterns) {
      const files = await glob(path.join(dynamicDir, pattern), { nodir: true, absolute: true });
      for (const file of files) {
        try {
          const data = await this.#parseFile(file);
          const items = Array.isArray(data) ? data : [data];
          for (const item of items) {
            const normalized = this.normalizer.normalize({
              ...item,
              source: 'dynamic',
              sourceId: file
            });
            records.push(normalized);
          }
        } catch (error) {
          console.warn(`Failed to parse dynamic MCP file ${file}:`, error.message);
        }
      }
    }

    return records;
  }

  async #loadAdditionalDefinitions() {
    const records = [];
    for (const pattern of this.config?.additionalGlobs || []) {
      const files = await glob(pattern, { nodir: true, absolute: true });
      for (const file of files) {
        try {
          const data = await this.#parseFile(file);
          const items = Array.isArray(data) ? data : [data];
          for (const item of items) {
            const normalized = this.normalizer.normalize({
              ...item,
              source: 'custom',
              sourceId: file
            });
            records.push(normalized);
          }
        } catch (error) {
          console.warn(`Failed to parse custom MCP file ${file}:`, error.message);
        }
      }
    }
    return records;
  }

  async #loadRemoteRegistries() {
    const records = [];
    for (const url of this.config?.remoteRegistries || []) {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          console.warn(`Failed to fetch remote registry ${url}: ${response.status}`);
          continue;
        }
        const text = await response.text();
        const data = this.#parseContent(text, url);
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          const normalized = this.normalizer.normalize({
            ...item,
            source: 'remote',
            sourceId: url
          });
          records.push(normalized);
        }
      } catch (error) {
        console.warn(`Failed to load remote registry ${url}:`, error.message);
      }
    }
    return records;
  }

  async #parseFile(file) {
    const ext = path.extname(file).toLowerCase();
    const content = await fs.readFile(file, 'utf-8');
    return this.#parseContent(content, file, ext);
  }

  #parseContent(content, source, ext) {
    const extension = ext || path.extname(source).toLowerCase();
    if (extension === '.yaml' || extension === '.yml') {
      return YAML.parse(content);
    }
    try {
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Unsupported format for ${source}`);
    }
  }

  async #embedInBatches(texts, batchSize = 32) {
    const vectors = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const result = await this.embeddingProvider.embed(batch);
      vectors.push(...result);
    }
    return vectors;
  }
}
