/**
 * WTF-MCP-Manager Main Entry Point
 */
import { MCPManager } from './manager.js';
import { MCPRegistry } from './registry.js';
import { AutoDetector } from './detector.js';
import { VectorRouter } from './router/vector-router.js';

export { MCPManager, MCPRegistry, AutoDetector, VectorRouter };

// Re-export for convenience
export default {
  MCPManager,
  MCPRegistry,
  AutoDetector,
  VectorRouter
};
