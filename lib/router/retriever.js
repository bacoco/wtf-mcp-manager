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

    return matches.map((match) => this.#toResult(match));
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
