/**
 * API Database - Real API definitions and patterns
 * Contains actual API information for dynamic MCP generation
 */

export const API_DATABASE = {
  // Weather APIs
  'openweather': {
    name: 'OpenWeatherMap',
    description: 'Current weather, forecast, and historical weather data',
    category: 'weather',
    baseUrl: 'https://api.openweathermap.org/data/2.5',
    auth: 'apiKey',
    authHeader: 'appid',
    endpoints: [
      {
        path: '/weather',
        method: 'GET',
        description: 'Get current weather by city',
        parameters: {
          type: 'object',
          properties: {
            q: { type: 'string', description: 'City name' },
            units: { type: 'string', description: 'Temperature units', enum: ['metric', 'imperial'] },
            appid: { type: 'string', description: 'API key' }
          },
          required: ['q', 'appid']
        }
      },
      {
        path: '/forecast',
        method: 'GET',
        description: '5 day weather forecast',
        parameters: {
          type: 'object',
          properties: {
            q: { type: 'string', description: 'City name' },
            cnt: { type: 'integer', description: 'Number of timestamps' },
            appid: { type: 'string', description: 'API key' }
          },
          required: ['q', 'appid']
        }
      }
    ],
    documentation: 'https://openweathermap.org/api'
  },

  // Finance APIs
  'alphavantage': {
    name: 'Alpha Vantage',
    description: 'Real-time and historical stock market data',
    category: 'finance',
    baseUrl: 'https://www.alphavantage.co/query',
    auth: 'apiKey',
    authParam: 'apikey',
    endpoints: [
      {
        path: '',
        method: 'GET',
        description: 'Get stock quote',
        parameters: {
          type: 'object',
          properties: {
            function: { type: 'string', description: 'API function', default: 'GLOBAL_QUOTE' },
            symbol: { type: 'string', description: 'Stock symbol' },
            apikey: { type: 'string', description: 'API key' }
          },
          required: ['function', 'symbol', 'apikey']
        }
      },
      {
        path: '',
        method: 'GET',
        description: 'Get time series data',
        parameters: {
          type: 'object',
          properties: {
            function: {
              type: 'string',
              description: 'Time series function',
              enum: ['TIME_SERIES_DAILY', 'TIME_SERIES_WEEKLY', 'TIME_SERIES_MONTHLY']
            },
            symbol: { type: 'string', description: 'Stock symbol' },
            outputsize: { type: 'string', enum: ['compact', 'full'] },
            apikey: { type: 'string', description: 'API key' }
          },
          required: ['function', 'symbol', 'apikey']
        }
      }
    ],
    documentation: 'https://www.alphavantage.co/documentation/'
  },

  'coinbase': {
    name: 'Coinbase',
    description: 'Cryptocurrency exchange rates and data',
    category: 'cryptocurrency',
    baseUrl: 'https://api.coinbase.com/v2',
    auth: 'none',
    endpoints: [
      {
        path: '/exchange-rates',
        method: 'GET',
        description: 'Get exchange rates',
        parameters: {
          type: 'object',
          properties: {
            currency: { type: 'string', description: 'Base currency' }
          }
        }
      },
      {
        path: '/currencies',
        method: 'GET',
        description: 'List all currencies',
        parameters: {
          type: 'object',
          properties: {}
        }
      },
      {
        path: '/prices/{currency_pair}/spot',
        method: 'GET',
        description: 'Get spot price',
        parameters: {
          type: 'object',
          properties: {
            currency_pair: { type: 'string', description: 'Currency pair (e.g., BTC-USD)' }
          },
          required: ['currency_pair']
        }
      }
    ],
    documentation: 'https://developers.coinbase.com/api/v2'
  },

  // News APIs
  'newsapi': {
    name: 'NewsAPI',
    description: 'News articles from 80,000+ sources',
    category: 'news',
    baseUrl: 'https://newsapi.org/v2',
    auth: 'apiKey',
    authHeader: 'X-Api-Key',
    endpoints: [
      {
        path: '/top-headlines',
        method: 'GET',
        description: 'Get top headlines',
        parameters: {
          type: 'object',
          properties: {
            country: { type: 'string', description: 'Country code' },
            category: {
              type: 'string',
              description: 'News category',
              enum: ['business', 'entertainment', 'general', 'health', 'science', 'sports', 'technology']
            },
            q: { type: 'string', description: 'Search query' }
          }
        }
      },
      {
        path: '/everything',
        method: 'GET',
        description: 'Search all articles',
        parameters: {
          type: 'object',
          properties: {
            q: { type: 'string', description: 'Search query' },
            from: { type: 'string', description: 'From date (YYYY-MM-DD)' },
            to: { type: 'string', description: 'To date (YYYY-MM-DD)' },
            sortBy: { type: 'string', enum: ['relevancy', 'popularity', 'publishedAt'] }
          },
          required: ['q']
        }
      }
    ],
    documentation: 'https://newsapi.org/docs'
  },

  // Social Media APIs
  'github': {
    name: 'GitHub API',
    description: 'GitHub repositories, users, and issues',
    category: 'development',
    baseUrl: 'https://api.github.com',
    auth: 'token',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    endpoints: [
      {
        path: '/user',
        method: 'GET',
        description: 'Get authenticated user',
        parameters: {
          type: 'object',
          properties: {}
        }
      },
      {
        path: '/users/{username}',
        method: 'GET',
        description: 'Get user by username',
        parameters: {
          type: 'object',
          properties: {
            username: { type: 'string', description: 'GitHub username' }
          },
          required: ['username']
        }
      },
      {
        path: '/repos/{owner}/{repo}',
        method: 'GET',
        description: 'Get repository',
        parameters: {
          type: 'object',
          properties: {
            owner: { type: 'string', description: 'Repository owner' },
            repo: { type: 'string', description: 'Repository name' }
          },
          required: ['owner', 'repo']
        }
      },
      {
        path: '/search/repositories',
        method: 'GET',
        description: 'Search repositories',
        parameters: {
          type: 'object',
          properties: {
            q: { type: 'string', description: 'Search query' },
            sort: { type: 'string', enum: ['stars', 'forks', 'updated'] },
            order: { type: 'string', enum: ['asc', 'desc'] }
          },
          required: ['q']
        }
      }
    ],
    documentation: 'https://docs.github.com/en/rest'
  },

  // Location APIs
  'mapbox': {
    name: 'Mapbox',
    description: 'Maps, geocoding, and navigation',
    category: 'location',
    baseUrl: 'https://api.mapbox.com',
    auth: 'apiKey',
    authParam: 'access_token',
    endpoints: [
      {
        path: '/geocoding/v5/mapbox.places/{search_text}.json',
        method: 'GET',
        description: 'Forward geocoding',
        parameters: {
          type: 'object',
          properties: {
            search_text: { type: 'string', description: 'Location to search' },
            access_token: { type: 'string', description: 'API key' }
          },
          required: ['search_text', 'access_token']
        }
      },
      {
        path: '/directions/v5/mapbox/driving/{coordinates}',
        method: 'GET',
        description: 'Get directions',
        parameters: {
          type: 'object',
          properties: {
            coordinates: { type: 'string', description: 'Semicolon-separated coordinates' },
            access_token: { type: 'string', description: 'API key' }
          },
          required: ['coordinates', 'access_token']
        }
      }
    ],
    documentation: 'https://docs.mapbox.com/api/'
  },

  // Communication APIs
  'sendgrid': {
    name: 'SendGrid',
    description: 'Email delivery service',
    category: 'communication',
    baseUrl: 'https://api.sendgrid.com/v3',
    auth: 'apiKey',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    endpoints: [
      {
        path: '/mail/send',
        method: 'POST',
        description: 'Send email',
        parameters: {
          type: 'object',
          properties: {
            personalizations: { type: 'array', description: 'Recipients' },
            from: { type: 'object', description: 'Sender' },
            subject: { type: 'string', description: 'Email subject' },
            content: { type: 'array', description: 'Email content' }
          },
          required: ['personalizations', 'from', 'subject', 'content']
        }
      }
    ],
    documentation: 'https://docs.sendgrid.com/api-reference/mail-send/mail-send'
  },

  'twilio': {
    name: 'Twilio',
    description: 'SMS, voice, and video communication',
    category: 'communication',
    baseUrl: 'https://api.twilio.com/2010-04-01',
    auth: 'basic',
    endpoints: [
      {
        path: '/Accounts/{AccountSid}/Messages.json',
        method: 'POST',
        description: 'Send SMS',
        parameters: {
          type: 'object',
          properties: {
            To: { type: 'string', description: 'Recipient phone number' },
            From: { type: 'string', description: 'Sender phone number' },
            Body: { type: 'string', description: 'Message text' },
            AccountSid: { type: 'string', description: 'Account SID' }
          },
          required: ['To', 'From', 'Body', 'AccountSid']
        }
      }
    ],
    documentation: 'https://www.twilio.com/docs/sms/api'
  },

  // E-commerce APIs
  'stripe': {
    name: 'Stripe',
    description: 'Payment processing',
    category: 'payment',
    baseUrl: 'https://api.stripe.com/v1',
    auth: 'bearer',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    endpoints: [
      {
        path: '/charges',
        method: 'POST',
        description: 'Create a charge',
        parameters: {
          type: 'object',
          properties: {
            amount: { type: 'integer', description: 'Amount in cents' },
            currency: { type: 'string', description: 'Currency code' },
            source: { type: 'string', description: 'Payment source' },
            description: { type: 'string', description: 'Charge description' }
          },
          required: ['amount', 'currency', 'source']
        }
      },
      {
        path: '/customers',
        method: 'POST',
        description: 'Create customer',
        parameters: {
          type: 'object',
          properties: {
            email: { type: 'string', description: 'Customer email' },
            name: { type: 'string', description: 'Customer name' }
          }
        }
      }
    ],
    documentation: 'https://stripe.com/docs/api'
  },

  // AI/ML APIs
  'openai': {
    name: 'OpenAI',
    description: 'GPT models and AI capabilities',
    category: 'ai',
    baseUrl: 'https://api.openai.com/v1',
    auth: 'bearer',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    endpoints: [
      {
        path: '/chat/completions',
        method: 'POST',
        description: 'Chat completion',
        parameters: {
          type: 'object',
          properties: {
            model: { type: 'string', description: 'Model to use' },
            messages: { type: 'array', description: 'Chat messages' },
            temperature: { type: 'number', description: 'Sampling temperature' }
          },
          required: ['model', 'messages']
        }
      }
    ],
    documentation: 'https://platform.openai.com/docs'
  }
};

