/**
 * MCP Viability Checker
 * Determines if an API can be converted to an MCP
 * and identifies missing information
 */

export class MCPViabilityChecker {
  constructor() {
    // Minimum requirements for MCP generation
    this.requirements = {
      essential: {
        baseUrl: 'Base URL is required to know where to send requests',
        endpoints: 'At least one endpoint/route must be defined',
        methods: 'HTTP methods (GET, POST, etc.) must be specified'
      },
      important: {
        parameters: 'Parameter definitions for each endpoint',
        authentication: 'Authentication method should be known',
        responseFormat: 'Response format (JSON, XML, etc.) should be specified'
      },
      helpful: {
        documentation: 'API documentation for understanding usage',
        examples: 'Request/response examples',
        rateLimit: 'Rate limiting information',
        errorCodes: 'Error code definitions'
      }
    };

    // Patterns that indicate an API might not be viable
    this.problematicPatterns = {
      noSpec: 'No OpenAPI/Swagger specification available',
      graphQL: 'GraphQL APIs require special handling',
      websocket: 'WebSocket APIs need different protocol',
      soap: 'SOAP/WSDL services need XML parsing',
      proprietary: 'Proprietary protocols cannot be standardized',
      humanOnly: 'APIs requiring human interaction (CAPTCHA, etc.)',
      browserOnly: 'Browser-only APIs (requires cookies, sessions)',
      binaryProtocol: 'Binary protocols (not HTTP/REST)'
    };
  }

