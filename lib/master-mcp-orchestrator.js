/**
 * Master MCP Orchestrator
 * The ultimate MCP that manages all tools for all agents transparently
 * "One MCP to rule them all"
 */

import { APIDiscoveryService } from './discovery/api-discovery.js';
import { APIEvaluator } from './discovery/api-evaluator.js';
import { MCPViabilityChecker } from './discovery/mcp-viability-checker.js';
import { DynamicMCPGenerator } from './dynamic/mcp-generator.js';
import { MetaAPIAggregator } from './discovery/meta-api-aggregator.js';

export class MasterMCPOrchestrator {
  constructor() {
    this.discoveryService = new APIDiscoveryService();
    this.evaluator = new APIEvaluator();
    this.viabilityChecker = new MCPViabilityChecker();
    this.generator = new DynamicMCPGenerator();
    this.metaAggregator = new MetaAPIAggregator();

    // Track active MCPs and their assignments
    this.activeMCPs = new Map();
    this.agentAllocations = new Map();
    this.projectConfigurations = new Map();
  }

  /**
   * Main entry point - called by project orchestrator
   * Understands needs in French and provisions everything automatically
   */
  async provisionToolsForProject(projectDescription) {
    console.log('🎯 Master MCP Orchestrator: Analyzing project needs...');

    const result = {
      project: projectDescription.name || 'unnamed',
      timestamp: new Date().toISOString(),
      needs: [],
      apis_found: [],
      mcps_generated: [],
      agent_configurations: [],
      status: 'initializing'
    };

    try {
      // 1. Analyze project needs (NLP-style understanding)
      const needs = this.analyzeProjectNeeds(projectDescription);
      result.needs = needs;
      console.log(`📝 Identified needs: ${needs.keywords.join(', ')}`);

      // 2. Discover relevant APIs for each need
      const apis = await this.discoverRelevantAPIs(needs);
      result.apis_found = apis.map(api => ({
        name: api.name,
        score: api.evaluation?.scores.total || 0,
        viable: api.viability?.canGenerate || false
      }));
      console.log(`🔍 Found ${apis.length} relevant APIs`);

      // 3. Generate MCPs for viable APIs
      const mcps = await this.generateMCPsForAPIs(apis);
      result.mcps_generated = mcps.map(mcp => ({
        id: mcp.id,
        api: mcp.apiName,
        tools: mcp.tools?.length || 0,
        status: mcp.status
      }));
      console.log(`🏗️ Generated ${mcps.length} MCPs`);

      // 4. Create agent configurations with appropriate tools
      const agentConfigs = this.createAgentConfigurations(
        projectDescription.agents || [],
        mcps,
        needs
      );
      result.agent_configurations = agentConfigs;
      console.log(`🤖 Configured ${agentConfigs.length} agents`);

      // 5. Store configuration for future reference
      this.projectConfigurations.set(result.project, result);

      result.status = 'ready';
      return result;

    } catch (error) {
      result.status = 'error';
      result.error = error.message;
      return result;
    }
  }

  /**
   * Analyze project needs from French description
   */
  analyzeProjectNeeds(description) {
    const text = typeof description === 'string'
      ? description
      : description.description || JSON.stringify(description);

    const textLower = text.toLowerCase();

    // Extract keywords and concepts (French + English)
    const needs = {
      keywords: [],
      domains: [],
      tools_needed: [],
      apis_hints: []
    };

    // Maritime/Vessel tracking
    if (textLower.match(/bateau|navire|vessel|ship|maritime|marin|tracking|position|ais/)) {
      needs.keywords.push('vessel', 'tracking', 'maritime', 'AIS');
      needs.domains.push('maritime');
      needs.tools_needed.push('vessel_position', 'vessel_tracking', 'port_data');
      needs.apis_hints.push('MarineTraffic', 'VesselFinder', 'FleetMon');
    }

    // Weather
    if (textLower.match(/météo|weather|climat|temperature|vent|wind|vague|wave/)) {
      needs.keywords.push('weather', 'forecast', 'marine');
      needs.domains.push('weather');
      needs.tools_needed.push('weather_forecast', 'marine_weather', 'wind_speed');
      needs.apis_hints.push('OpenWeather', 'StormGlass', 'NOAA');
    }

    // Payment/Finance
    if (textLower.match(/paiement|payment|stripe|paypal|transaction|argent|money/)) {
      needs.keywords.push('payment', 'transaction', 'billing');
      needs.domains.push('finance');
      needs.tools_needed.push('process_payment', 'create_invoice', 'refund');
      needs.apis_hints.push('Stripe', 'PayPal', 'Square');
    }

    // Maps/Geography
    if (textLower.match(/carte|map|géo|location|position|distance|route/)) {
      needs.keywords.push('maps', 'geocoding', 'routing');
      needs.domains.push('geography');
      needs.tools_needed.push('geocode', 'calculate_route', 'show_map');
      needs.apis_hints.push('Google Maps', 'Mapbox', 'OpenStreetMap');
    }

    // Translation/Language
    if (textLower.match(/traduction|translate|langue|language|traduire/)) {
      needs.keywords.push('translation', 'language', 'text');
      needs.domains.push('language');
      needs.tools_needed.push('translate_text', 'detect_language');
      needs.apis_hints.push('Google Translate', 'DeepL', 'Microsoft Translator');
    }

    // Database/Storage
    if (textLower.match(/database|base de données|storage|stockage|données|data/)) {
      needs.keywords.push('database', 'storage', 'data');
      needs.domains.push('storage');
      needs.tools_needed.push('store_data', 'query_data', 'backup');
      needs.apis_hints.push('Supabase', 'Firebase', 'MongoDB');
    }

    // If no specific needs detected, extract generic keywords
    if (needs.keywords.length === 0) {
      // Extract nouns and important words
      const words = text.split(/\s+/)
        .filter(w => w.length > 4)
        .filter(w => !['pour', 'avec', 'dans', 'faire'].includes(w));
      needs.keywords = words.slice(0, 5);
    }

    return needs;
  }

