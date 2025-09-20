/**
 * API Discovery Service
 * Discovers APIs using Gorilla API, web scraping, and registry search
 */

import fetch from 'node-fetch';
import { searchAPIs, getAPI, API_DATABASE } from './api-database.js';

export class APIDiscoveryService {
  constructor() {
    this.gorillaEndpoint = 'https://gorilla.berkeley.edu/api/v1';
    this.registries = [
      'https://api.publicapis.org/entries',
      'https://api.apis.guru/v2/list.json'
    ];
    this.cache = new Map();
    this.cacheTTL = 30 * 60 * 1000; // 30 minutes
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
      this.searchGitHub(query)
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
   * Search public API registries
   */
  async searchRegistries(query) {
    const apis = [];

    // Try to search the APIs.guru registry
    try {
      const response = await fetch('https://api.apis.guru/v2/list.json');

      if (response.ok) {
        const data = await response.json();
        const queryLower = query.toLowerCase();

        for (const [key, api] of Object.entries(data)) {
          const info = api.preferred ? data[key].versions[api.preferred].info : null;
          if (info && (
            info.title?.toLowerCase().includes(queryLower) ||
            info.description?.toLowerCase().includes(queryLower) ||
            key.toLowerCase().includes(queryLower)
          )) {
            apis.push({
              name: info.title,
              description: info.description || '',
              baseUrl: data[key].versions[api.preferred].swaggerUrl || '',
              version: info.version,
              source: 'apis.guru'
            });

            if (apis.length >= 5) break; // Limit results
          }
        }
      }
    } catch (error) {
      // APIs.guru might be down, continue silently
    }

    return apis;
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
    if (api.baseUrl && api.baseUrl.includes('swagger')) {
      try {
        const response = await fetch(api.baseUrl);
        if (response.ok) {
          const spec = await response.json();
          return {
            ...api,
            openapi: spec,
            hasSpec: true
          };
        }
      } catch (error) {
        // Failed to fetch spec
      }
    }

    // Return API without spec - user must provide endpoints manually
    return {
      ...api,
      hasSpec: false,
      needsManualSpec: true
    };
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