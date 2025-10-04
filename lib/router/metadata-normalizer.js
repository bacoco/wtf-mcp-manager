import crypto from 'crypto';

export class MetadataNormalizer {
  constructor(options = {}) {
    this.defaultSource = options.defaultSource || 'registry';
  }

  normalize(raw) {
    if (!raw) {
      throw new Error('Cannot normalize empty metadata payload');
    }

    const id = this.#resolveId(raw);
    const name = raw.name || raw.title || id;
    const description = raw.description || raw.summary || '';
    const categories = this.#toArray(raw.categories || raw.tags || []);
    const tools = this.#normalizeTools(raw.tools || raw.capabilities?.tools);
    const resources = this.#normalizeResources(raw.resources || raw.capabilities?.resources);
    const sampleCalls = this.#normalizeSamples(raw.sampleCalls || raw.examples || []);

    const normalized = {
      id,
      slug: this.#slugify(id || name),
      name,
      description,
      categories,
      tags: this.#toArray(raw.tags || []),
      tools,
      resources,
      sampleCalls,
      command: raw.command || raw.run?.command,
      args: raw.args || raw.run?.args || [],
      env: raw.env || raw.environment || {},
      schema: {
        tools,
        resources
      },
      source: raw.source || this.defaultSource,
      sourceId: raw.sourceId || raw.id || id,
      metadata: this.#stripInternal(raw)
    };

    normalized.text = this.#buildEmbeddingText(normalized);

    return normalized;
  }

  #resolveId(raw) {
    if (raw.uid) return String(raw.uid);
    if (raw.id) return String(raw.id);
    if (raw.slug) return raw.slug;
    if (raw.name) return this.#slugify(raw.name);
    if (raw.title) return this.#slugify(raw.title);

    const hash = crypto.createHash('sha1');
    hash.update(JSON.stringify(raw));
    return hash.digest('hex');
  }

  #slugify(value) {
    return (
      String(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'mcp'
    );
  }

  #toArray(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean).map(String);
    if (typeof value === 'string') return value.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
    return [String(value)];
  }

  #normalizeTools(tools) {
    if (!tools) return [];

    if (Array.isArray(tools)) {
      return tools
        .map((tool) => this.#normalizeTool(tool))
        .filter(Boolean);
    }

    if (typeof tools === 'object') {
      return Object.entries(tools)
        .map(([name, value]) => this.#normalizeTool({ name, ...value }))
        .filter(Boolean);
    }

    return [];
  }

  #normalizeTool(tool) {
    if (!tool) return null;
    return {
      name: tool.name || tool.id,
      description: tool.description || tool.summary || '',
      inputSchema: tool.inputSchema || tool.schema || tool.input_schema || { type: 'object', properties: {} },
      outputSchema: tool.outputSchema || tool.output_schema,
      examples: this.#normalizeSamples(tool.examples || tool.sampleCalls)
    };
  }

  #normalizeResources(resources) {
    if (!resources) return [];
    if (Array.isArray(resources)) return resources;
    if (typeof resources === 'object') {
      return Object.entries(resources).map(([name, value]) => ({ name, ...value }));
    }
    return [];
  }

  #normalizeSamples(samples) {
    if (!samples) return [];
    if (Array.isArray(samples)) return samples;
    if (typeof samples === 'string') return [samples];
    return [];
  }

  #stripInternal(raw) {
    const { tools, capabilities, ...rest } = raw;
    return rest;
  }

  #buildEmbeddingText(record) {
    const parts = [
      record.id,
      record.name,
      record.description,
      record.categories.join(' '),
      record.tags.join(' '),
      record.tools.map((tool) => `${tool.name}: ${tool.description}`).join('\n'),
      record.sampleCalls.join('\n'),
      JSON.stringify(record.schema)
    ];

    return parts
      .flat()
      .filter(Boolean)
      .join('\n')
      .trim();
  }
}
