/**
 * Web Search for API Discovery
 * Uses multiple strategies to find APIs on the web
 */

import fetch from 'node-fetch';

export class WebSearchService {
  constructor() {
    // Known maritime/vessel tracking APIs
    this.knownMaritimeAPIs = {
      'marinetraffic': {
        name: 'MarineTraffic API',
        description: 'Real-time ship positions, vessel tracking, port arrivals',
        baseUrl: 'https://services.marinetraffic.com/api',
        documentation: 'https://www.marinetraffic.com/en/ais-api-services',
        auth: 'apiKey',
        category: 'maritime',
        endpoints: [
          {
            path: '/exportvessel/v5',
            method: 'GET',
            description: 'Get vessel position by IMO, MMSI, or vessel ID',
            parameters: {
              type: 'object',
              properties: {
                v: { type: 'string', description: 'API version', default: '5' },
                msgtype: { type: 'string', description: 'Message type', enum: ['simple', 'extended'] },
                mmsi: { type: 'string', description: 'MMSI number' },
                imo: { type: 'string', description: 'IMO number' },
                apikey: { type: 'string', description: 'API key' }
              },
              required: ['apikey']
            }
          }
        ]
      },
      'vesseltracker': {
        name: 'VesselFinder API',
        description: 'Global AIS vessel tracking, ship positions, port calls',
        baseUrl: 'https://api.vesselfinder.com',
        documentation: 'https://api.vesselfinder.com/docs/',
        auth: 'apiKey',
        category: 'maritime',
        endpoints: [
          {
            path: '/vessels',
            method: 'GET',
            description: 'Search vessels by name, IMO, or MMSI',
            parameters: {
              type: 'object',
              properties: {
                userkey: { type: 'string', description: 'API key' },
                imo: { type: 'string', description: 'IMO number' },
                mmsi: { type: 'string', description: 'MMSI number' },
                name: { type: 'string', description: 'Vessel name' }
              },
              required: ['userkey']
            }
          }
        ]
      },
      'fleetmon': {
        name: 'FleetMon API',
        description: 'Vessel tracking, AIS data, port information',
        baseUrl: 'https://api.fleetmon.com',
        documentation: 'https://www.fleetmon.com/services/api/',
        auth: 'apiKey',
        category: 'maritime',
        endpoints: [
          {
            path: '/vessels',
            method: 'GET',
            description: 'Get vessel information and current position'
          }
        ]
      },
      'spire': {
        name: 'Spire Maritime API',
        description: 'Satellite AIS data, vessel tracking, maritime analytics',
        baseUrl: 'https://api.spire.com/maritime',
        documentation: 'https://spire.com/maritime/',
        auth: 'bearer',
        category: 'maritime'
      },
      'marineapi': {
        name: 'Marine API',
        description: 'Free AIS vessel tracking API',
        baseUrl: 'https://api.marineapi.com',
        documentation: 'https://marineapi.com/docs',
        auth: 'none',
        category: 'maritime',
        endpoints: [
          {
            path: '/v1/vessels/position',
            method: 'GET',
            description: 'Get vessel positions in area',
            parameters: {
              type: 'object',
              properties: {
                lat: { type: 'number', description: 'Latitude' },
                lon: { type: 'number', description: 'Longitude' },
                radius: { type: 'number', description: 'Search radius in km' }
              }
            }
          }
        ]
      }
    };

    // Weather APIs that include marine weather
    this.marineWeatherAPIs = {
      'stormglass': {
        name: 'StormGlass Marine Weather API',
        description: 'Marine weather, ocean data, wave height, wind speed',
        baseUrl: 'https://api.stormglass.io/v2',
        documentation: 'https://docs.stormglass.io/',
        auth: 'apiKey',
        category: 'marine-weather',
        endpoints: [
          {
            path: '/weather/point',
            method: 'GET',
            description: 'Get marine weather for a specific point',
            parameters: {
              type: 'object',
              properties: {
                lat: { type: 'number', description: 'Latitude' },
                lng: { type: 'number', description: 'Longitude' },
                params: { type: 'string', description: 'Weather parameters (waveHeight,windSpeed,etc)' }
              },
              required: ['lat', 'lng']
            }
          }
        ]
      },
      'noaa': {
        name: 'NOAA Marine API',
        description: 'US National Weather Service marine forecasts',
        baseUrl: 'https://api.weather.gov',
        documentation: 'https://www.weather.gov/documentation/services-web-api',
        auth: 'none',
        category: 'marine-weather'
      }
    };
  }

