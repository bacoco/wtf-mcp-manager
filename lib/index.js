/**
 * WTF-MCP-Manager Main Entry Point
 */

import { MCPManager } from './manager.js';
import { MCPRegistry } from './registry.js';
import { AutoDetector } from './detector.js';
import { MCPRouterService, RouterConfig, RouterIngestor, RouterRetriever } from './router/index.js';

export { MCPManager };
export { MCPRegistry };
export { AutoDetector };
export { MCPRouterService, RouterConfig, RouterIngestor, RouterRetriever };

// Re-export for convenience
export default {
  MCPManager,
  MCPRegistry,
  AutoDetector,
  MCPRouterService,
  RouterConfig,
  RouterIngestor,
  RouterRetriever
};
