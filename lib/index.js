/**
 * WTF-MCP-Manager Main Entry Point
 */
import { MCPManager } from './manager.js';
import { MCPRegistry } from './registry.js';
import { AutoDetector } from './detector.js';

export { MCPManager } from './manager.js';
export { MCPRegistry } from './registry.js';
export { AutoDetector } from './detector.js';
export { VectorRouter } from './router/vector-router.js';

// Re-export for convenience
export default {
  MCPManager,
  MCPRegistry,
  AutoDetector,
  VectorRouter
};