  /**
   * Search for APIs based on query
   */
  async searchAPIs(query) {
    const queryLower = query.toLowerCase();
    const results = [];

    // Check if query is maritime-related
    const maritimeKeywords = ['vessel', 'ship', 'maritime', 'marine', 'ais', 'tracking', 'port', 'fleet', 'cargo', 'nord', 'north sea'];
    const isMaritimeQuery = maritimeKeywords.some(keyword => queryLower.includes(keyword));

    if (isMaritimeQuery) {
      // Add all maritime APIs
      for (const [key, api] of Object.entries(this.knownMaritimeAPIs)) {
        results.push({
          ...api,
          id: key,
          source: 'maritime-database',
          relevanceScore: 10
        });
      }

      // Add marine weather APIs
      for (const [key, api] of Object.entries(this.marineWeatherAPIs)) {
        results.push({
          ...api,
          id: key,
          source: 'marine-weather',
          relevanceScore: 8
        });
      }
    }

    // Try to search using programmable search engines
    // Note: These would require API keys in production
    const searchEngines = [
      {
        name: 'Brave Search',
        url: `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query + ' API documentation')}`,
        requiresKey: true
      },
      {
        name: 'SerpAPI',
        url: `https://serpapi.com/search.json?q=${encodeURIComponent(query + ' API')}`,
        requiresKey: true
      }
    ];

    // For now, return known APIs
    return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Get specific maritime API details
   */
  getMaritimeAPI(apiId) {
    return this.knownMaritimeAPIs[apiId] || this.marineWeatherAPIs[apiId] || null;
  }

  /**
   * Generate API spec for vessel tracking
   */
  generateVesselTrackingSpec(region = 'north-sea') {
    return {
      name: `Vessel Tracking ${region}`,
      description: `Real-time vessel tracking and AIS data for ${region} region`,
      baseUrl: 'https://api.marinetraffic.com',
      auth: 'apiKey',
      endpoints: [
        {
          path: '/exportvessels/v8',
          method: 'GET',
          description: 'Get all vessels in area',
          parameters: {
            type: 'object',
            properties: {
              v: { type: 'string', default: '8' },
              msgtype: { type: 'string', enum: ['simple', 'extended', 'full'] },
              MINLAT: { type: 'number', description: 'Minimum latitude' },
              MAXLAT: { type: 'number', description: 'Maximum latitude' },
              MINLON: { type: 'number', description: 'Minimum longitude' },
              MAXLON: { type: 'number', description: 'Maximum longitude' },
              timespan: { type: 'number', description: 'Minutes since last position report', default: 20 },
              apikey: { type: 'string', description: 'API key' }
            },
            required: ['MINLAT', 'MAXLAT', 'MINLON', 'MAXLON', 'apikey']
          }
        },
        {
          path: '/exportvessel/v5',
          method: 'GET',
          description: 'Get specific vessel by MMSI/IMO',
          parameters: {
            type: 'object',
            properties: {
              v: { type: 'string', default: '5' },
              msgtype: { type: 'string', enum: ['simple', 'extended', 'full'] },
              mmsi: { type: 'string', description: 'MMSI number' },
              imo: { type: 'string', description: 'IMO number' },
              apikey: { type: 'string', description: 'API key' }
            },
            required: ['apikey']
          }
        },
        {
          path: '/exportportcalls/v4',
          method: 'GET',
          description: 'Get port calls for a vessel',
          parameters: {
            type: 'object',
            properties: {
              v: { type: 'string', default: '4' },
              mmsi: { type: 'string', description: 'MMSI number' },
              imo: { type: 'string', description: 'IMO number' },
              fromdate: { type: 'string', description: 'From date (YYYY-MM-DD)' },
              todate: { type: 'string', description: 'To date (YYYY-MM-DD)' },
              apikey: { type: 'string', description: 'API key' }
            },
            required: ['apikey']
          }
        }
      ],
      regions: {
        'north-sea': {
          MINLAT: 51.0,
          MAXLAT: 61.0,
          MINLON: -2.0,
          MAXLON: 10.0
        },
        'mediterranean': {
          MINLAT: 30.0,
          MAXLAT: 46.0,
          MINLON: -6.0,
          MAXLON: 37.0
        },
        'baltic': {
          MINLAT: 53.0,
          MAXLAT: 66.0,
          MINLON: 10.0,
          MAXLON: 31.0
        }
      }
    };
  }
}

export default WebSearchService;