  /**
   * Discover APIs based on analyzed needs
   */
  async discoverRelevantAPIs(needs) {
    const allAPIs = [];
    const searchQueries = new Set();

    // Create search queries from needs
    needs.keywords.forEach(keyword => searchQueries.add(keyword));
    needs.domains.forEach(domain => searchQueries.add(domain));
    needs.apis_hints.forEach(hint => searchQueries.add(hint));

    // Search for each unique query
    for (const query of searchQueries) {
      try {
        const results = await this.discoveryService.discoverAllAPIs(query);
        if (results.apis) {
          allAPIs.push(...results.apis.slice(0, 3)); // Top 3 per query
        }
      } catch (error) {
        console.error(`Search failed for ${query}:`, error.message);
      }
    }

    // De-duplicate and evaluate APIs
    const uniqueAPIs = new Map();
    allAPIs.forEach(api => {
      const key = api.name + (api.provider || '');
      if (!uniqueAPIs.has(key)) {
        // Add evaluation and viability check
        api.evaluation = this.evaluator.evaluateAPI(api);
        api.viability = this.viabilityChecker.checkViability(api);
        uniqueAPIs.set(key, api);
      }
    });

    // Sort by total score and filter viable ones
    const viableAPIs = Array.from(uniqueAPIs.values())
      .filter(api => api.viability.canGenerate)
      .sort((a, b) => b.evaluation.scores.total - a.evaluation.scores.total);

    return viableAPIs.slice(0, 10); // Return top 10 viable APIs
  }

  /**
   * Generate MCPs for discovered APIs
   */
  async generateMCPsForAPIs(apis) {
    const mcps = [];

    for (const api of apis) {
      try {
        // Skip if not viable
        if (!api.viability || !api.viability.canGenerate) {
          continue;
        }

        // Check if MCP already exists
        const mcpId = this.generateMCPId(api.name);
        if (this.activeMCPs.has(mcpId)) {
          mcps.push(this.activeMCPs.get(mcpId));
          continue;
        }

        // Generate new MCP
        console.log(`🔨 Generating MCP for ${api.name}...`);
        const result = await this.generator.generateFromAPI(api, {
          id: mcpId,
          allowManual: true,
          dryRun: false // Actually generate in production
        });

        if (result.success) {
          const mcpInfo = {
            id: mcpId,
            apiName: api.name,
            apiProvider: api.provider,
            tools: this.extractTools(api),
            status: 'active',
            created: new Date().toISOString(),
            evaluation: api.evaluation,
            path: result.path
          };

          this.activeMCPs.set(mcpId, mcpInfo);
          mcps.push(mcpInfo);
        }
      } catch (error) {
        console.error(`Failed to generate MCP for ${api.name}:`, error.message);
      }
    }

    return mcps;
  }

  /**
   * Extract available tools from API specification
   */
  extractTools(api) {
    const tools = [];

    if (api.endpoints && Array.isArray(api.endpoints)) {
      api.endpoints.forEach(endpoint => {
        const toolName = this.createToolName(endpoint);
        tools.push({
          name: toolName,
          description: endpoint.description || `${endpoint.method} ${endpoint.path}`,
          method: endpoint.method,
          path: endpoint.path
        });
      });
    }

    return tools;
  }

  /**
   * Create tool name from endpoint
   */
  createToolName(endpoint) {
    // Convert endpoint path to tool name
    // /users/{id} -> get_user_by_id
    // /weather/current -> get_weather_current

    const method = (endpoint.method || 'GET').toLowerCase();
    const path = endpoint.path || '';

    const pathParts = path
      .split('/')
      .filter(p => p && !p.startsWith('{'))
      .map(p => p.replace(/[^a-z0-9]/gi, '_'));

    return `${method}_${pathParts.join('_')}`.toLowerCase();
  }

