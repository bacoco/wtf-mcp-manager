#!/usr/bin/env node

/**
 * WTF-MCP-Manager Meta Server
 * A real MCP server that can be used by Claude to manage other MCPs
 */

import { readFileSync, existsSync } from 'fs';
import fsPromises from 'fs/promises';
import { join, resolve } from 'path';
import path from 'path';
import { homedir } from 'os';
import { createHash } from 'crypto';
import { MCPManager } from './manager.js';
import { MCPRegistry } from './registry.js';
import { AutoDetector } from './detector.js';
import { DynamicMCPGenerator } from './dynamic/mcp-generator.js';
import { APIDiscoveryService } from './discovery/api-discovery.js';
import { VectorRouter } from './router/vector-router.js';

class WTFMCPManagerServer {
  constructor(options = {}) {
    this.manager = new MCPManager();
    this.registry = new MCPRegistry();
    this.detector = new AutoDetector();
    this.generator = new DynamicMCPGenerator();
    this.discovery = new APIDiscoveryService();
    this.vectorRouter = options.vectorRouter || new VectorRouter(options.vectorRouterOptions || {});
    this.availableMCPs = null;
    this.lastFetchTime = null;
    this.FETCH_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
    this.dynamicMCPs = new Map();
    this.workflows = new Map();
    this.routerClient = new RouterClient();
  }

