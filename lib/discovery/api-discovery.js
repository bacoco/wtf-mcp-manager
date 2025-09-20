/**
 * API Discovery Service
 * Discovers APIs using Gorilla API, web scraping, and registry search
 */

import fetch from 'node-fetch';
import { searchAPIs, getAPI, API_DATABASE } from './api-database.js';
import { WebSearchService } from './web-search.js';
import { MetaAPIAggregator } from './meta-api-aggregator.js';

export class APIDiscoveryService {
  constructor() {
    this.gorillaEndpoint = 'https://gorilla.berkeley.edu/api/v1';
    this.registries = [
      'https://api.publicapis.org/entries',
      'https://api.apis.guru/v2/list.json'
    ];
    this.cache = new Map();
    this.cacheTTL = 30 * 60 * 1000; // 30 minutes
    this.webSearch = new WebSearchService();
    this.metaAggregator = new MetaAPIAggregator();
  }

  /**
   * Discover ALL APIs from all sources
   */
  async discoverAllAPIs(query, options = {}) {
    // Use the meta-aggregator for comprehensive search
    const metaResults = await this.metaAggregator.searchAllSources(query);
    return metaResults;
  }

  /**
   * Discover APIs based on natural language query
   */
  async discoverAPIs(query, options = {}) {
    const cacheKey = `discover:${query}`;
    const cached = this.getFromCache(cacheKey);

    if (cached && !options.force) {
      return cached;
    }

    const results = await Promise.allSettled([
      this.searchLocalDatabase(query),
      this.searchRegistries(query),
      this.searchExistingMCPs(query),
      this.searchGitHub(query),
      this.searchWebAPIs(query)
    ]);

    // Combine and rank results
    const apis = this.combineResults(results, query);
    const ranked = this.rankAPIs(apis, query);

    this.setCache(cacheKey, ranked);
    return ranked;
  }

  /**
   * Search in our comprehensive API database
   */
  async searchLocalDatabase(query) {
    // Search in our local API database
    const results = searchAPIs(query);

    return results.map(api => ({
      ...api,
      source: 'database',
      canGenerateMCP: true
    }));
  }

  /**
   * Search public API registries with better matching
   */
  async searchRegistries(query) {
    const apis = [];

    // Try to search the APIs.guru registry
    try {
      const response = await fetch('https://api.apis.guru/v2/list.json');

      if (response.ok) {
        const data = await response.json();
        const queryWords = query.toLowerCase().split(/\s+/);

        for (const [key, api] of Object.entries(data)) {
          const info = api.preferred ? data[key].versions[api.preferred].info : null;
          if (!info) continue;

          let score = 0;
          const searchText = `${key} ${info.title} ${info.description}`.toLowerCase();

          // Check each word in the query
          queryWords.forEach(word => {
            if (searchText.includes(word)) score++;
          });

          // Special keywords for maritime/shipping
          const maritimeKeywords = ['vessel', 'ship', 'marine', 'maritime', 'ais', 'port', 'tracking'];
          if (maritimeKeywords.some(k => queryWords.includes(k))) {
            if (searchText.includes('vessel') || searchText.includes('ship') ||
                searchText.includes('marine') || searchText.includes('tracking')) {
              score += 3;
            }
          }

          if (score > 0) {
            const swaggerUrl = data[key].versions[api.preferred].swaggerUrl;
            apis.push({
              name: info.title,
              description: info.description || '',
              swaggerUrl: swaggerUrl,
              baseUrl: info.servers?.[0]?.url || swaggerUrl,
              version: info.version,
              provider: key,
              score: score,
              source: 'apis.guru',
              hasOpenAPI: true
            });
          }
        }

        // Sort by relevance score
        apis.sort((a, b) => b.score - a.score);
        return apis.slice(0, 10); // Return top 10
      }
    } catch (error) {
      console.error('APIs.guru search error:', error.message);
    }

    return apis;
  }

  /**
   * Search for APIs using web search service
   */
  async searchWebAPIs(query) {
    try {
      return await this.webSearch.searchAPIs(query);
    } catch (error) {
      console.error('Web API search failed:', error);
      return [];
    }
  }

  /**
   * Search GitHub for API-related repositories
   */
  async searchGitHub(query) {
    try {
      // Search GitHub for API repositories
      const response = await fetch(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(query + ' API')}&per_page=5`,
        {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'wtf-mcp-manager'
          }
        }
      );

      if (response.ok) {
        const data = await response.json();

        return data.items?.map(repo => ({
          name: repo.name,
          description: repo.description || 'GitHub repository',
          baseUrl: repo.html_url,
          stars: repo.stargazers_count,
          source: 'github',
          type: 'repository'
        })) || [];
      }
    } catch (error) {
      // GitHub search failed, continue silently
    }
    return [];
  }

  /**
   * Search existing MCP packages
   */
  async searchExistingMCPs(query) {
    const mcps = [];

    // Search npm for MCP packages
    try {
      const response = await fetch(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query + ' mcp')}&size=10`);

      if (response.ok) {
        const data = await response.json();

        if (data.objects) {
          mcps.push(...data.objects
            .filter(pkg => pkg.package.name.includes('mcp'))
            .map(pkg => ({
              name: pkg.package.name,
              description: pkg.package.description,
              version: pkg.package.version,
              type: 'existing-mcp',
              package: pkg.package.name,
              source: 'npm'
            })));
        }
      }
    } catch (error) {
      console.error('npm search failed:', error);
    }