// Categories with keywords for matching
export const API_CATEGORIES = {
  weather: ['weather', 'forecast', 'temperature', 'climate', 'meteorology'],
  finance: ['stock', 'finance', 'trading', 'market', 'investment', 'forex'],
  cryptocurrency: ['crypto', 'bitcoin', 'ethereum', 'blockchain', 'defi'],
  news: ['news', 'articles', 'media', 'headlines', 'press'],
  social: ['social', 'twitter', 'facebook', 'instagram', 'reddit'],
  development: ['github', 'gitlab', 'git', 'code', 'repository', 'programming'],
  communication: ['email', 'sms', 'message', 'notification', 'chat'],
  payment: ['payment', 'stripe', 'paypal', 'transaction', 'billing'],
  location: ['map', 'geocoding', 'location', 'navigation', 'gps'],
  ai: ['ai', 'ml', 'machine learning', 'openai', 'gpt', 'llm']
};

// Function to search APIs by query
export function searchAPIs(query) {
  const queryLower = query.toLowerCase();
  const results = [];

  // Search in API database
  for (const [key, api] of Object.entries(API_DATABASE)) {
    let score = 0;

    // Check name match
    if (api.name.toLowerCase().includes(queryLower)) score += 10;
    if (key.toLowerCase().includes(queryLower)) score += 8;

    // Check description match
    if (api.description.toLowerCase().includes(queryLower)) score += 5;

    // Check category match
    if (api.category && api.category.toLowerCase().includes(queryLower)) score += 7;

    // Check category keywords
    for (const [category, keywords] of Object.entries(API_CATEGORIES)) {
      if (api.category === category) {
        for (const keyword of keywords) {
          if (queryLower.includes(keyword)) score += 3;
        }
      }
    }

    if (score > 0) {
      results.push({
        ...api,
        id: key,
        relevanceScore: score
      });
    }
  }

  // Sort by relevance
  return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

// Function to get API by ID
export function getAPI(apiId) {
  return API_DATABASE[apiId] || null;
}

// Function to get APIs by category
export function getAPIsByCategory(category) {
  return Object.entries(API_DATABASE)
    .filter(([key, api]) => api.category === category)
    .map(([key, api]) => ({ ...api, id: key }));
}

export default {
  API_DATABASE,
  API_CATEGORIES,
  searchAPIs,
  getAPI,
  getAPIsByCategory
};