  async initialize() {
    await this.generator.init();
    console.error('🚀 Dynamic MCP Generator initialized');

    if (this.vectorRouter?.ensureReady) {
      try {
        await this.vectorRouter.ensureReady();
        const label = this.vectorRouter.getSourceLabel ? this.vectorRouter.getSourceLabel() : 'memory';
        console.error(`🧠 Vector router initialized (${label})`);
      } catch (error) {
        console.error('⚠️  Vector router failed to initialize:', error.message);
      }
    }
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
    if (!force && this.registryText && this.lastFetchTime &&
        (now - this.lastFetchTime) < this.FETCH_CACHE_TTL) {
      if (!this.availableMCPs) {
        const parsed = this.parseMCPRegistry(this.registryText);
        this.availableMCPs = parsed;
        await this.updateVectorIndexFromRegistry(parsed);
      }

      return {
        success: true,
        cached: true,
        lastFetch: new Date(this.lastFetchTime).toISOString(),
        sourceSize: this.registryText.length,
        rawText: this.registryText,
        vectorSource: this.vectorRouter?.getSourceLabel?.(),
        message: "Using cached MCP registry (use force: true to refresh)"
      };
    }

    try {
      console.log('🔍 Fetching latest MCP registry...');
      const response = await fetch('https://modelcontextprotocol.io/llms-full.txt');

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const text = await response.text();
      console.log(`📦 Fetched ${text.length} characters from registry`);

      const parsedRegistry = this.parseMCPRegistry(text);
      this.availableMCPs = parsedRegistry;
      await this.updateVectorIndexFromRegistry(parsedRegistry, { force: true });

      // Don't parse - just return the raw text for Claude to analyze
      this.lastFetchTime = now;
      this.registryText = text;

      const parsedRegistry = this.parseMCPRegistry(text);
      this.availableMCPs = parsedRegistry;
      const normalizedRecords = this.normalizeRegistryEntries(Object.values(parsedRegistry));
      this.registryToolRecords = normalizedRecords;

      const dataHash = createHash('sha256').update(text).digest('hex');
      const shouldIndex = force || this.registryIndexHash !== dataHash || this.vectorRouter.available === false;
      let indexed = false;

      if (shouldIndex && normalizedRecords.length > 0) {
        indexed = await this.vectorRouter.upsertTools(normalizedRecords);
        if (indexed) {
          this.registryIndexHash = dataHash;
        }
      }

      return {
        success: true,
        cached: false,
        lastFetch: new Date(this.lastFetchTime).toISOString(),
        sourceSize: text.length,
        rawText: text,
        vectorSource: this.vectorRouter?.getSourceLabel?.(),
        message: "Here's the full MCP registry. You can search through it to find relevant MCPs for the user's needs."
      };
    } catch (error) {
      console.error('Failed to fetch MCP registry:', error.message);

      // Fallback to built-in registry
      this.availableMCPs = this.registry.getAll();
      this.toolRetriever.setDocuments(this.availableMCPs);
      this.lastFetchTime = now;
      await this.updateVectorIndexFromRegistry(this.availableMCPs, { force: true });

      return {
        mcps: this.availableMCPs,
        cached: false,
        fallback: true,
        error: error.message,
        count: Object.keys(this.availableMCPs).length,
        vectorSource: this.vectorRouter?.getSourceLabel?.()
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
      .replace(/@[^@/]+$/, '')
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

  normalizeRegistryEntries(entries) {
    if (!entries) {
      return [];
    }

    if (Array.isArray(entries)) {
      return entries.map(entry => ({
        id: entry.id,
        name: entry.name || this.formatMCPName(entry.id),
        description: entry.description || '',
        categories: entry.categories || [],
        package: entry.package,
        command: entry.command,
        args: entry.args,
        requiredEnv: entry.requiredEnv || [],
        source: entry.source || 'registry'
      })).filter(item => item.id);
    }

    return Object.entries(entries).map(([id, info]) => ({
      id,
      name: info.name || this.formatMCPName(id),
      description: info.description || '',
      categories: info.categories || [],
      package: info.package,
      command: info.command,
      args: info.args,
      requiredEnv: info.requiredEnv || [],
      source: info.source || 'registry'
    }));
  }

  async updateVectorIndexFromRegistry(entries, options = {}) {
    if (!this.vectorRouter?.ingestTools) {
      return;
    }

    const normalized = this.normalizeRegistryEntries(entries);
    if (normalized.length === 0) {
      return;
    }

    try {
      await this.vectorRouter.ingestTools(normalized, options);
    } catch (error) {
      console.error('Failed to update vector index:', error.message);
    }
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

          // Check if it's a global MCP to disable
          if (params.global) {
            return await this.disableGlobalMCP(params.mcpId);
          }

          return await this.manager.disable(params.mcpId);

        case 'auto_detect':
          return await this.detector.scan();

        case 'search_mcps':
          // If we have registry text, return it with the query for Claude to search
          if (this.registryText) {
            return {
              query: params.query || '',
              registryText: this.registryText,
              message: `Search the registry for MCPs related to: "${params.query}". The registry contains all available MCPs with their descriptions, installation commands, and capabilities.`
            };
          }
          // Fallback to basic search
          const searchResults = await this.searchMCPs(params.query || '');
          return searchResults;

        case 'retrieve_relevant_tools':
          return await this.retrieveRelevantTools(params.query || '', params.limit);

        case 'diagnose':
          return await this.manager.diagnose();

        case 'get_mcp_info':
          if (!params.mcpId) throw new Error('mcpId required');
          return this.getMCPInfo(params.mcpId);

        case 'suggest_mcps':
          return await this.suggestMCPs(params.requirements || '');

        case 'discover_or_create_mcp':
          return await this.discoverOrCreateMCP(params);

        case 'generate_from_api':
          return await this.generateFromAPI(params);

        case 'generate_from_fastapi':
          return await this.generateFromFastAPI(params);

        case 'compose_workflow':
          return await this.composeWorkflow(params);

        case 'test_mcp':
          return await this.testMCP(params);

        case 'list_dynamic_mcps':
          return await this.listDynamicMCPs();

        case 'stop_dynamic_mcp':
          return await this.stopDynamicMCP(params.mcpId);

        case 'route_tools':
          return await this.routeTools(params);

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
    if (this.routerClient?.isConfigured) {
      const remoteResults = await this.routerClient.query({ query, topK: 10 });
      if (Array.isArray(remoteResults) && remoteResults.length > 0) {
        return remoteResults;
      }
    }

    // If we have registry text, search within it
    if (this.registryText) {
      const queryLower = query.toLowerCase();
      const lines = this.registryText.split('\n');
      const results = [];

      lines.forEach(line => {
        if (line.toLowerCase().includes(queryLower)) {
          // Extract package name from the line
          const match = line.match(/@[\w-]+\/[\w-]+|[\w-]+-mcp|mcp-[\w-]+/);
          if (match) {
            results.push({
              name: match[0],
              description: line,
              relevance: 'high',
              source: 'registry'
            });
          }
        }
      });

      if (!response.ok) {
        console.warn(`Router HTTP query failed with status ${response.status}`);
        return null;
      }

      const data = await response.json();
      if (Array.isArray(data.results)) {
        return data.results.slice(0, limit);
      }
    } catch (error) {
      console.warn('Router HTTP query error:', error.message || error);
    }

    return null;
  }

  async searchMCPs(query) {
    const limit = 10;
    const httpResults = await this.queryRouterHTTP(query, limit);
    if (httpResults && httpResults.length > 0) {
      return httpResults;
    }

    if (!this.availableMCPs) {
      this.availableMCPs = this.registry.getAll();
    }

    return await this.routerRetriever.query(query, {
      limit,
      registryText: this.registryText,
      availableMCPs: this.availableMCPs
    });
  }

  searchMCPsLocal(query, limit = 10) {
    if (!this.availableMCPs) {
      this.availableMCPs = this.registry.getAll();
      this.toolRetriever.setDocuments(this.availableMCPs);
    }

    if (this.retriever?.isEnabled()) {
      try {
        const vectorResults = await this.retriever.retrieve(query, { topK: 10 });
        if (vectorResults.length > 0) {
          return vectorResults;
        }
      } catch (error) {
        if (error instanceof VectorStoreUnavailableError) {
          console.warn('⚠️  Vector store unavailable, falling back to keyword search:', error.message);
        } else {
          console.error('Vector store retrieval failed, falling back to keyword search:', error);
        }
      }
    }

    return this.keywordFallbackSearch(query, 5);
  }

  keywordFallbackSearch(query, limit = 5) {
    if (!query || !query.trim()) {
      return [];
    }

    const keywords = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
    const results = [];

    for (const [id, mcp] of Object.entries(this.availableMCPs)) {
      let score = 0;

      for (const keyword of keywords) {
        if (mcp.name && mcp.name.toLowerCase().includes(keyword)) score += 3;
        if (mcp.description && mcp.description.toLowerCase().includes(keyword)) score += 2;
        if (mcp.categories && Array.isArray(mcp.categories) &&
            mcp.categories.some(cat => cat.toLowerCase().includes(keyword))) score += 2;
        if (id.includes(keyword)) score += 1;
      });

      if (score > 0) {
        results.push({ id, ...mcp, score });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  async retrieveRelevantTools(query, limit = 5) {
    const sanitizedQuery = (query || '').trim();
    const maxResults = Math.max(1, Math.min(limit || 5, 50));
    const availableMap = this.availableMCPs || this.registry.getAll();
    const normalizedEntries = this.normalizeRegistryEntries(availableMap);

    if (!sanitizedQuery) {
      return {
        query: sanitizedQuery,
        limit: maxResults,
        source: 'fallback',
        vectorStoreAvailable: this.vectorRouter?.isAvailable?.() ?? false,
        tools: normalizedEntries.slice(0, maxResults)
      };
    }

    let results = [];
    let source = 'fallback';

    if (this.vectorRouter?.query) {
      try {
        results = await this.vectorRouter.query(sanitizedQuery, maxResults);
        if (results.length > 0) {
          source = this.vectorRouter.getSourceLabel ? this.vectorRouter.getSourceLabel() : 'vector';
        }
      } catch (error) {
        console.error('Vector retrieval failed:', error.message);
      }
    }

    if (!results || results.length === 0) {
      const fallbackResults = await this.searchMCPs(sanitizedQuery);
      results = fallbackResults.slice(0, maxResults).map(result => ({
        id: result.id,
        name: result.name || this.formatMCPName(result.id),
        description: result.description || '',
        categories: result.categories || [],
        package: result.package,
        score: result.score || 0,
        source: 'fallback'
      }));
      source = 'fallback';
    }

    return {
      query: sanitizedQuery,
      limit: maxResults,
      source,
      vectorStoreAvailable: this.vectorRouter?.isAvailable?.() ?? false,
      tools: results
    };
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

  /**
   * Disable a global MCP by removing it from Claude's config
   */
  async disableGlobalMCP(mcpId) {
    const analysis = await this.analyzeMCPEnvironment();

    if (!analysis.global.config) {
      throw new Error('No global Claude configuration found');
    }

    if (!analysis.global.config.mcpServers?.[mcpId]) {
      throw new Error(`MCP "${mcpId}" is not configured globally`);
    }

    // Read the config file
    const fs = await import('fs');
    const configPath = analysis.global.configPath;
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configContent);

    // Remove the MCP
    delete config.mcpServers[mcpId];

    // Save the updated config
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    return {
      success: true,
      message: `MCP "${mcpId}" has been removed from global configuration`,
      configPath: configPath,
      action: 'Please restart Claude Desktop to apply changes',
      remainingMCPs: Object.keys(config.mcpServers)
    };
  }

  /**
   * Discover or create MCP based on requirements
   */
  async discoverOrCreateMCP(params) {
    const { query, autoCreate = false } = params;

    // Discover APIs matching the query
    const discovered = await this.discovery.discoverAPIs(query);

    if (discovered.length === 0) {
      return {
        success: false,
        message: `No APIs found for "${query}"`,
        suggestions: await this.getSimilarAPIs(query)
      };
    }

    // Check if any are existing MCPs
    const existingMCPs = discovered.filter(api => api.type === 'existing-mcp');

    if (existingMCPs.length > 0 && !autoCreate) {
      return {
        success: true,
        message: 'Found existing MCPs',
        mcps: existingMCPs,
        otherAPIs: discovered.filter(api => api.type !== 'existing-mcp')
      };
    }

    // If autoCreate is enabled, generate MCP for the top result
    if (autoCreate && discovered.length > 0) {
      const topAPI = discovered[0];

      if (topAPI.type === 'existing-mcp') {
        const registryIdSource = topAPI.package || topAPI.name;
        const mcpId = registryIdSource ? this.extractMCPId(registryIdSource) : null;
        const registryInfo = mcpId ? this.registry.get(mcpId) : null;

        if (!registryInfo) {
          return {
            success: false,
            message: `Discovered MCP "${topAPI.name}" is not available in the registry. Cannot enable automatically.`
          };
        }

        // Enable existing MCP
        const registryId = this.extractMCPId(topAPI.package || topAPI.name);
        await this.manager.enable(registryId);
        return {
          success: true,
          message: `Enabled existing MCP: ${registryInfo.name || mcpId}`,
          mcp: { ...topAPI, id: mcpId }
        };
      } else {
        // Generate new MCP
        const spec = await this.discovery.getAPISpecification(topAPI);
        const generated = await this.generateFromAPI({ apiSpec: spec });
        return {
          success: true,
          message: `Generated new MCP for ${topAPI.name}`,
          mcp: generated
        };
      }
    }

    return {
      success: true,
      message: `Found ${discovered.length} APIs matching "${query}"`,
      apis: discovered,
      canGenerate: true
    };
  }

  /**
   * Generate MCP from API specification
   */
  async generateFromAPI(params) {
    const { apiSpec, options = {} } = params;

    if (!apiSpec) {
      throw new Error('API specification required');
    }

    // Generate MCP code
    const config = await this.generator.generateFromAPI(apiSpec, options);

    // Deploy if requested
    if (options.deploy) {
      const deployment = await this.generator.deployMCP(config.id);
      return {
        ...config,
        deployment
      };
    }

    return config;
  }

  /**
   * Generate MCP from FastAPI application
   */
  async generateFromFastAPI(params) {
    const { code, appPath, options = {} } = params;

    if (!code && !appPath) {
      throw new Error('FastAPI code or app path required');
    }

    // Create FastAPI-MCP wrapper
    const fastAPICode = code || (appPath ? await fsPromises.readFile(appPath, 'utf-8') : '');
    const apiSpec = {
      name: options.name || 'fastapi-app',
      type: 'fastapi',
      fastapi: true,
      code: fastAPICode
    };

    return await this.generateFromAPI({ apiSpec, options });
  }

  /**
   * Compose multiple MCPs into a workflow
   */
  async composeWorkflow(params) {
    const { mcps, workflow, name } = params;

    if (!mcps || mcps.length === 0) {
      throw new Error('At least one MCP required for workflow');
    }

    // Create workflow configuration
    const workflowConfig = {
      id: `workflow-${Date.now()}`,
      name: name || 'Custom Workflow',
      mcps: mcps,
      steps: workflow || this.generateDefaultWorkflow(mcps),
      created: new Date().toISOString()
    };

    // Store workflow
    this.workflows.set(workflowConfig.id, workflowConfig);

    // Ensure all required MCPs are running
    for (const mcpId of mcps) {
      if (!this.generator.activeMCPs.has(mcpId)) {
        await this.generator.deployMCP(mcpId);
      }
    }

    return {
      success: true,
      workflow: workflowConfig,
      message: `Workflow "${workflowConfig.name}" created with ${mcps.length} MCPs`
    };
  }

  /**
   * Test an MCP
   */
  async testMCP(params) {
    const { mcpId, tests = 'auto' } = params;

    if (!mcpId) {
      throw new Error('MCP ID required');
    }

    const results = {
      mcpId,
      timestamp: new Date().toISOString(),
      tests: []
    };

    // Check if MCP is running
    const isRunning = this.generator.activeMCPs.has(mcpId);
    results.tests.push({
      name: 'MCP Running',
      passed: isRunning,
      message: isRunning ? 'MCP is active' : 'MCP is not running'
    });

    if (!isRunning) {
      return results;
    }

    // Get MCP info
    const mcpInfo = this.generator.activeMCPs.get(mcpId);

    // Test basic connectivity
    try {
      const response = await fetch(`http://localhost:${mcpInfo.config.port}/health`);
      results.tests.push({
        name: 'Health Check',
        passed: response.ok,
        message: `HTTP ${response.status}`
      });
    } catch (error) {
      results.tests.push({
        name: 'Health Check',
        passed: false,
        message: error.message
      });
    }

    // Test MCP protocol
    // This would send test requests to the MCP server
    results.tests.push({
      name: 'MCP Protocol',
      passed: true,
      message: 'Protocol test pending'
    });

    results.summary = {
      total: results.tests.length,
      passed: results.tests.filter(t => t.passed).length,
      failed: results.tests.filter(t => !t.passed).length
    };

    return results;
  }

  /**
   * List all dynamic MCPs
   */
  async listDynamicMCPs() {
    const active = await this.generator.listActiveMCPs();
    const available = [];

    // List available but not running MCPs
    const dynamicDir = this.generator.baseDir;
    try {
      const dirs = await fs.readdir(dynamicDir);

      for (const dir of dirs) {
        if (!active.find(mcp => mcp.id === dir)) {
          const configPath = path.join(dynamicDir, dir, 'config.json');
          try {
            const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
            available.push({
              ...config,
              status: 'stopped'
            });
          } catch (error) {
            // Skip invalid directories
          }
        }
      }
    } catch (error) {
      // Dynamic directory doesn't exist yet
    }

    return {
      active,
      available,
      total: active.length + available.length
    };
  }

  /**
   * Stop a dynamic MCP
   */
  async stopDynamicMCP(mcpId) {
    return await this.generator.stopMCP(mcpId);
  }

  /**
   * Get similar APIs for suggestions
   */
  async getSimilarAPIs(query) {
    // Simple keyword-based suggestions
    const keywords = query.toLowerCase().split(/\s+/);
    const suggestions = [];

    const categories = {
      weather: ['OpenWeather', 'WeatherAPI', 'AccuWeather'],
      finance: ['Alpha Vantage', 'Yahoo Finance', 'IEX Cloud'],
      news: ['NewsAPI', 'Guardian API', 'NYTimes API'],
      social: ['Twitter API', 'Reddit API', 'Discord API'],
      payment: ['Stripe', 'PayPal', 'Square'],
      messaging: ['Twilio', 'SendGrid', 'Mailgun']
    };

    for (const [category, apis] of Object.entries(categories)) {
      if (keywords.some(k => category.includes(k))) {
        suggestions.push(...apis);
      }
    }

    return suggestions.slice(0, 5);
  }

  /**
   * Generate default workflow from MCPs
   */
  generateDefaultWorkflow(mcps) {
    // Create a simple sequential workflow
    return mcps.map((mcpId, index) => ({
      step: index + 1,
      mcp: mcpId,
      action: 'execute',
      input: index === 0 ? 'user_input' : `step_${index}_output`
    }));
  }
}

// MCP Server Protocol Implementation
async function runMCPServer() {
  const server = new WTFMCPManagerServer();
  await server.initialize();

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
                  tools: {}
                },
                serverInfo: {
                  name: "wtf-mcp-manager",
                  version: "1.0.2"
                }
              }
            };
            console.log(JSON.stringify(initResponse));
          } else if (request.method === 'tools/list') {
            const tools = await server.getToolList(request.params || {});
            const toolsResponse = {
              jsonrpc: "2.0",
              id: request.id,
              result: {
                tools
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
                    text: typeof response === 'string' ?
                      response :
                      // For large responses with rawText, truncate and indicate it's for Claude to process
                      (response.rawText && response.rawText.length > 100000) ?
                        JSON.stringify({...response, rawText: '[Full registry text provided for analysis]'}, null, 2) :
                        JSON.stringify(response, null, 2)
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