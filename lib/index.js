/**
 * WTF-MCP-Manager Main Entry Point
 */
import { MCPManager } from './manager.js';
import { MCPRegistry } from './registry.js';
import { AutoDetector } from './detector.js';

export { MCPManager };
export { MCPRegistry };
export { AutoDetector };

// Re-export for convenience
export default {
  MCPManager,
  MCPRegistry,
  AutoDetector
};