    return mcps;
  }

  /**
   * Combine results from all sources
   */
  combineResults(results, query) {
    const apis = [];

    results.forEach(result => {
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        apis.push(...result.value);
      }
    });

    // De-duplicate by name
    const seen = new Set();
    return apis.filter(api => {
      if (seen.has(api.name)) {
        return false;
      }
      seen.add(api.name);
      return true;
    });
  }

  /**
   * Rank APIs by relevance
   */
  rankAPIs(apis, query) {
    const queryWords = query.toLowerCase().split(/\s+/);

    return apis.map(api => {
      let score = 0;

      // Score based on name match
      queryWords.forEach(word => {
        if (api.name?.toLowerCase().includes(word)) score += 10;
        if (api.description?.toLowerCase().includes(word)) score += 5;
        if (api.category?.toLowerCase().includes(word)) score += 3;
      });

      // Bonus for certain attributes
      if (api.type === 'existing-mcp') score += 15; // Prefer existing MCPs
      if (api.source === 'gorilla') score += 10; // Trust Gorilla recommendations
      if (api.auth === 'none' || api.auth === 'apiKey') score += 5; // Easier to use
      if (api.https) score += 2;

      return { ...api, relevanceScore: score };
    }).sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Get OpenAPI/Swagger specification for an API
   */
  async getAPISpecification(api) {
    // If API has a swagger URL from apis.guru
    if (api.swaggerUrl) {
      try {
        const response = await fetch(api.swaggerUrl);
        if (response.ok) {
          const spec = await response.json();

          // Extract endpoints from OpenAPI spec
          const endpoints = [];
          if (spec.paths) {
            for (const [path, methods] of Object.entries(spec.paths)) {
              for (const [method, details] of Object.entries(methods)) {
                if (['get', 'post', 'put', 'delete', 'patch'].includes(method.toLowerCase())) {
                  endpoints.push({
                    path: path,
                    method: method.toUpperCase(),
                    description: details.summary || details.description || `${method.toUpperCase()} ${path}`,
                    parameters: this.extractParameters(details),
                    operationId: details.operationId
                  });
                }
              }
            }
          }

          return {
            ...api,
            name: spec.info?.title || api.name,
            description: spec.info?.description || api.description,
            baseUrl: spec.servers?.[0]?.url || api.baseUrl,
            endpoints: endpoints,
            openapi: spec,
            hasSpec: true,
            auth: this.extractAuth(spec)
          };
        }
      } catch (error) {
        console.error('Failed to fetch OpenAPI spec:', error.message);
      }
    }

    // Try common OpenAPI endpoints if no swaggerUrl
    if (api.baseUrl) {
      const specUrls = [
        `${api.baseUrl}/openapi.json`,
        `${api.baseUrl}/swagger.json`,
        `${api.baseUrl}/api-docs`
      ];

      for (const url of specUrls) {
        try {
          const response = await fetch(url);
          if (response.ok) {
            const spec = await response.json();
            return this.getAPISpecification({ ...api, swaggerUrl: url });
          }
        } catch (error) {
          // Continue trying
        }
      }
    }

    // Return API without spec
    return {
      ...api,
      hasSpec: false,
      needsManualSpec: true
    };
  }

  /**
   * Extract parameters from OpenAPI operation
   */
  extractParameters(operation) {
    const params = {
      type: 'object',
      properties: {},
      required: []
    };

    if (operation.parameters) {
      operation.parameters.forEach(param => {
        params.properties[param.name] = {
          type: param.schema?.type || 'string',
          description: param.description || ''
        };
        if (param.required) {
          params.required.push(param.name);
        }
      });
    }

    if (operation.requestBody?.content?.['application/json']?.schema) {
      // Merge request body schema
      const bodySchema = operation.requestBody.content['application/json'].schema;
      if (bodySchema.properties) {
        Object.assign(params.properties, bodySchema.properties);
      }
      if (bodySchema.required) {
        params.required.push(...bodySchema.required);
      }
    }

    return params;
  }

  /**
   * Extract authentication from OpenAPI spec
   */
  extractAuth(spec) {
    if (spec.components?.securitySchemes) {
      const schemes = spec.components.securitySchemes;
      if (schemes.ApiKeyAuth || schemes.apiKey) {
        return 'apiKey';
      }
      if (schemes.BearerAuth || schemes.bearerAuth) {
        return 'bearer';
      }
      if (schemes.OAuth2 || schemes.oauth2) {
        return 'oauth2';
      }
    }
    return 'none';
  }

  /**
   * Create basic API specification structure
   */
  createBasicSpec(api) {
    return {
      name: api.name || 'Unknown API',
      description: api.description || '',
      baseUrl: api.baseUrl || '',
      endpoints: [],
      auth: api.auth || 'none'
    };
  }

  generateSecurityScheme(authType) {
    switch (authType) {
      case 'apiKey':
        return {
          ApiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key'
          }
        };
      case 'oauth2':
        return {
          OAuth2: {
            type: 'oauth2',
            flows: {
              authorizationCode: {
                authorizationUrl: '/oauth/authorize',
                tokenUrl: '/oauth/token',
                scopes: {}
              }
            }
          }
        };
      default:
        return {};
    }
  }

  /**
   * Cache management
   */
  getFromCache(key) {
    const cached = this.cache.get(key);

    if (cached && (Date.now() - cached.timestamp) < this.cacheTTL) {
      return cached.data;
    }

    this.cache.delete(key);
    return null;
  }

  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clearCache() {
    this.cache.clear();
  }
}

export default APIDiscoveryService;