/**
 * Dynamic MCP Generator
 * Generates MCP servers on-the-fly from various sources
 */

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import crypto from 'crypto';

export class DynamicMCPGenerator {
  constructor(baseDir = '.claude/dynamic-mcps') {
    this.baseDir = baseDir;
    this.activeMCPs = new Map();
    this.templates = new Map();
    this.portCounter = 9000;
  }

  async init() {
    // Create base directory for dynamic MCPs
    await fs.mkdir(this.baseDir, { recursive: true });
    await this.loadTemplates();
  }

  async loadTemplates() {
    // Load MCP generation templates
    const templatesDir = path.join(process.cwd(), 'lib', 'templates');

    this.templates.set('rest-api', {
      type: 'rest',
      language: 'javascript',
      template: await this.loadTemplate('rest-api.js.template')
    });

    this.templates.set('fastapi', {
      type: 'fastapi',
      language: 'python',
      template: await this.loadTemplate('fastapi.py.template')
    });

    this.templates.set('graphql', {
      type: 'graphql',
      language: 'javascript',
      template: await this.loadTemplate('graphql.js.template')
    });

    this.templates.set('websocket', {
      type: 'websocket',
      language: 'javascript',
      template: await this.loadTemplate('websocket.js.template')
    });
  }

  async loadTemplate(filename) {
    try {
      const templatePath = path.join(process.cwd(), 'lib', 'templates', filename);
      return await fs.readFile(templatePath, 'utf-8');
    } catch (error) {
      // Return a basic template if file doesn't exist yet
      return this.getDefaultTemplate(filename);
    }
  }

  getDefaultTemplate(filename) {
    if (filename.includes('rest-api')) {
      return `
#!/usr/bin/env node

/**
 * Generated MCP Server for {{API_NAME}}
 * Created: {{TIMESTAMP}}
 */

import { readFileSync } from 'fs';

class {{CLASS_NAME}}MCPServer {
  constructor() {
    this.apiBase = '{{API_BASE}}';
    this.tools = [];
    this.resources = [];
  }

  async initialize() {
    console.error('🚀 {{API_NAME}} MCP Server starting...');
    this.setupTools();
    this.setupResources();
  }

  setupTools() {
    {{TOOLS_SETUP}}
  }

  setupResources() {
    {{RESOURCES_SETUP}}
  }

  async handleRequest(method, params = {}) {
    try {
      switch (method) {
        {{REQUEST_HANDLERS}}
        default:
          throw new Error(\`Unknown method: \${method}\`);
      }
    } catch (error) {
      return { error: error.message };
    }
  }

  async run() {
    await this.initialize();

    // MCP Protocol handling
    process.stdin.setEncoding('utf-8');
    let buffer = '';

    process.stdin.on('data', async (chunk) => {
      buffer += chunk;
      let lines = buffer.split('\\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            const request = JSON.parse(line);
            const response = await this.handleProtocol(request);
            console.log(JSON.stringify(response));
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
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {}, resources: {} },
          serverInfo: { name: "{{API_NAME}}-mcp", version: "1.0.0" }
        }
      };
    }

    if (request.method === 'tools/list') {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: { tools: this.tools }
      };
    }

    if (request.method === 'resources/list') {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: { resources: this.resources }
      };
    }

    if (request.method === 'tools/call') {
      const result = await this.handleRequest(request.params.name, request.params.arguments);
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2)
          }]
        }
      };
    }

    return {
      jsonrpc: "2.0",
      id: request.id,
      error: { code: -32601, message: "Method not found" }
    };
  }
}

// Run the server
const server = new {{CLASS_NAME}}MCPServer();
server.run().catch(console.error);
`;
    }

    if (filename.includes('fastapi')) {
      return `
#!/usr/bin/env python3
"""
Generated MCP Server for {{API_NAME}}
Created: {{TIMESTAMP}}
Using FastAPI-MCP integration
"""

from fastapi import FastAPI
from fastapi_mcp import FastApiMCP
import json
import sys

app = FastAPI(title="{{API_NAME}}")

# Generated endpoints
{{ENDPOINTS}}

# Add MCP wrapper
mcp = FastApiMCP(app)
mcp.mount()

if __name__ == "__main__":
    # Run as MCP server
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port={{PORT}})
`;
    }

    return '// Template not found';
  }

