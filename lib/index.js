/**
 * WTF-MCP-Manager Main Entry Point
 * Each component is imported exactly once for clarity.
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
