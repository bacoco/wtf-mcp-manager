/**
 * API Quality Evaluator
 * Scores APIs based on multiple quality indicators
 */

export class APIEvaluator {
  constructor() {
    // Quality indicators and their weights
    this.qualityFactors = {
      hasOpenAPISpec: 20,        // Has OpenAPI/Swagger specification
      hasDocumentation: 15,       // Has good documentation URL
      isFreeTier: 25,            // Has free tier or is completely free
      authSimplicity: 10,         // Simple authentication (none > apiKey > oauth)
      isHTTPS: 5,                // Uses HTTPS
      hasEndpoints: 15,           // Has defined endpoints
      hasRateLimit: -5,          // Rate limits (negative score)
      requiresPayment: -20,       // Requires payment (negative score)
      isDeprecated: -50,         // API is deprecated
      popularityScore: 10,       // Based on GitHub stars, npm downloads, etc.
      responseTime: 10,          // Fast response time
      uptime: 10,                // High uptime/reliability
      lastUpdated: 10            // Recently updated
    };

    // Authentication complexity scores
    this.authScores = {
      'none': 10,
      'apiKey': 8,
      'bearer': 6,
      'oauth': 4,
      'oauth2': 4,
      'custom': 2,
      'unknown': 0
    };

    // Pricing indicators (keywords that suggest free/paid)
    this.pricingIndicators = {
      free: [
        'free', 'open', 'public', 'no cost', 'gratis', 'libre',
        'community', 'open source', 'mit', 'apache', 'gpl'
      ],
      freemium: [
        'freemium', 'free tier', 'free plan', 'basic plan',
        'starter', 'trial', 'limited', 'quota'
      ],
      paid: [
        'paid', 'premium', 'pricing', 'subscription', 'enterprise',
        'pro', 'business', 'commercial', 'license', 'billing'
      ]
    };
  }

