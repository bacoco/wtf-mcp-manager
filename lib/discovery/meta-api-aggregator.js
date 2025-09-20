/**
 * Meta-API Aggregator
 * Connects to multiple API catalogs and marketplaces
 * to discover ALL available APIs
 */

import fetch from 'node-fetch';

export class MetaAPIAggregator {
  constructor() {
    this.sources = {
      // APIs.guru - Already integrated, 2000+ APIs with OpenAPI specs
      apisGuru: {
        name: 'APIs.guru',
        description: 'Wikipedia for Web APIs, 2000+ APIs with OpenAPI specs',
        url: 'https://api.apis.guru/v2/list.json',
        type: 'catalog',
        free: true,
        apiCount: '2000+'
      },

      // RapidAPI - World's largest API marketplace
      rapidAPI: {
        name: 'RapidAPI',
        description: 'World\'s largest API Hub with 40,000+ APIs',
        searchUrl: 'https://rapidapi.com/search/',
        apiUrl: 'https://rapidapi.com/api/',
        type: 'marketplace',
        free: false, // Requires account
        apiCount: '40,000+',
        categories: [
          'Sports', 'Finance', 'Entertainment', 'Weather', 'Travel',
          'Music', 'Food', 'News', 'Gaming', 'Social', 'Shopping',
          'Translation', 'Education', 'Health', 'Maps', 'Tools'
        ]
      },

      // Public APIs Project
      publicAPIs: {
        name: 'Public APIs',
        description: 'Collective list of 1400+ free APIs',
        url: 'https://api.publicapis.org/entries',
        githubUrl: 'https://raw.githubusercontent.com/public-apis/public-apis/master/README.md',
        type: 'catalog',
        free: true,
        apiCount: '1400+'
      },

      // API Layer (Apilayer)
      apiLayer: {
        name: 'APILayer',
        description: 'Curated API marketplace with 100+ premium APIs',
        url: 'https://apilayer.com/',
        type: 'marketplace',
        free: false, // Freemium model
        apiCount: '100+',
        apis: [
          'exchangeratesapi', 'ipapi', 'weatherstack', 'mediastack',
          'aviationstack', 'currencylayer', 'marketstack', 'scrapestack'
        ]
      },

      // ProgrammableWeb (now part of RapidAPI)
      programmableWeb: {
        name: 'ProgrammableWeb',
        description: 'Original API directory, now part of RapidAPI',
        url: 'https://www.programmableweb.com/apis/directory',
        type: 'directory',
        free: true,
        apiCount: '24,000+'
      },

      // API List
      apiList: {
        name: 'API List',
        description: 'Curated list of 800+ APIs',
        url: 'https://apilist.fun/',
        githubUrl: 'https://raw.githubusercontent.com/public-apis/public-apis/master/README.md',
        type: 'catalog',
        free: true,
        apiCount: '800+'
      },

      // AnyAPI
      anyAPI: {
        name: 'AnyAPI',
        description: 'Documentation and testing for 1400+ APIs',
        url: 'https://any-api.com/',
        type: 'catalog',
        free: true,
        apiCount: '1400+'
      },

      // Postman API Network
      postman: {
        name: 'Postman API Network',
        description: 'Explore 100,000+ public APIs',
        url: 'https://www.postman.com/explore',
        type: 'platform',
        free: true,
        apiCount: '100,000+'
      },

      // OpenAPI Directory (APIs.guru backend)
      openAPIDirectory: {
        name: 'OpenAPI Directory',
        description: 'Machine-readable API descriptions',
        url: 'https://github.com/APIs-guru/openapi-directory',
        type: 'repository',
        free: true,
        apiCount: '2000+'
      }
    };

    // Known API aggregation endpoints
    this.aggregationAPIs = {
      // API Harmony - Unified API search
      apiHarmony: {
        name: 'API Harmony',
        endpoint: 'https://apiharmony-open.p.rapidapi.com/search',
        description: 'Search across multiple API sources'
      },

      // API Stack - API discovery service
      apiStack: {
        name: 'API Stack',
        endpoint: 'http://theapistack.com/apis.json',
        description: 'Curated API collections'
      }
    };
  }

