import pkg, { MCPManager, MCPRegistry, AutoDetector } from 'wtf-mcp-manager';

if (!pkg) {
  throw new Error('Default export missing');
}

if (pkg.MCPManager !== MCPManager) {
  throw new Error('MCPManager mismatch');
}

if (pkg.MCPRegistry !== MCPRegistry) {
  throw new Error('MCPRegistry mismatch');
}

if (pkg.AutoDetector !== AutoDetector) {
  throw new Error('AutoDetector mismatch');
}

console.log('Default and named exports are consistent.');