  /**
   * Check if an API can be converted to MCP
   */
  checkViability(api) {
    const result = {
      viable: true,
      score: 100,
      issues: {
        blockers: [],      // Cannot generate MCP
        critical: [],      // Can generate but won't work well
        warnings: [],      // Can generate but limited functionality
        missing: []        // Missing information
      },
      requirements: {
        essential: {},
        important: {},
        helpful: {}
      },
      recommendation: '',
      canGenerate: true,
      generationType: 'automatic' // automatic, manual, impossible
    };

    // 1. Check essential requirements
    if (!api.baseUrl && !api.swaggerUrl && !api.openApiSpec) {
      result.issues.blockers.push('❌ No base URL or API specification found');
      result.requirements.essential.baseUrl = false;
      result.viable = false;
      result.score -= 50;
    } else {
      result.requirements.essential.baseUrl = true;
    }

    // 2. Check for endpoints/routes
    if (!api.endpoints || api.endpoints.length === 0) {
      // Try to infer from OpenAPI spec
      if (!api.openApiSpec && !api.swaggerUrl) {
        result.issues.blockers.push('❌ No endpoints/routes defined');
        result.requirements.essential.endpoints = false;
        result.viable = false;
        result.score -= 40;
      } else {
        result.issues.warnings.push('⚠️ Endpoints not extracted yet (but OpenAPI spec available)');
        result.requirements.essential.endpoints = 'pending';
      }
    } else {
      result.requirements.essential.endpoints = true;

      // Check if endpoints have methods
      const hasValidMethods = api.endpoints.some(ep =>
        ep.method && ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(ep.method.toUpperCase())
      );

      if (!hasValidMethods) {
        result.issues.critical.push('⚠️ No valid HTTP methods found in endpoints');
        result.requirements.essential.methods = false;
        result.score -= 30;
      } else {
        result.requirements.essential.methods = true;
      }
    }

    // 3. Check for problematic API types
    const apiText = JSON.stringify(api).toLowerCase();

    if (apiText.includes('graphql')) {
      result.issues.critical.push('🔧 GraphQL API - requires special GraphQL template');
      result.generationType = 'manual';
      result.score -= 20;
    }

    if (apiText.includes('websocket') || apiText.includes('ws://') || apiText.includes('wss://')) {
      result.issues.blockers.push('❌ WebSocket API - MCP doesn\'t support WebSocket protocol');
      result.viable = false;
      result.canGenerate = false;
      result.score -= 100;
    }

    if (apiText.includes('soap') || apiText.includes('wsdl')) {
      result.issues.critical.push('🔧 SOAP/WSDL API - requires XML handling');
      result.generationType = 'manual';
      result.score -= 25;
    }

    // 4. Check authentication requirements
    if (api.auth) {
      const authType = api.auth.toLowerCase();

      if (authType === 'oauth2' || authType === 'oauth') {
        result.issues.warnings.push('🔐 OAuth required - complex setup needed');
        result.requirements.important.authentication = 'complex';
        result.score -= 10;
      } else if (authType === 'custom' || authType === 'proprietary') {
        result.issues.critical.push('⚠️ Custom/proprietary authentication - may not work');
        result.requirements.important.authentication = 'problematic';
        result.score -= 20;
      } else if (authType === 'none') {
        result.requirements.important.authentication = 'none';
      } else {
        result.requirements.important.authentication = authType;
      }
    } else {
      result.issues.missing.push('Authentication method unknown');
      result.requirements.important.authentication = 'unknown';
    }

    // 5. Check for parameter definitions
    if (api.endpoints && api.endpoints.length > 0) {
      const hasParameters = api.endpoints.some(ep => ep.parameters);
      if (!hasParameters) {
        result.issues.warnings.push('📝 No parameter definitions found for endpoints');
        result.requirements.important.parameters = false;
        result.score -= 15;
      } else {
        result.requirements.important.parameters = true;
      }
    }

    // 6. Check for special requirements
    if (apiText.includes('captcha') || apiText.includes('recaptcha')) {
      result.issues.blockers.push('❌ Requires CAPTCHA - cannot automate');
      result.viable = false;
      result.canGenerate = false;
      result.score = 0;
    }

    if (apiText.includes('browser') && apiText.includes('only')) {
      result.issues.blockers.push('❌ Browser-only API - requires browser environment');
      result.viable = false;
      result.canGenerate = false;
      result.score = 0;
    }

    // 7. Check data format
    if (api.endpoints && api.endpoints.length > 0) {
      const hasJsonEndpoints = api.endpoints.some(ep =>
        !ep.produces || ep.produces.includes('json') ||
        (ep.description && ep.description.toLowerCase().includes('json'))
      );

      if (!hasJsonEndpoints && apiText.includes('xml')) {
        result.issues.warnings.push('📄 XML-only API - may need special handling');
        result.score -= 10;
      }
    }

    // 8. Check for API limits that might affect MCP
    if (apiText.includes('rate limit') && apiText.match(/(\d+)\s*(request|call)/)) {
      const match = apiText.match(/(\d+)\s*(request|call)/);
      const limit = parseInt(match[1]);
      if (limit < 100) {
        result.issues.warnings.push(`⏱️ Very low rate limit (${limit} requests) - may affect usability`);
        result.score -= 5;
      }
    }

    // 9. Missing information check
    if (!api.description || api.description.length < 10) {
      result.issues.missing.push('Description is missing or too short');
    }

    if (!api.version) {
      result.issues.missing.push('API version not specified');
    }

    if (!api.documentation && !api.docsUrl) {
      result.issues.missing.push('Documentation URL not found');
      result.requirements.helpful.documentation = false;
    } else {
      result.requirements.helpful.documentation = true;
    }

    // 10. Calculate final viability
    result.score = Math.max(0, result.score);

    if (result.issues.blockers.length > 0) {
      result.viable = false;
      result.canGenerate = false;
      result.generationType = 'impossible';
      result.recommendation = '❌ Cannot generate MCP - critical information missing or incompatible API type';
    } else if (result.score >= 70) {
      result.recommendation = '✅ Can generate MCP automatically with good success rate';
    } else if (result.score >= 40) {
      result.recommendation = '⚠️ Can generate MCP but may require manual adjustments';
      result.generationType = 'manual';
    } else if (result.score >= 20) {
      result.recommendation = '🔧 MCP generation possible but significant manual work required';
      result.generationType = 'manual';
    } else {
      result.recommendation = '❌ Not recommended for MCP generation - too many issues';
      result.viable = false;
    }

    return result;
  }