  async generateFromAPI(apiSpec, options = {}) {
    const mcpId = options.id || this.generateMCPId(apiSpec.name);
    const mcpDir = path.join(this.baseDir, mcpId);

    // Create directory for this MCP
    await fs.mkdir(mcpDir, { recursive: true });

    // Select template based on API type
    const templateType = this.detectAPIType(apiSpec);
    const template = this.templates.get(templateType);

    if (!template) {
      throw new Error(`No template available for API type: ${templateType}`);
    }

    // Generate MCP code
    const code = await this.generateCode(apiSpec, template);

    // Write MCP server file
    const serverFile = path.resolve(
      mcpDir,
      `server.${template.language === 'python' ? 'py' : 'js'}`
    );
    await fs.writeFile(serverFile, code);
    await fs.chmod(serverFile, 0o755);

    // Create package.json or requirements.txt
    if (template.language === 'javascript') {
      await this.createPackageJson(mcpDir, apiSpec);
    } else if (template.language === 'python') {
      await this.createRequirementsTxt(mcpDir, apiSpec);
    }

    // Generate configuration
    const config = {
      id: mcpId,
      name: apiSpec.name,
      type: templateType,
      language: template.language,
      serverFile,
      port: this.portCounter++,
      created: new Date().toISOString(),
      apiSpec: apiSpec
    };

    await fs.writeFile(
      path.join(mcpDir, 'config.json'),
      JSON.stringify(config, null, 2)
    );

    return config;
  }

  detectAPIType(apiSpec) {
    if (apiSpec.openapi || apiSpec.swagger) return 'rest-api';
    if (apiSpec.graphql) return 'graphql';
    if (apiSpec.fastapi) return 'fastapi';
    if (apiSpec.websocket) return 'websocket';
    return 'rest-api'; // Default
  }

  async generateCode(apiSpec, template) {
    let code = template.template;

    // Replace placeholders
    code = code.replace(/{{API_NAME}}/g, apiSpec.name);
    code = code.replace(/{{CLASS_NAME}}/g, this.toPascalCase(apiSpec.name));
    code = code.replace(/{{API_BASE}}/g, apiSpec.baseUrl || '');
    code = code.replace(/{{TIMESTAMP}}/g, new Date().toISOString());
    code = code.replace(/{{PORT}}/g, this.portCounter);

    // Generate tools from endpoints
    const tools = this.generateTools(apiSpec);
    code = code.replace(/{{TOOLS_SETUP}}/g, tools.setup);
    code = code.replace(/{{REQUEST_HANDLERS}}/g, tools.handlers);

    // Generate resources
    const resources = this.generateResources(apiSpec);
    code = code.replace(/{{RESOURCES_SETUP}}/g, resources.setup);

    // For FastAPI template
    if (template.type === 'fastapi') {
      const endpoints = this.generateFastAPIEndpoints(apiSpec);
      code = code.replace(/{{ENDPOINTS}}/g, endpoints);
    }

    return code;
  }

  generateTools(apiSpec) {
    const tools = [];
    const handlers = [];

    if (apiSpec.endpoints) {
      apiSpec.endpoints.forEach(endpoint => {
        const toolName = this.endpointToToolName(endpoint);

        tools.push(`
    this.tools.push({
      name: "${toolName}",
      description: "${endpoint.description || `Call ${endpoint.path}`}",
      inputSchema: ${JSON.stringify(endpoint.parameters || {}, null, 6)}
    });`);

        handlers.push(`
        case '${toolName}':
          return await this.${toolName}(params);`);
      });
    }

    return {
      setup: tools.join('\n'),
      handlers: handlers.join('\n')
    };
  }

  generateResources(apiSpec) {
    const resources = [];

    if (apiSpec.resources) {
      apiSpec.resources.forEach(resource => {
        resources.push(`
    this.resources.push({
      uri: "mcp://${apiSpec.name}/${resource.path}",
      name: "${resource.name}",
      description: "${resource.description || ''}"
    });`);
      });
    }

    return {
      setup: resources.join('\n')
    };
  }

  generateFastAPIEndpoints(apiSpec) {
    const endpoints = [];

    if (apiSpec.endpoints) {
      apiSpec.endpoints.forEach(endpoint => {
        const method = endpoint.method?.toLowerCase() || 'get';
        const funcName = this.endpointToToolName(endpoint);

        endpoints.push(`
@app.${method}("${endpoint.path}")
async def ${funcName}(${this.generateParams(endpoint.parameters)}):
    """${endpoint.description || ''}"""
    # Generated endpoint implementation
    return {"message": "Generated endpoint for ${endpoint.path}"}`);
      });
    }

    return endpoints.join('\n');
  }

