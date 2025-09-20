/**
 * MCP Runtime Client
 * Executes real API calls through generated MCP servers
 * NO Claude, only generated MCP code
 */

import { spawn } from 'child_process';
import readline from 'readline';
import path from 'path';
import fs from 'fs/promises';

export class MCPRuntimeClient {
  constructor(mcpPath) {
    this.mcpPath = mcpPath;
    this.process = null;
    this.rl = null;
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.initialized = false;
  }

  /**
   * Start the MCP server process
   */
  async start() {
    console.log(`🚀 Starting MCP server at ${this.mcpPath}`);

    // Find the server file
    const files = await fs.readdir(this.mcpPath);
    const serverFile = files.find(f => f.startsWith('server.') && (f.endsWith('.js') || f.endsWith('.py')));

    if (!serverFile) {
      throw new Error(`No server file found in ${this.mcpPath}`);
    }

    const serverPath = path.join(this.mcpPath, serverFile);
    const isNode = serverFile.endsWith('.js');

    // Spawn the MCP process
    this.process = spawn(
      isNode ? 'node' : 'python3',
      [serverPath],
      {
        stdio: ['pipe', 'pipe', 'pipe']
      }
    );

    // Setup readline for communication
    this.rl = readline.createInterface({
      input: this.process.stdout,
      crlfDelay: Infinity
    });

    // Handle responses from MCP
    this.rl.on('line', (line) => {
      try {
        const response = JSON.parse(line);
        this.handleResponse(response);
      } catch (error) {
        console.error('Failed to parse MCP response:', error);
      }
    });

    // Handle errors
    this.process.stderr.on('data', (data) => {
      console.error(`MCP Error: ${data}`);
    });

    this.process.on('error', (error) => {
      console.error(`Failed to start MCP: ${error}`);
    });

    // Initialize the MCP
    await this.initialize();
  }

  /**
   * Initialize MCP protocol
   */
  async initialize() {
    const initRequest = {
      jsonrpc: '2.0',
      id: this.requestId++,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {}
      }
    };

    const response = await this.sendRequest(initRequest);

    if (response.result) {
      this.initialized = true;
      console.log(`✅ MCP initialized: ${response.result.serverInfo?.name || 'Unknown'}`);
      return response.result;
    }

    throw new Error('Failed to initialize MCP');
  }

  /**
   * List available tools
   */
  async listTools() {
    const request = {
      jsonrpc: '2.0',
      id: this.requestId++,
      method: 'tools/list'
    };

    const response = await this.sendRequest(request);
    return response.result?.tools || [];
  }

  /**
   * Call a tool with parameters
   */
  async callTool(toolName, parameters = {}) {
    if (!this.initialized) {
      throw new Error('MCP not initialized');
    }

    const request = {
      jsonrpc: '2.0',
      id: this.requestId++,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: parameters
      }
    };

    console.log(`📡 Calling tool: ${toolName}`);
    const response = await this.sendRequest(request);

    if (response.error) {
      throw new Error(`Tool call failed: ${response.error.message}`);
    }

    // Extract the actual result from MCP response format
    if (response.result?.content?.[0]?.text) {
      try {
        return JSON.parse(response.result.content[0].text);
      } catch {
        return response.result.content[0].text;
      }
    }

    return response.result;
  }

  /**
   * Send request to MCP and wait for response
   */
  sendRequest(request) {
    return new Promise((resolve, reject) => {
      const id = request.id;

      // Store the promise handlers
      this.pendingRequests.set(id, { resolve, reject });

      // Send the request
      this.process.stdin.write(JSON.stringify(request) + '\n');

      // Set timeout
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000); // 30 second timeout
    });
  }

  /**
   * Handle response from MCP
   */
  handleResponse(response) {
    const id = response.id;

    if (this.pendingRequests.has(id)) {
      const { resolve } = this.pendingRequests.get(id);
      this.pendingRequests.delete(id);
      resolve(response);
    }
  }

  /**
   * Stop the MCP server
   */
  async stop() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }

    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }

    this.initialized = false;
    console.log('🛑 MCP server stopped');
  }
}

/**
 * Execute real API calls through generated MCPs
 */
export class MCPExecutor {
  constructor() {
    this.clients = new Map();
  }

  /**
   * Start an MCP and add to pool
   */
  async startMCP(mcpId, mcpPath) {
    const client = new MCPRuntimeClient(mcpPath);
    await client.start();
    this.clients.set(mcpId, client);
    return client;
  }

  /**
   * Execute a tool on a specific MCP
   */
  async executeTool(mcpId, toolName, parameters) {
    const client = this.clients.get(mcpId);

    if (!client) {
      throw new Error(`MCP ${mcpId} not found`);
    }

    return await client.callTool(toolName, parameters);
  }

  /**
   * List all tools from an MCP
   */
  async listTools(mcpId) {
    const client = this.clients.get(mcpId);

    if (!client) {
      throw new Error(`MCP ${mcpId} not found`);
    }

    return await client.listTools();
  }

  /**
   * Stop all MCPs
   */
  async stopAll() {
    for (const [mcpId, client] of this.clients) {
      await client.stop();
    }
    this.clients.clear();
  }
}

export default MCPExecutor;