  /**
   * Search ALL API sources
   */
  async searchAllSources(query) {
    const results = {
      query: query,
      timestamp: new Date().toISOString(),
      sources: [],
      totalAPIs: 0,
      apis: []
    };

    // Search each source
    const searches = [
      this.searchAPIsGuru(query),
      this.searchPublicAPIs(query),
      this.searchGitHubAwesomeAPIs(query),
      this.searchPostmanNetwork(query)
    ];

    const searchResults = await Promise.allSettled(searches);

    searchResults.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        results.sources.push(result.value.source);
        results.totalAPIs += result.value.count || 0;
        results.apis.push(...(result.value.apis || []));
      }
    });

    // Remove duplicates
    const seen = new Set();
    results.apis = results.apis.filter(api => {
      const key = `${api.name}-${api.provider}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by relevance
    results.apis.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

    return results;
  }

  /**
   * Search APIs.guru catalog
   */
  async searchAPIsGuru(query) {
    try {
      const response = await fetch(this.sources.apisGuru.url);
      if (!response.ok) return null;

      const data = await response.json();
      const apis = [];
      const queryLower = query.toLowerCase();

      for (const [key, api] of Object.entries(data)) {
        if (api.preferred) {
          const info = api.versions[api.preferred].info;
          const searchText = `${key} ${info.title} ${info.description}`.toLowerCase();

          if (searchText.includes(queryLower)) {
            apis.push({
              name: info.title,
              provider: key,
              description: info.description,
              version: info.version,
              openApiSpec: api.versions[api.preferred].swaggerUrl,
              source: 'APIs.guru',
              hasSpec: true
            });
          }
        }
      }

      return {
        source: 'APIs.guru',
        count: apis.length,
        apis: apis.slice(0, 20)
      };
    } catch (error) {
      console.error('APIs.guru search error:', error.message);
      return null;
    }
  }

  /**
   * Search Public APIs
   */
  async searchPublicAPIs(query) {
    try {
      // Use the GitHub raw content as the API might be down
      const response = await fetch(
        'https://raw.githubusercontent.com/public-apis/public-apis/master/README.md'
      );

      if (!response.ok) return null;

      const markdown = await response.text();
      const apis = [];
      const queryLower = query.toLowerCase();

      // Parse markdown table rows
      const lines = markdown.split('\n');
      let inTable = false;

      for (const line of lines) {
        if (line.includes('| API | Description |')) {
          inTable = true;
          continue;
        }

        if (inTable && line.startsWith('|')) {
          const parts = line.split('|').map(p => p.trim());
          if (parts.length >= 3) {
            const name = parts[1].replace(/\[|\]/g, '').split('(')[0];
            const description = parts[2];

            if (name && description &&
                (name.toLowerCase().includes(queryLower) ||
                 description.toLowerCase().includes(queryLower))) {
              apis.push({
                name: name,
                description: description,
                source: 'Public APIs',
                free: true
              });
            }
          }
        }
      }

      return {
        source: 'Public APIs',
        count: apis.length,
        apis: apis.slice(0, 20)
      };
    } catch (error) {
      console.error('Public APIs search error:', error.message);
      return null;
    }
  }

  /**
   * Search GitHub Awesome APIs lists
   */
  async searchGitHubAwesomeAPIs(query) {
    try {
      const repos = [
        'public-apis/public-apis',
        'TonnyL/Awesome_APIs',
        'Kikobeats/awesome-api',
        'abhishekbanthia/Public-APIs'
      ];

      const apis = [];

      for (const repo of repos) {
        try {
          const response = await fetch(
            `https://api.github.com/search/code?q=${encodeURIComponent(query)}+in:file+repo:${repo}`,
            {
              headers: {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'wtf-mcp-manager'
              }
            }
          );

          if (response.ok) {
            const data = await response.json();
            if (data.items) {
              data.items.forEach(item => {
                apis.push({
                  name: item.name,
                  repository: item.repository.full_name,
                  path: item.path,
                  source: 'GitHub Awesome Lists',
                  url: item.html_url
                });
              });
            }
          }
        } catch (error) {
          // Continue with next repo
        }
      }

      return {
        source: 'GitHub Awesome Lists',
        count: apis.length,
        apis: apis.slice(0, 10)
      };
    } catch (error) {
      console.error('GitHub search error:', error.message);
      return null;
    }
  }

  /**
   * Search Postman Network (simulated as it requires auth)
   */
  async searchPostmanNetwork(query) {
    // Postman requires authentication
    // Return example structure
    return {
      source: 'Postman Network',
      count: 0,
      apis: [],
      note: 'Requires Postman account for API access'
    };
  }

  /**
   * Get statistics about available APIs
   */
  getStatistics() {
    let totalAPIs = 0;
    const stats = {
      sources: [],
      totalEstimatedAPIs: 0,
      byCategory: {},
      freeAPIs: 0,
      premiumAPIs: 0
    };

    for (const [key, source] of Object.entries(this.sources)) {
      const count = parseInt(source.apiCount.replace(/[^0-9]/g, '')) || 0;
      totalAPIs += count;

      stats.sources.push({
        name: source.name,
        type: source.type,
        apiCount: source.apiCount,
        free: source.free
      });

      if (source.free) {
        stats.freeAPIs += count;
      } else {
        stats.premiumAPIs += count;
      }
    }

    stats.totalEstimatedAPIs = totalAPIs;

    return stats;
  }

  /**
   * Get direct access to specific marketplace
   */
  getMarketplace(name) {
    return this.sources[name] || null;
  }

  /**
   * List all available API sources
   */
  listSources() {
    return Object.entries(this.sources).map(([key, source]) => ({
      id: key,
      ...source
    }));
  }
}

export default MetaAPIAggregator;