  generateParams(parameters) {
    if (!parameters || Object.keys(parameters).length === 0) {
      return '';
    }

    return Object.entries(parameters.properties || {})
      .map(([name, schema]) => {
        const type = this.schemaTypeToPython(schema.type);
        const required = parameters.required?.includes(name);
        return required ? `${name}: ${type}` : `${name}: ${type} = None`;
      })
      .join(', ');
  }

  schemaTypeToPython(type) {
    const typeMap = {
      'string': 'str',
      'integer': 'int',
      'number': 'float',
      'boolean': 'bool',
      'array': 'list',
      'object': 'dict'
    };
    return typeMap[type] || 'Any';
  }

  endpointToToolName(endpoint) {
    // Convert endpoint path to tool name
    // e.g., /users/{id} -> get_user_by_id
    const method = endpoint.method?.toLowerCase() || 'get';
    const path = endpoint.path
      .replace(/[{}]/g, '')
      .replace(/\//g, '_')
      .replace(/-/g, '_')
      .replace(/^_+|_+$/g, '');

    return `${method}${path}`;
  }

  toPascalCase(str) {
    return str
      .replace(/[-_\s]+/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  }

  generateMCPId(name) {
    const clean = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const hash = crypto.randomBytes(4).toString('hex');
    return `${clean}-${hash}`;
  }

  async createPackageJson(mcpDir, apiSpec) {
    const packageJson = {
      name: `${apiSpec.name}-mcp`,
      version: "1.0.0",
      type: "module",
      description: `Generated MCP server for ${apiSpec.name}`,
      main: "server.js",
      scripts: {
        start: "node server.js"
      },
      dependencies: {
        "node-fetch": "^3.0.0"
      }
    };

    await fs.writeFile(
      path.join(mcpDir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );
  }

  async createRequirementsTxt(mcpDir, apiSpec) {
    const requirements = [
      'fastapi>=0.100.0',
      'fastapi-mcp>=1.0.0',
      'uvicorn>=0.23.0',
      'requests>=2.31.0'
    ];

    await fs.writeFile(
      path.join(mcpDir, 'requirements.txt'),
      requirements.join('\n')
    );
  }

  async deployMCP(mcpId) {
    const mcpDir = path.join(this.baseDir, mcpId);
    const configPath = path.join(mcpDir, 'config.json');

    // Read configuration
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));

    // Install dependencies
    if (config.language === 'javascript') {
      await this.runCommand('npm', ['install'], { cwd: mcpDir });
    } else if (config.language === 'python') {
      await this.runCommand('pip', ['install', '-r', 'requirements.txt'], { cwd: mcpDir });
    }

    // Start the MCP server
    const process = this.startMCPProcess(config);

    // Track active MCP
    this.activeMCPs.set(mcpId, {
      config,
      process,
      startTime: new Date()
    });

    return {
      id: mcpId,
      status: 'running',
      port: config.port,
      pid: process.pid
    };
  }

  startMCPProcess(config) {
    const command = config.language === 'python' ? 'python' : 'node';
    const serverPath = path.resolve(config.serverFile);
    const args = [path.basename(serverPath)];

    const process = spawn(command, args, {
      cwd: path.dirname(serverPath),
      stdio: ['pipe', 'pipe', 'pipe']
    });

    process.on('error', (error) => {
      console.error(`MCP ${config.id} error:`, error);
    });

    process.on('exit', (code) => {
      console.error(`MCP ${config.id} exited with code ${code}`);
      this.activeMCPs.delete(config.id);
    });

    return process;
  }

  async stopMCP(mcpId) {
    const activeMCP = this.activeMCPs.get(mcpId);

    if (!activeMCP) {
      throw new Error(`MCP ${mcpId} is not running`);
    }

    // Kill the process
    activeMCP.process.kill();
    this.activeMCPs.delete(mcpId);

    return {
      id: mcpId,
      status: 'stopped'
    };
  }

  async listActiveMCPs() {
    const mcps = [];

    for (const [id, info] of this.activeMCPs.entries()) {
      mcps.push({
        id,
        name: info.config.name,
        type: info.config.type,
        port: info.config.port,
        pid: info.process.pid,
        uptime: Date.now() - info.startTime.getTime()
      });
    }

    return mcps;
  }

  async runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, options);
      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Command failed: ${stderr}`));
        }
      });
    });
  }
}

export default DynamicMCPGenerator;