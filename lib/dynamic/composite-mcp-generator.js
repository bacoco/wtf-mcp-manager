/**
 * Composite MCP Generator
 * Merges multiple APIs into a single MCP
 * One MCP with routes from different APIs
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export class CompositeMCPGenerator {
  constructor() {
    this.baseDir = '.claude/composite-mcps';
  }

  /**
   * Generate a SINGLE MCP that combines multiple APIs
   * Perfect for agents that need coordinated access to different services
   */
  async generateCompositeMCP(apis, options = {}) {
    const compositeName = options.name || 'composite-mcp';
    const mcpId = options.id || `mcp_${compositeName.replace(/[^a-z0-9]/gi, '_')}`;
    const mcpDir = path.join(this.baseDir, mcpId);

    console.log(`🔧 Generating Composite MCP: ${compositeName}`);
    console.log(`   Combining ${apis.length} APIs into ONE MCP`);

    // Create directory
    await fs.mkdir(mcpDir, { recursive: true });

    // Generate the composite MCP code
    const mcpCode = this.generateCompositeMCPCode(apis, compositeName);

    // Write the server file
    const serverFile = path.join(mcpDir, 'server.js');
    await fs.writeFile(serverFile, mcpCode);
    await fs.chmod(serverFile, 0o755);

    // Create package.json
    await this.createPackageJson(mcpDir, compositeName, apis);

    // Create config
    const config = {
      id: mcpId,
      name: compositeName,
      type: 'composite',
      apis: apis.map(api => ({
        name: api.name,
        baseUrl: api.baseUrl,
        endpoints: api.endpoints?.length || 0
      })),
      totalTools: this.countTotalTools(apis),
      created: new Date().toISOString()
    };

    await fs.writeFile(
      path.join(mcpDir, 'config.json'),
      JSON.stringify(config, null, 2)
    );

    console.log(`✅ Composite MCP generated with ${config.totalTools} tools`);

    return {
      success: true,
      mcpId,
      path: mcpDir,
      serverFile,
      totalTools: config.totalTools,
      apis: config.apis
    };
  }

  /**
   * Generate the actual MCP server code combining all APIs
   */
  generateCompositeMCPCode(apis, name) {
    const className = name.replace(/[^a-zA-Z0-9]/g, '');

    // Generate tool definitions for all APIs
    const toolsSetup = this.generateToolsSetup(apis);

    // Generate request handlers for all APIs
    const requestHandlers = this.generateRequestHandlers(apis);

    // Generate tool implementations
    const toolImplementations = this.generateToolImplementations(apis);

    return `#!/usr/bin/env node

/**
 * Composite MCP Server: ${name}
 * Combines ${apis.length} APIs in a single MCP
 * Generated: ${new Date().toISOString()}
 */

import fetch from 'node-fetch';

class ${className}CompositeMCP {
  constructor() {
    // API configurations
    this.apis = {
${apis.map(api => `      '${api.name}': {
        baseUrl: '${api.baseUrl}',
        auth: '${api.auth || 'none'}',
        headers: ${JSON.stringify(api.headers || {})}
      }`).join(',\n')}
    };

    this.tools = [];
  }

  async initialize() {
    console.error('🚀 Composite MCP Server starting...');
    console.error('   APIs integrated: ${apis.map(a => a.name).join(', ')}');
    this.setupTools();
  }

  setupTools() {
${toolsSetup}
  }

  async handleRequest(method, params = {}) {
    try {
      switch (method) {
${requestHandlers}
        default:
          throw new Error(\`Unknown method: \${method}\`);
      }
    } catch (error) {
      return { error: error.message };
    }
  }

  // API call implementations
${toolImplementations}

  // Helper function for making API calls
  async makeAPICall(apiName, endpoint, params = {}) {
    const api = this.apis[apiName];
    if (!api) {
      throw new Error(\`Unknown API: \${apiName}\`);
    }

    // Build URL with parameters
    let url = \`\${api.baseUrl}\${endpoint}\`;

    // Handle path parameters (e.g., /users/{id})
    Object.keys(params).forEach(key => {
      if (url.includes(\`{\${key}}\`)) {
        url = url.replace(\`{\${key}}\`, params[key]);
        delete params[key];
      }
    });

    // Add query parameters
    const queryParams = new URLSearchParams();
    Object.keys(params).forEach(key => {
      if (params[key] !== undefined) {
        queryParams.append(key, params[key]);
      }
    });

    if (queryParams.toString()) {
      url += \`?\${queryParams}\`;
    }

    // Make the request
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          ...api.headers,
          'User-Agent': 'Composite-MCP/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(\`API call failed: \${response.status} \${response.statusText}\`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error(\`API call error (\${apiName}): \`, error);
      throw error;
    }
  }

  // MCP Protocol implementation
  async run() {
    await this.initialize();
    process.stdin.setEncoding('utf-8');
    let buffer = '';

    process.stdin.on('data', async (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            const request = JSON.parse(line);
            await this.handleProtocol(request);
          } catch (error) {
            console.log(JSON.stringify({
              jsonrpc: "2.0",
              error: { code: -32700, message: "Parse error" }
            }));
          }
        }
      }
    });
  }

  async handleProtocol(request) {
    if (request.method === 'initialize') {
      console.log(JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: {
            name: "${name}",
            version: "1.0.0",
            type: "composite",
            apis: ${apis.length}
          }
        }
      }));
    } else if (request.method === 'tools/list') {
      console.log(JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        result: { tools: this.tools }
      }));
    } else if (request.method === 'tools/call') {
      const result = await this.handleRequest(request.params.name, request.params.arguments);
      console.log(JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        result: {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2)
          }]
        }
      }));
    } else {
      console.log(JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32601, message: "Method not found" }
      }));
    }
  }
}

// Run the server
const server = new ${className}CompositeMCP();
server.run().catch(console.error);
`;
  }

  /**
   * Generate tool setup code for all APIs
   */
  generateToolsSetup(apis) {
    const tools = [];

    apis.forEach(api => {
      if (api.endpoints && Array.isArray(api.endpoints)) {
        api.endpoints.forEach(endpoint => {
          const toolName = this.createToolName(api.name, endpoint);
          const params = endpoint.parameters || { type: 'object', properties: {} };

          tools.push(`    this.tools.push({
      name: "${toolName}",
      description: "${endpoint.description || `${api.name}: ${endpoint.method} ${endpoint.path}`}",
      inputSchema: ${JSON.stringify(params, null, 6).split('\n').join('\n      ')}
    });`);
        });
      }
    });

    return tools.join('\n\n');
  }

  /**
   * Generate request handler cases
   */
  generateRequestHandlers(apis) {
    const handlers = [];

    apis.forEach(api => {
      if (api.endpoints && Array.isArray(api.endpoints)) {
        api.endpoints.forEach(endpoint => {
          const toolName = this.createToolName(api.name, endpoint);
          handlers.push(`        case '${toolName}':
          return await this.${toolName}(params);`);
        });
      }
    });

    return handlers.join('\n');
  }

  /**
   * Generate tool implementation methods
   */
  generateToolImplementations(apis) {
    const implementations = [];

    apis.forEach(api => {
      if (api.endpoints && Array.isArray(api.endpoints)) {
        api.endpoints.forEach(endpoint => {
          const toolName = this.createToolName(api.name, endpoint);

          implementations.push(`  async ${toolName}(params) {
    // Call ${api.name} API: ${endpoint.path}
    return await this.makeAPICall('${api.name}', '${endpoint.path}', params);
  }`);
        });
      }
    });

    return implementations.join('\n\n');
  }

  /**
   * Create unique tool name combining API and endpoint
   */
  createToolName(apiName, endpoint) {
    const apiPrefix = apiName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const method = (endpoint.method || 'get').toLowerCase();

    // Extract meaningful path parts
    const pathParts = endpoint.path
      .split('/')
      .filter(p => p && !p.startsWith('{'))
      .map(p => p.replace(/[^a-z0-9]/gi, '_'));

    // Create unique tool name
    if (pathParts.length > 0) {
      return `${apiPrefix}_${method}_${pathParts.join('_')}`;
    } else {
      return `${apiPrefix}_${method}`;
    }
  }

  /**
   * Count total tools across all APIs
   */
  countTotalTools(apis) {
    return apis.reduce((total, api) => {
      return total + (api.endpoints?.length || 0);
    }, 0);
  }

  /**
   * Create package.json for the composite MCP
   */
  async createPackageJson(mcpDir, name, apis) {
    const packageJson = {
      name: `${name}-composite-mcp`,
      version: '1.0.0',
      description: `Composite MCP combining ${apis.length} APIs`,
      type: 'module',
      main: 'server.js',
      scripts: {
        start: 'node server.js'
      },
      dependencies: {
        'node-fetch': '^3.3.0'
      },
      mcp: {
        type: 'composite',
        apis: apis.map(a => a.name)
      }
    };

    await fs.writeFile(
      path.join(mcpDir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );
  }

  /**
   * Generate composite MCP for specific use case
   * Example: Gas prices + Maps + Weather for France
   */
  async generateFranceComposite() {
    const apis = [
      {
        name: 'PrixCarburants',
        baseUrl: 'https://data.economie.gouv.fr/api/records/1.0',
        auth: 'none',
        endpoints: [
          {
            path: '/search/',
            method: 'GET',
            description: 'Recherche prix carburants par département',
            parameters: {
              type: 'object',
              properties: {
                dataset: {
                  type: 'string',
                  default: 'prix-carburants-fichier-instantane-test-ods-copie'
                },
                q: { type: 'string', description: 'Query' },
                facet: { type: 'string', description: 'Facet (e.g., dep_code)' },
                rows: { type: 'number', description: 'Number of results' }
              }
            }
          }
        ]
      },
      {
        name: 'OpenWeather',
        baseUrl: 'https://api.openweathermap.org/data/2.5',
        auth: 'apiKey',
        endpoints: [
          {
            path: '/weather',
            method: 'GET',
            description: 'Get current weather',
            parameters: {
              type: 'object',
              properties: {
                q: { type: 'string', description: 'City name' },
                lat: { type: 'number', description: 'Latitude' },
                lon: { type: 'number', description: 'Longitude' },
                appid: { type: 'string', description: 'API key' },
                units: { type: 'string', default: 'metric' }
              },
              required: ['appid']
            }
          }
        ]
      },
      {
        name: 'Nominatim',
        baseUrl: 'https://nominatim.openstreetmap.org',
        auth: 'none',
        headers: {
          'User-Agent': 'CompositeMCP/1.0'
        },
        endpoints: [
          {
            path: '/search',
            method: 'GET',
            description: 'Geocode address to coordinates',
            parameters: {
              type: 'object',
              properties: {
                q: { type: 'string', description: 'Search query' },
                format: { type: 'string', default: 'json' },
                limit: { type: 'number', default: 1 }
              },
              required: ['q']
            }
          },
          {
            path: '/reverse',
            method: 'GET',
            description: 'Reverse geocode coordinates to address',
            parameters: {
              type: 'object',
              properties: {
                lat: { type: 'number', description: 'Latitude' },
                lon: { type: 'number', description: 'Longitude' },
                format: { type: 'string', default: 'json' }
              },
              required: ['lat', 'lon']
            }
          }
        ]
      }
    ];

    return await this.generateCompositeMCP(apis, {
      name: 'france-gas-weather-maps',
      id: 'mcp_france_composite'
    });
  }
}

export default CompositeMCPGenerator;