  /**
   * Evaluate an API and calculate comprehensive quality score
   */
  evaluateAPI(api) {
    let qualityScore = 0;
    let relevanceScore = api.relevanceScore || 0;
    const evaluation = {
      api: api.name,
      scores: {
        relevance: relevanceScore,
        quality: 0,
        total: 0
      },
      pricing: {
        type: 'unknown',
        requiresKey: false,
        requiresPayment: false,
        details: []
      },
      requirements: [],
      warnings: [],
      recommendations: []
    };

    // 1. Check for OpenAPI/Swagger spec
    if (api.openApiSpec || api.swaggerUrl || api.hasSpec) {
      qualityScore += this.qualityFactors.hasOpenAPISpec;
      evaluation.requirements.push('✓ Has OpenAPI specification');
    } else {
      evaluation.warnings.push('⚠ No OpenAPI specification found');
    }

    // 2. Documentation check
    if (api.documentation || api.docsUrl || (api.baseUrl && api.baseUrl.includes('doc'))) {
      qualityScore += this.qualityFactors.hasDocumentation;
      evaluation.requirements.push('✓ Has documentation');
    }

    // 3. Authentication analysis
    const authType = (api.auth || 'unknown').toLowerCase();
    const authScore = this.authScores[authType] || 0;
    qualityScore += authScore;

    if (authType === 'none') {
      evaluation.pricing.type = 'free';
      evaluation.requirements.push('✓ No authentication required');
      qualityScore += this.qualityFactors.isFreeTier;
    } else if (authType === 'apikey' || authType === 'bearer') {
      evaluation.pricing.requiresKey = true;
      evaluation.requirements.push(`⚠ Requires API key (${authType})`);
      evaluation.recommendations.push('You will need to register for an API key');
    } else if (authType.includes('oauth')) {
      evaluation.pricing.requiresKey = true;
      evaluation.requirements.push(`⚠ Requires OAuth authentication`);
      evaluation.recommendations.push('Complex authentication setup required');
    }

    // 4. Pricing detection
    const apiText = JSON.stringify(api).toLowerCase();
    let pricingType = 'unknown';

    // Check for free indicators
    const freeCount = this.pricingIndicators.free.filter(term => apiText.includes(term)).length;
    const freemiumCount = this.pricingIndicators.freemium.filter(term => apiText.includes(term)).length;
    const paidCount = this.pricingIndicators.paid.filter(term => apiText.includes(term)).length;

    if (freeCount > paidCount && freeCount > freemiumCount) {
      pricingType = 'free';
      qualityScore += this.qualityFactors.isFreeTier;
      evaluation.pricing.type = 'free';
      evaluation.pricing.details.push('Appears to be free');
    } else if (freemiumCount > 0 || (freeCount > 0 && paidCount > 0)) {
      pricingType = 'freemium';
      qualityScore += this.qualityFactors.isFreeTier / 2;
      evaluation.pricing.type = 'freemium';
      evaluation.pricing.details.push('Has free tier with paid options');
      evaluation.warnings.push('⚠ May have usage limits on free tier');
    } else if (paidCount > freeCount) {
      pricingType = 'paid';
      qualityScore += this.qualityFactors.requiresPayment;
      evaluation.pricing.type = 'paid';
      evaluation.pricing.requiresPayment = true;
      evaluation.pricing.details.push('Requires payment');
      evaluation.warnings.push('💰 This is a paid API');
    }

    // 5. HTTPS check
    if (api.baseUrl && api.baseUrl.startsWith('https://')) {
      qualityScore += this.qualityFactors.isHTTPS;
      evaluation.requirements.push('✓ Uses HTTPS');
    } else if (api.baseUrl && api.baseUrl.startsWith('http://')) {
      evaluation.warnings.push('⚠ Does not use HTTPS');
    }

    // 6. Endpoints check
    if (api.endpoints && api.endpoints.length > 0) {
      qualityScore += this.qualityFactors.hasEndpoints;
      evaluation.requirements.push(`✓ Has ${api.endpoints.length} defined endpoints`);
    }

    // 7. Check for deprecation
    if (apiText.includes('deprecated') || apiText.includes('legacy') || apiText.includes('sunset')) {
      qualityScore += this.qualityFactors.isDeprecated;
      evaluation.warnings.push('⛔ API may be deprecated or legacy');
    }

    // 8. Source-based quality boost
    if (api.source === 'APIs.guru') {
      qualityScore += 5; // Trusted source
      evaluation.requirements.push('✓ From APIs.guru (trusted source)');
    }

    // 9. Check for rate limits
    if (apiText.includes('rate limit') || apiText.includes('quota') || apiText.includes('throttle')) {
      qualityScore += this.qualityFactors.hasRateLimit;
      evaluation.warnings.push('⚠ Has rate limiting');
    }

    // 10. Additional requirements based on description
    if (api.description) {
      // Check for geographic restrictions
      if (api.description.match(/only.*(US|UK|EU|Europe|America)/i)) {
        evaluation.warnings.push('🌍 May have geographic restrictions');
      }

      // Check for business requirements
      if (api.description.match(/business|enterprise|corporate/i)) {
        evaluation.warnings.push('🏢 May require business account');
      }

      // Check for special requirements
      if (api.description.match(/approval|review|manual|contact/i)) {
        evaluation.warnings.push('📋 May require manual approval');
      }
    }

    // Calculate final scores
    evaluation.scores.quality = Math.max(0, qualityScore);
    evaluation.scores.total = evaluation.scores.relevance + evaluation.scores.quality;

    // Add overall recommendation
    if (evaluation.scores.quality >= 50) {
      evaluation.recommendation = '🌟 Excellent API - highly recommended';
    } else if (evaluation.scores.quality >= 30) {
      evaluation.recommendation = '👍 Good API - recommended with considerations';
    } else if (evaluation.scores.quality >= 10) {
      evaluation.recommendation = '⚠️ Usable API - check requirements carefully';
    } else {
      evaluation.recommendation = '❌ Not recommended - significant limitations';
    }

    return evaluation;
  }

  /**
   * Evaluate multiple APIs and return top N
   */
  evaluateMultiple(apis, topN = 4) {
    const evaluations = apis.map(api => ({
      ...api,
      evaluation: this.evaluateAPI(api)
    }));

    // Sort by total score
    evaluations.sort((a, b) =>
      b.evaluation.scores.total - a.evaluation.scores.total
    );

    return evaluations.slice(0, topN);
  }

  /**
   * Generate detailed report for evaluated APIs
   */
  generateReport(evaluatedAPIs) {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalEvaluated: evaluatedAPIs.length,
        free: 0,
        freemium: 0,
        paid: 0,
        unknown: 0
      },
      topAPIs: []
    };

    evaluatedAPIs.forEach((api, index) => {
      const evaluation = api.evaluation;

      // Update summary
      report.summary[evaluation.pricing.type]++;

      // Add to top APIs
      report.topAPIs.push({
        rank: index + 1,
        name: api.name,
        provider: api.provider || api.source,
        scores: evaluation.scores,
        pricing: evaluation.pricing,
        recommendation: evaluation.recommendation,
        requirements: evaluation.requirements,
        warnings: evaluation.warnings,
        hasOpenAPISpec: !!(api.openApiSpec || api.swaggerUrl),
        baseUrl: api.baseUrl
      });
    });

    return report;
  }

  /**
   * Filter APIs by pricing type
   */
  filterByPricing(apis, pricingType = 'free') {
    return apis.filter(api => {
      const evaluation = this.evaluateAPI(api);
      return evaluation.pricing.type === pricingType;
    });
  }

  /**
   * Get only APIs that don't require authentication
   */
  getNoAuthAPIs(apis) {
    return apis.filter(api =>
      api.auth === 'none' ||
      api.auth === null ||
      api.auth === undefined
    );
  }
}

export default APIEvaluator;