  /**
   * Analyze what information is needed to make an API viable
   */
  analyzeRequirements(api) {
    const viability = this.checkViability(api);
    const needed = {
      toMakeViable: [],
      toImprove: [],
      dataToGather: []
    };

    // Check what's needed to make it viable
    if (!viability.viable) {
      if (!viability.requirements.essential.baseUrl) {
        needed.toMakeViable.push({
          field: 'baseUrl',
          description: 'Need the base URL of the API (e.g., https://api.example.com)',
          howToFind: 'Check API documentation or provider website'
        });
      }

      if (!viability.requirements.essential.endpoints) {
        needed.toMakeViable.push({
          field: 'endpoints',
          description: 'Need at least one endpoint/route definition',
          howToFind: 'Look for API documentation, OpenAPI spec, or example requests'
        });
      }

      if (!viability.requirements.essential.methods) {
        needed.toMakeViable.push({
          field: 'methods',
          description: 'Need HTTP methods for each endpoint (GET, POST, etc.)',
          howToFind: 'Check API documentation or OpenAPI specification'
        });
      }
    }

    // Check what would improve the MCP
    if (!viability.requirements.important.parameters) {
      needed.toImprove.push({
        field: 'parameters',
        description: 'Parameter definitions for each endpoint',
        impact: 'Without this, users won\'t know what data to send'
      });
    }

    if (viability.requirements.important.authentication === 'unknown') {
      needed.toImprove.push({
        field: 'authentication',
        description: 'Authentication method (none, apiKey, oauth, etc.)',
        impact: 'Users won\'t know how to authenticate'
      });
    }

    if (!viability.requirements.helpful.documentation) {
      needed.toImprove.push({
        field: 'documentation',
        description: 'Link to API documentation',
        impact: 'Users will have difficulty understanding the API'
      });
    }

    // Suggest data gathering strategies
    if (api.baseUrl) {
      needed.dataToGather.push({
        strategy: 'Try common OpenAPI endpoints',
        endpoints: [
          `${api.baseUrl}/swagger.json`,
          `${api.baseUrl}/openapi.json`,
          `${api.baseUrl}/api-docs`,
          `${api.baseUrl}/v1/swagger.json`,
          `${api.baseUrl}/v2/api-docs`
        ]
      });
    }

    if (api.name) {
      needed.dataToGather.push({
        strategy: 'Search for documentation',
        searches: [
          `${api.name} API documentation`,
          `${api.name} OpenAPI specification`,
          `${api.name} Swagger`,
          `${api.name} API reference`
        ]
      });
    }

    return {
      viability,
      needed
    };
  }

  /**
   * Try to extract missing information from various sources
   */
  async tryToExtractInfo(api) {
    const extracted = {
      endpoints: [],
      parameters: {},
      authentication: null,
      documentation: null
    };

    // If we have an OpenAPI spec URL, try to fetch it
    if (api.openApiSpec || api.swaggerUrl) {
      try {
        const response = await fetch(api.openApiSpec || api.swaggerUrl);
        if (response.ok) {
          const spec = await response.json();

          // Extract endpoints
          if (spec.paths) {
            for (const [path, methods] of Object.entries(spec.paths)) {
              for (const [method, details] of Object.entries(methods)) {
                if (['get', 'post', 'put', 'delete', 'patch'].includes(method.toLowerCase())) {
                  extracted.endpoints.push({
                    path,
                    method: method.toUpperCase(),
                    description: details.summary || details.description,
                    parameters: details.parameters,
                    responses: details.responses
                  });
                }
              }
            }
          }

          // Extract authentication
          if (spec.securitySchemes || spec.components?.securitySchemes) {
            const schemes = spec.securitySchemes || spec.components.securitySchemes;
            if (schemes.apiKey) extracted.authentication = 'apiKey';
            else if (schemes.oauth2) extracted.authentication = 'oauth2';
            else if (schemes.bearerAuth) extracted.authentication = 'bearer';
          }

          // Extract base URL
          if (spec.servers && spec.servers[0]) {
            extracted.baseUrl = spec.servers[0].url;
          }
        }
      } catch (error) {
        console.error('Failed to fetch OpenAPI spec:', error);
      }
    }

    return extracted;
  }
}

export default MCPViabilityChecker;