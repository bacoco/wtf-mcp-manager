/**
 * Tool retriever for MCP metadata using a lightweight in-memory vector store.
 */

const DEFAULT_STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'into', 'have',
  'about', 'over', 'when', 'where', 'what', 'which', 'using', 'will', 'then',
  'through', 'their', 'also', 'should', 'could', 'would', 'there', 'here',
  'such', 'take', 'takes', 'more', 'than', 'each', 'been', 'being', 'used',
  'available', 'provides', 'provide', 'server', 'integration', 'protocol',
  'modelcontextprotocol', 'mcp'
]);

const SYNONYM_MAP = new Map([
  ['databases', 'database'],
  ['database', 'database'],
  ['db', 'database'],
  ['postgresql', 'postgres'],
  ['postgres', 'postgres'],
  ['pg', 'postgres'],
  ['authentication', 'auth'],
  ['authenticate', 'auth'],
  ['authorisation', 'auth'],
  ['authorization', 'auth'],
  ['vulnerabilities', 'vulnerability'],
  ['vulnerability', 'vulnerability'],
  ['vulnerable', 'vulnerability'],
  ['security', 'security'],
  ['testing', 'test'],
  ['tests', 'test'],
  ['browsers', 'browser'],
  ['headless', 'browser'],
  ['scraping', 'scrape']
]);

function normalizeToken(token) {
  let normalized = token;

  if (normalized.endsWith('ies') && normalized.length > 4) {
    normalized = normalized.slice(0, -3) + 'y';
  } else if (normalized.endsWith('ing') && normalized.length > 5) {
    normalized = normalized.slice(0, -3);
  } else if (normalized.endsWith('ed') && normalized.length > 4) {
    normalized = normalized.slice(0, -2);
  } else if (normalized.endsWith('s') && normalized.length > 4) {
    normalized = normalized.slice(0, -1);
  }

  return SYNONYM_MAP.get(normalized) || normalized;
}

function normalizeText(text = '') {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length > 2 && !DEFAULT_STOP_WORDS.has(token))
    .map(normalizeToken);
}

function buildTermFrequency(tokens) {
  const tf = new Map();
  tokens.forEach(token => {
    tf.set(token, (tf.get(token) || 0) + 1);
  });
  return { tf, length: tokens.length };
}

function cosineSimilarity(aVector, aNorm, bVector, bNorm) {
  if (!aNorm || !bNorm) return 0;
  let dot = 0;
  for (const [token, weight] of aVector.entries()) {
    const otherWeight = bVector.get(token);
    if (otherWeight) {
      dot += weight * otherWeight;
    }
  }
  return dot / (aNorm * bNorm);
}

class InMemoryVectorStore {
  constructor() {
    this.documents = [];
    this.idf = new Map();
  }

  setDocuments(documents = {}) {
    const entries = Array.isArray(documents)
      ? documents
      : Object.entries(documents).map(([id, info]) => ({ id, ...info }));

    const docs = [];
    const documentFrequency = new Map();

    entries.forEach(entry => {
      const { id, description = '', name = '', categories = [], tags = [] } = entry;
      const metadata = { ...entry, id };
      const combinedText = [name, description, categories.join(' '), tags.join(' ')].join(' ');
      const tokens = normalizeText(combinedText);

      if (!tokens.length) {
        return;
      }

      const { tf, length } = buildTermFrequency(tokens);
      const uniqueTokens = new Set(tokens);
      uniqueTokens.forEach(token => {
        documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
      });

      docs.push({ id, metadata, tf, length });
    });

    const totalDocs = docs.length || 1;
    const idf = new Map();
    documentFrequency.forEach((df, token) => {
      idf.set(token, Math.log((1 + totalDocs) / (1 + df)) + 1);
    });

    this.documents = docs.map(doc => {
      const vector = new Map();
      let normSquared = 0;
      for (const [token, count] of doc.tf.entries()) {
        const tfWeight = count / doc.length;
        const idfWeight = idf.get(token) || 1;
        const weight = tfWeight * idfWeight;
        vector.set(token, weight);
        normSquared += weight * weight;
      }
      return {
        id: doc.id,
        metadata: doc.metadata,
        vector,
        norm: Math.sqrt(normSquared)
      };
    });

    this.idf = idf;
  }

  search(query, topK = 5) {
    const queryTokens = normalizeText(query);
    if (!queryTokens.length || !this.documents.length) {
      return [];
    }

    const { tf, length } = buildTermFrequency(queryTokens);
    const queryVector = new Map();
    let queryNormSquared = 0;

    for (const [token, count] of tf.entries()) {
      const tfWeight = count / length;
      const idfWeight = this.idf.get(token) || 1;
      const weight = tfWeight * idfWeight;
      queryVector.set(token, weight);
      queryNormSquared += weight * weight;
    }

    const queryNorm = Math.sqrt(queryNormSquared) || 1;

    return this.documents
      .map(doc => ({
        id: doc.id,
        score: cosineSimilarity(queryVector, queryNorm, doc.vector, doc.norm),
        payload: doc.metadata
      }))
      .filter(result => result.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}

export class ToolRetriever {
  constructor({ vectorStore } = {}) {
    this.vectorStore = vectorStore || new InMemoryVectorStore();
  }

  setDocuments(documents) {
    this.vectorStore.setDocuments(documents);
  }

  isReady() {
    return Boolean(this.vectorStore.documents && this.vectorStore.documents.length);
  }

  async retrieve(query, options = {}) {
    const { topK = 10 } = options;
    if (!query?.trim()) {
      return [];
    }

    return this.vectorStore.search(query, topK).map(result => ({
      id: result.id,
      score: Number(result.score.toFixed(4)),
      ...result.payload
    }));
  }
}

export default ToolRetriever;
