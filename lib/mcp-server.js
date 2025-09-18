#!/usr/bin/env node

/**
 * WTF-MCP-Manager Meta Server
 * A real MCP server that can be used by Claude to manage other MCPs
 */

import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import { MCPManager } from './manager.js';
import { MCPRegistry } from './registry.js';
import { AutoDetector } from './detector.js';

class WTFMCPManagerServer {
  constructor() {
    this.manager = new MCPManager();
    this.registry = new MCPRegistry();
    this.detector = new AutoDetector();
    this.availableMCPs = null;
    this.lastFetchTime = null;
    this.FETCH_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
  }

  /**
   * Analyze global and project-level MCP configurations
   */
  async analyzeMCPEnvironment() {
    const analysis = {
      timestamp: new Date().toISOString(),
      global: { config: null, mcps: [], configPath: null },
      project: { config: null, mcps: [], configPath: null },
      conflicts: [],
      recommendations: []
    };

    // Analyze global Claude configuration
    const globalPaths = [
      join(homedir(), '.config', 'claude', 'claude_desktop_config.json'),
      join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
      join(homedir(), 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json'),
      join(homedir(), '.claude', 'config.json'),
      join(homedir(), '.claude.json')
    ];

    for (const configPath of globalPaths) {
      if (existsSync(configPath)) {
        try {
          const config = JSON.parse(readFileSync(configPath, 'utf-8'));
          analysis.global.config = config;
          analysis.global.configPath = configPath;
          analysis.global.mcps = Object.keys(config.mcpServers || {});
          break;
        } catch (error) {
          console.error(`Error reading global config ${configPath}:`, error.message);
        }
      }
    }

    // Analyze project-level configuration
    try {
      const projectConfig = await this.manager.load();
      analysis.project.config = projectConfig;
      analysis.project.configPath = this.manager.configFile;
      analysis.project.mcps = Object.keys(projectConfig.mcpServers || {});
    } catch (error) {
      // No project config found
    }

    // Detect conflicts
    const globalMCPs = new Set(analysis.global.mcps);
    const projectMCPs = new Set(analysis.project.mcps);

    for (const mcpId of projectMCPs) {
      if (globalMCPs.has(mcpId)) {
        analysis.conflicts.push({
          type: 'duplicate',
          mcp: mcpId,
          message: `MCP "${mcpId}" is configured both globally and in project`,
          severity: 'warning',
          recommendation: 'Consider removing from global config for project-specific usage'
        });
      }
    }

    // Generate recommendations
    if (analysis.global.mcps.length > 5) {
      analysis.recommendations.push({
        type: 'optimization',
        message: `${analysis.global.mcps.length} global MCPs detected - consider project-specific configs`,
        action: 'Move some MCPs to project-level for better isolation'
      });
    }

    if (analysis.project.mcps.length === 0 && analysis.global.mcps.length === 0) {
      analysis.recommendations.push({
        type: 'setup',
        message: 'No MCPs configured yet',
        action: 'Run auto-detection to discover relevant MCPs for this project'
      });
    }

    return analysis;
  }

  /**
   * Fetch available MCPs from the official registry
   */
  async fetchAvailableMCPs(force = false) {
    const now = Date.now();

    // Use cache if available and not expired
    if (!force && this.availableMCPs && this.lastFetchTime &&
        (now - this.lastFetchTime) < this.FETCH_CACHE_TTL) {
      return {
        mcps: this.availableMCPs,
        cached: true,
        lastFetch: new Date(this.lastFetchTime).toISOString()
      };
    }

    try {
      console.log('🔍 Fetching latest MCP registry...');
      const response = await fetch('https://modelcontextprotocol.io/llms-full.txt');
      const text = await response.text();

      this.availableMCPs = this.parseMCPRegistry(text);
      this.lastFetchTime = now;

      return {
        mcps: this.availableMCPs,
        cached: false,
        lastFetch: new Date(this.lastFetchTime).toISOString(),
        count: Object.keys(this.availableMCPs).length
      };
    } catch (error) {
      console.error('Failed to fetch MCP registry:', error.message);

      // Fallback to built-in registry
      this.availableMCPs = this.registry.getAll();
      this.lastFetchTime = now;

      return {
        mcps: this.availableMCPs,
        cached: false,
        fallback: true,
        error: error.message,
        count: Object.keys(this.availableMCPs).length
      };
    }
  }

  /**
   * Parse the MCP registry text file
   */
  parseMCPRegistry(text) {
    const mcps = {};

    // Enhanced parsing patterns
    const patterns = [
      // Official MCP servers
      /@modelcontextprotocol\/server-[\w-]+/gi,
      // Supabase MCP
      /@supabase\/mcp-server-[\w-]+/gi,
      // Other common patterns
      /mcp-server-[\w-]+/gi,
      /[\w-]+-mcp-server/gi,
      /@[\w-]+\/[\w-]*mcp[\w-]*/gi,
      /@[\w-]+\/server-[\w-]+/gi
    ];

    const foundPackages = new Set();

    patterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => foundPackages.add(match.toLowerCase()));
      }
    });

    // Convert to structured format
    foundPackages.forEach(pkg => {
      const id = this.extractMCPId(pkg);
      if (id && !mcps[id]) {
        mcps[id] = {
          id,
          package: pkg,
          name: this.formatMCPName(id),
          description: this.inferDescription(id),
          categories: this.inferCategories(id),
          source: 'registry'
        };
      }
    });

    // Merge with built-in registry for metadata
    const builtInMCPs = this.registry.getAll();
    Object.keys(builtInMCPs).forEach(id => {
      if (!mcps[id]) {
        mcps[id] = { ...builtInMCPs[id], source: 'builtin' };
      } else {
        // Enhance with built-in metadata
        mcps[id] = { ...builtInMCPs[id], ...mcps[id], source: 'both' };
      }
    });

    return mcps;
  }

  extractMCPId(packageName) {
    // Extract meaningful ID from package name
    const name = packageName.split('/').pop();
    return name
      .replace(/^(mcp-)?server-/, '')
      .replace(/-mcp-server$/, '')
      .replace(/^@[\w-]+\//, '');
  }

  formatMCPName(id) {
    return id.split('-').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }

  inferDescription(id) {
    const descriptions = {
      'supabase': 'Database, storage and authentication platform',
      'github': 'GitHub repositories, issues, and version control',
      'slack': 'Slack messaging and workspace integration',
      'notion': 'Notion workspace and knowledge management',
      'postgres': 'PostgreSQL database operations',
      'sqlite': 'SQLite local database management',
      'brave': 'Brave search engine integration',
      'gdrive': 'Google Drive storage and file management',
      'aws': 'Amazon Web Services cloud platform',
      'docker': 'Docker container management',
      'linear': 'Linear issue tracking and project management',
      'vercel': 'Vercel deployment and hosting platform',
      'anthropic': 'Anthropic Claude API integration',
      'openai': 'OpenAI API and models integration',
      'firecrawl': 'Web scraping and content extraction',
      'playwright': 'Browser automation and testing'
    };

    for (const [key, desc] of Object.entries(descriptions)) {
      if (id.toLowerCase().includes(key)) {
        return desc;
      }
    }

    return `${this.formatMCPName(id)} integration and automation`;
  }

  inferCategories(id) {
    const categoryMap = {
      database: ['postgres', 'sqlite', 'mongodb', 'mysql', 'redis', 'supabase', 'neon'],
      storage: ['s3', 'gdrive', 'dropbox', 'blob', 'supabase', 'drive'],
      search: ['brave', 'google', 'bing', 'exa', 'tavily'],
      ai: ['openai', 'anthropic', 'huggingface', 'replicate', 'claude'],
      communication: ['slack', 'discord', 'email', 'telegram', 'teams'],
      development: ['github', 'gitlab', 'git', 'docker', 'ci'],
      cloud: ['aws', 'gcp', 'azure', 'vercel', 'netlify'],
      productivity: ['notion', 'obsidian', 'linear', 'jira', 'asana'],
      testing: ['playwright', 'puppeteer', 'selenium'],
      scraping: ['firecrawl', 'puppeteer', 'playwright', 'scrapy']
    };

    const categories = [];
    for (const [category, keywords] of Object.entries(categoryMap)) {
      if (keywords.some(keyword => id.toLowerCase().includes(keyword))) {
        categories.push(category);
      }
    }

    return categories.length > 0 ? categories : ['general'];
  }

  /**
   * Process MCP server requests
   */
  async handleRequest(method, params = {}) {
    try {
      switch (method) {
        case 'analyze_environment':
          return await this.analyzeMCPEnvironment();

        case 'fetch_mcps':
          return await this.fetchAvailableMCPs(params.force);

        case 'list_mcps':
          try {
            const mcpList = await this.manager.list(params);
            return Array.isArray(mcpList) ? mcpList : [];
          } catch (error) {
            // If no config exists, return available MCPs from registry
            const allMCPs = this.registry.getAll();
            return Object.entries(allMCPs).map(([id, info]) => ({
              id,
              name: info.name,
              description: info.description,
              enabled: false,
              env: null,
              categories: info.categories || []
            }));
          }

        case 'enable_mcp':
          if (!params.mcpId) throw new Error('mcpId required');
          return await this.manager.enable(params.mcpId, params.envVars || {});

        case 'disable_mcp':
          if (!params.mcpId) throw new Error('mcpId required');
          return await this.manager.disable(params.mcpId);

        case 'auto_detect':
          return await this.detector.scan();

        case 'search_mcps':
          const searchResults = await this.searchMCPs(params.query || '');
          return searchResults;

        case 'diagnose':
          return await this.manager.diagnose();

        case 'get_mcp_info':
          if (!params.mcpId) throw new Error('mcpId required');
          return this.getMCPInfo(params.mcpId);

        case 'suggest_mcps':
          return await this.suggestMCPs(params.requirements || '');

        default:
          throw new Error(`Unknown method: ${method}`);
      }
    } catch (error) {
      return {
        error: error.message,
        method,
        params
      };
    }
  }

  async searchMCPs(query) {
    if (!this.availableMCPs) {
      await this.fetchAvailableMCPs();
    }

    const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const results = [];

    for (const [id, mcp] of Object.entries(this.availableMCPs)) {
      let score = 0;

      keywords.forEach(keyword => {
        if (mcp.name.toLowerCase().includes(keyword)) score += 3;
        if (mcp.description.toLowerCase().includes(keyword)) score += 2;
        if (mcp.categories.some(cat => cat.includes(keyword))) score += 2;
        if (id.includes(keyword)) score += 1;
      });

      if (score > 0) {
        results.push({ ...mcp, score });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, 10);
  }

  async suggestMCPs(requirements) {
    const analysis = await this.analyzeMCPEnvironment();
    const detected = await this.detector.scan();
    const searchResults = await this.searchMCPs(requirements);

    return {
      based_on_requirements: searchResults.slice(0, 5),
      auto_detected: detected,
      current_setup: {
        global: analysis.global.mcps,
        project: analysis.project.mcps
      },
      recommendations: analysis.recommendations
    };
  }

  getMCPInfo(mcpId) {
    const registryInfo = this.registry.get(mcpId);
    const availableInfo = this.availableMCPs?.[mcpId];

    return {
      id: mcpId,
      ...registryInfo,
      ...availableInfo,
      available: !!availableInfo,
      in_registry: !!registryInfo
    };
  }
}

// MCP Server Protocol Implementation
async function runMCPServer() {
  const server = new WTFMCPManagerServer();

  console.error('🎯 WTF-MCP-Manager Meta Server starting...');

  // Handle stdin for MCP protocol
  process.stdin.setEncoding('utf-8');

  let buffer = '';

  process.stdin.on('data', async (chunk) => {
    buffer += chunk;

    // Process complete lines
    let lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (line.trim()) {
        let request;
        try {
          request = JSON.parse(line);
        } catch (parseError) {
          console.log(JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: {
              code: -32700,
              message: "Parse error"
            }
          }));
          continue;
        }

        try {
          // Handle JSON-RPC 2.0 protocol
          if (request.method === 'initialize') {
            const initResponse = {
              jsonrpc: "2.0",
              id: request.id,
              result: {
                protocolVersion: "2024-11-05",
                capabilities: {
                  tools: {
                    listChanged: false
                  }
                },
                serverInfo: {
                  name: "wtf-mcp-manager",
                  version: "1.0.1"
                }
              }
            };
            console.log(JSON.stringify(initResponse));
          } else if (request.method === 'tools/list') {
            const toolsResponse = {
              jsonrpc: "2.0",
              id: request.id,
              result: {
                tools: [
                  {
                    name: "analyze_environment",
                    description: "Analyze global and project-level MCP configurations, detect conflicts and provide recommendations",
                    inputSchema: {
                      type: "object",
                      properties: {},
                      additionalProperties: false
                    }
                  },
                  {
                    name: "fetch_mcps",
                    description: "Fetch the latest available MCPs from the official registry. Takes 30 seconds on first run, then cached for 30 minutes.",
                    inputSchema: {
                      type: "object",
                      properties: {
                        force: {
                          type: "boolean",
                          description: "Force refresh even if cached data is available"
                        }
                      },
                      additionalProperties: false
                    }
                  },
                  {
                    name: "list_mcps",
                    description: "List all MCPs with their status (enabled/disabled)",
                    inputSchema: {
                      type: "object",
                      properties: {
                        enabled: {
                          type: "boolean",
                          description: "Show only enabled MCPs"
                        },
                        available: {
                          type: "boolean",
                          description: "Show only available (not enabled) MCPs"
                        }
                      },
                      additionalProperties: false
                    }
                  },
                  {
                    name: "enable_mcp",
                    description: "Enable an MCP for the current project",
                    inputSchema: {
                      type: "object",
                      properties: {
                        mcpId: {
                          type: "string",
                          description: "The ID of the MCP to enable (e.g., 'supabase', 'github')"
                        },
                        envVars: {
                          type: "object",
                          description: "Environment variables required by the MCP",
                          additionalProperties: {
                            type: "string"
                          }
                        }
                      },
                      required: ["mcpId"],
                      additionalProperties: false
                    }
                  },
                  {
                    name: "search_mcps",
                    description: "Search for MCPs based on keywords or requirements",
                    inputSchema: {
                      type: "object",
                      properties: {
                        query: {
                          type: "string",
                          description: "Search query (e.g., 'database', 'web scraping', 'github')"
                        }
                      },
                      required: ["query"],
                      additionalProperties: false
                    }
                  }
                ]
              }
            };
            console.log(JSON.stringify(toolsResponse));
          } else if (request.method === 'tools/call') {
            const toolName = request.params.name;
            const args = request.params.arguments || {};

            const response = await server.handleRequest(toolName, args);

            const toolResponse = {
              jsonrpc: "2.0",
              id: request.id,
              result: {
                content: [
                  {
                    type: "text",
                    text: typeof response === 'string' ? response : JSON.stringify(response, null, 2)
                  }
                ]
              }
            };
            console.log(JSON.stringify(toolResponse));
          } else {
            // Unknown method
            console.log(JSON.stringify({
              jsonrpc: "2.0",
              id: request.id,
              error: {
                code: -32601,
                message: "Method not found"
              }
            }));
          }
        } catch (error) {
          const errorResponse = {
            jsonrpc: "2.0",
            id: request?.id || null,
            error: {
              code: -32603,
              message: error.message
            }
          };

          console.log(JSON.stringify(errorResponse));
        }
      }
    }
  });

  process.stdin.on('end', () => {
    console.error('🎯 WTF-MCP-Manager Meta Server stopped');
    process.exit(0);
  });

  // Initial analysis
  try {
    const analysis = await server.analyzeMCPEnvironment();
    console.error(`📊 Environment Analysis: ${analysis.global.mcps.length} global, ${analysis.project.mcps.length} project MCPs`);

    if (analysis.conflicts.length > 0) {
      console.error(`⚠️  Found ${analysis.conflicts.length} potential conflicts`);
    }
  } catch (error) {
    console.error('Error during initial analysis:', error.message);
  }
}

// Export for programmatic use
export { WTFMCPManagerServer };

// Run as MCP server if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMCPServer().catch(console.error);
}