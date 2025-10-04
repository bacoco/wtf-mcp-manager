import crypto from 'crypto';

class BaseEmbeddingProvider {
  constructor(config = {}) {
    this.config = config;
  }

  async embed(texts) {
    throw new Error('embed(texts) must be implemented by subclasses');
  }
}

class OpenAIEmbeddingProvider extends BaseEmbeddingProvider {
  async embed(texts) {
    let OpenAIModule;
    try {
      OpenAIModule = await import('openai');
    } catch (error) {
      throw new Error('OpenAI client not installed. Install it with `npm install openai`.');
    }
    const { default: OpenAI } = OpenAIModule;
    const apiKey = this.config.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key is required for OpenAI embeddings');
    }

    const client = new OpenAI({ apiKey, baseURL: this.config.endpoint || process.env.OPENAI_BASE_URL });
    const model = this.config.model || process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';

    const response = await client.embeddings.create({
      model,
      input: texts
    });

    return response.data.map((item) => item.embedding);
  }
}

class AnthropicEmbeddingProvider extends BaseEmbeddingProvider {
  async embed(texts) {
    const apiKey = this.config.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Anthropic API key is required for Anthropics embeddings');
    }

    const model = this.config.model || process.env.ANTHROPIC_EMBEDDING_MODEL || 'claude-embedding-3-large';
    const endpoint = this.config.endpoint || process.env.ANTHROPIC_EMBEDDING_ENDPOINT || 'https://api.anthropic.com/v1/embeddings';

    const results = [];
    for (const text of texts) {
      let fetchFn = fetch;
      if (typeof fetch === 'undefined') {
        const { default: nodeFetch } = await import('node-fetch');
        fetchFn = nodeFetch;
      }
      const response = await fetchFn(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          input: text
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic embedding error: ${response.status} ${errorText}`);
      }

      const payload = await response.json();
      if (!payload.embedding) {
        throw new Error('Anthropic response missing embedding field');
      }

      results.push(payload.embedding);
    }

    return results;
  }
}

class LocalEmbeddingProvider extends BaseEmbeddingProvider {
  constructor(config = {}) {
    super(config);
    this.dimension = Number(config.dimension || process.env.LOCAL_EMBEDDING_DIMENSION || 384);
  }

  async embed(texts) {
    return texts.map((text) => this.#hashToVector(text));
  }

  #hashToVector(text) {
    const vector = new Array(this.dimension).fill(0);
    const tokens = text.toLowerCase().split(/\W+/).filter(Boolean);

    for (const token of tokens) {
      const hash = crypto.createHash('sha256').update(token).digest();
      for (let i = 0; i < this.dimension; i++) {
        vector[i] += hash[i % hash.length] / 255;
      }
    }

    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
    return vector.map((value) => value / magnitude);
  }
}

export class EmbeddingProviderFactory {
  static async create(config = {}) {
    switch (config.embeddingProvider) {
      case 'openai':
        return new OpenAIEmbeddingProvider(config);
      case 'anthropic':
        return new AnthropicEmbeddingProvider(config);
      case 'local':
        return new LocalEmbeddingProvider(config);
      default:
        throw new Error(`Unsupported embedding provider: ${config.embeddingProvider}`);
    }
  }
}