  /**
   * Create agent configurations with appropriate MCPs
   */
  createAgentConfigurations(agentDescriptions, mcps, needs) {
    const configurations = [];

    // If no agents specified, create based on needs
    if (!agentDescriptions || agentDescriptions.length === 0) {
      agentDescriptions = this.generateDefaultAgents(needs);
    }

    agentDescriptions.forEach((agent, index) => {
      const config = {
        id: agent.id || `agent_${index + 1}`,
        role: agent.role || 'general',
        description: agent.description || '',
        mcps: [],
        tools: []
      };

      // Match MCPs to agent role/needs
      const agentNeeds = agent.needs || agent.role || '';
      const agentNeedsLower = agentNeeds.toLowerCase();

      mcps.forEach(mcp => {
        // Check if MCP matches agent needs
        const mcpNameLower = mcp.apiName.toLowerCase();
        let shouldAssign = false;

        // Check various matching criteria
        if (agentNeedsLower.includes('vessel') && mcpNameLower.includes('marine')) {
          shouldAssign = true;
        } else if (agentNeedsLower.includes('weather') && mcpNameLower.includes('weather')) {
          shouldAssign = true;
        } else if (agentNeedsLower.includes('payment') && mcpNameLower.includes('stripe')) {
          shouldAssign = true;
        } else if (agent.role === 'coordinator' || agent.role === 'general') {
          // Coordinator gets access to all MCPs
          shouldAssign = true;
        }

        if (shouldAssign) {
          config.mcps.push(mcp.id);
          config.tools.push(...mcp.tools.map(t => t.name));
        }
      });

      // Store allocation
      this.agentAllocations.set(config.id, config);
      configurations.push(config);
    });

    return configurations;
  }

  /**
   * Generate default agents based on project needs
   */
  generateDefaultAgents(needs) {
    const agents = [];

    // Create specialized agents for each domain
    needs.domains.forEach((domain, index) => {
      agents.push({
        id: `${domain}_agent`,
        role: domain,
        description: `Specialized agent for ${domain} operations`,
        needs: domain
      });
    });

    // Always add a coordinator
    agents.push({
      id: 'coordinator',
      role: 'coordinator',
      description: 'Main coordinator with access to all tools',
      needs: 'all'
    });

    return agents;
  }

  /**
   * Allocate MCP to a specific agent (called by agents directly)
   */
  async allocateMCPToAgent(agentId, needs) {
    console.log(`🤖 Agent ${agentId} requesting tools for: ${needs}`);

    // Find or create appropriate MCP
    const mcp = await this.findOrCreateMCPForNeeds(needs);

    if (mcp) {
      // Update agent allocation
      const allocation = this.agentAllocations.get(agentId) || {
        id: agentId,
        mcps: [],
        tools: []
      };

      if (!allocation.mcps.includes(mcp.id)) {
        allocation.mcps.push(mcp.id);
        allocation.tools.push(...mcp.tools.map(t => t.name));
        this.agentAllocations.set(agentId, allocation);
      }

      return {
        success: true,
        mcp_id: mcp.id,
        tools: mcp.tools,
        message: `Allocated ${mcp.tools.length} tools from ${mcp.apiName}`
      };
    }

    return {
      success: false,
      message: 'No suitable MCP found for requested needs'
    };
  }

  /**
   * Find or create MCP based on needs description
   */
  async findOrCreateMCPForNeeds(needs) {
    // First check if we have an existing MCP that matches
    for (const [id, mcp] of this.activeMCPs) {
      const mcpName = mcp.apiName.toLowerCase();
      const needsLower = needs.toLowerCase();

      if (needsLower.includes(mcpName) || mcpName.includes(needsLower)) {
        return mcp;
      }
    }

    // If not, discover and create new MCP
    const searchResults = await this.discoveryService.discoverAllAPIs(needs);

    if (searchResults.apis && searchResults.apis.length > 0) {
      const bestAPI = searchResults.apis[0];
      const mcps = await this.generateMCPsForAPIs([bestAPI]);

      if (mcps.length > 0) {
        return mcps[0];
      }
    }

    return null;
  }

  /**
   * Generate MCP ID from API name
   */
  generateMCPId(apiName) {
    return `mcp_${apiName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
  }

  /**
   * Get status of all active MCPs and allocations
   */
  getStatus() {
    return {
      active_mcps: this.activeMCPs.size,
      allocated_agents: this.agentAllocations.size,
      projects: this.projectConfigurations.size,
      mcps: Array.from(this.activeMCPs.values()).map(mcp => ({
        id: mcp.id,
        api: mcp.apiName,
        tools: mcp.tools.length,
        status: mcp.status
      })),
      agents: Array.from(this.agentAllocations.values()).map(agent => ({
        id: agent.id,
        role: agent.role,
        mcps: agent.mcps.length,
        tools: agent.tools.length
      }))
    };
  }

  /**
   * Clean up inactive MCPs
   */
  cleanup() {
    // Remove MCPs not allocated to any agent
    for (const [mcpId, mcp] of this.activeMCPs) {
      let isAllocated = false;

      for (const [agentId, allocation] of this.agentAllocations) {
        if (allocation.mcps.includes(mcpId)) {
          isAllocated = true;
          break;
        }
      }

      if (!isAllocated) {
        console.log(`🧹 Cleaning up unused MCP: ${mcpId}`);
        this.activeMCPs.delete(mcpId);
      }
    }
  }
}

export default MasterMCPOrchestrator;