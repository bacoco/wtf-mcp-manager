/**
 * ContextRouter
 * Formats retriever results into minimal tool manifests that can be streamed
 * back to Claude without leaking entire registries or bulky metadata.
 */

export class ContextRouter {
  constructor(options = {}) {
    const { topK = 5 } = options;
    this.defaultTopK = Number.isInteger(topK) && topK > 0 ? topK : 5;
  }

  format(results = [], options = {}) {
    const { topK } = options;
    const limit = Number.isInteger(topK) && topK > 0 ? topK : this.defaultTopK;
    const manifests = [];
    const seen = new Set();

    if (!Array.isArray(results)) {
      return manifests;
    }

    for (const result of results) {
      const manifest = this.#toManifest(result);
      if (!manifest) continue;

      const dedupeKey = manifest.name.toLowerCase();
      if (seen.has(dedupeKey)) {
        continue;
      }

      seen.add(dedupeKey);
      manifests.push(manifest);

      if (manifests.length >= limit) {
        break;
      }
    }

    return manifests;
  }

  #toManifest(result = {}) {
    const name = this.#resolveName(result);
    if (!name) {
      return null;
    }

    const description = this.#resolveDescription(result);
    const inputSchema = this.#resolveSchema(result);
    const examples = this.#resolveExamples(result);

    return { name, description, inputSchema, examples };
  }

  #resolveName(result) {
    return (
      result?.name ||
      result?.id ||
      result?.toolName ||
      result?.package ||
      null
    );
  }

  #resolveDescription(result) {
    return (
      result?.description ||
      result?.summary ||
      result?.details ||
      result?.text ||
      ''
    );
  }

  #resolveSchema(result) {
    const schema =
      result?.inputSchema ||
      result?.schema ||
      result?.parameters ||
      result?.args ||
      result?.exampleSchema;

    if (schema && typeof schema === 'object' && !Array.isArray(schema)) {
      return schema;
    }

    return null;
  }

  #resolveExamples(result) {
    const { examples, example } = result || {};

    if (Array.isArray(examples)) {
      return examples;
    }

    if (example) {
      return [example];
    }

    return [];
  }
}

export default ContextRouter;
