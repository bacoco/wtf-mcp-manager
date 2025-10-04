/**
 * WTF-MCP-Manager Main Entry Point
 */

export { MCPManager } from './manager.js';
export { MCPRegistry } from './registry.js';
export { AutoDetector } from './detector.js';
export { ContextRouter } from './router/context-router.js';

// Re-export for convenience
export default {
  MCPManager,
  MCPRegistry,
  AutoDetector,
  ContextRouter
};
