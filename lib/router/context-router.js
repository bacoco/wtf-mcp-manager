import toolsData from '../../mcp-tools.json' with { type: 'json' };

const clone = (value) => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

const normalizeToolId = (candidate) => {
  if (!candidate) {
    return null;
  }

  if (typeof candidate === 'string') {
    return candidate.trim() || null;
  }

  if (typeof candidate === 'object') {
    const direct = candidate.tool || candidate.name || candidate.id || candidate.toolName;
    if (direct && typeof direct === 'string') {
      return direct.trim() || null;
    }

    const metadataTool = candidate.metadata?.tool || candidate.metadata?.name;
    if (metadataTool && typeof metadataTool === 'string') {
      return metadataTool.trim() || null;
    }
  }

  return null;
};

export class ContextRouter {
  constructor(options = {}) {
    this.data = options.toolsData ? clone(options.toolsData) : toolsData;
    this.toolIndex = new Map((this.data.tools || []).map(tool => [tool.name, tool]));
  }

  route(results = [], options = {}) {
    if (!Array.isArray(results)) {
      throw new Error('route_tools requires an array of retriever results');
    }

    const limitOption = options.limit ?? options.topK ?? options.k;
    const limit = Number.isFinite(limitOption) && limitOption >= 0 ? Math.floor(limitOption) : undefined;

    const requested = [];
    for (const result of results) {
      const toolId = normalizeToolId(result);
      if (!toolId) {
        continue;
      }
      if (!requested.includes(toolId)) {
        requested.push(toolId);
      }
    }

    const selected = [];
    const missing = [];

    for (const toolId of requested) {
      if (limit !== undefined && selected.length >= limit) {
        break;
      }

      const tool = this.toolIndex.get(toolId);
      if (tool) {
        selected.push(clone(tool));
      } else {
        missing.push(toolId);
      }
    }

    const selectedNames = new Set(selected.map(tool => tool.name));
    const examples = (this.data.examples || [])
      .filter(example => Array.isArray(example.tool_calls) && example.tool_calls.some(call => selectedNames.has(call.tool)))
      .map(example => clone(example));

    return {
      tools: selected,
      examples,
      meta: {
        requested: results.length,
        uniqueRequested: requested.length,
        returned: selected.length,
        limit: limit ?? null,
        missing
      }
    };
  }
}

export default ContextRouter;
