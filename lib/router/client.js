/**
 * Lightweight client for the MCP router HTTP service.
 * Provides automatic fallback and cooldown when the remote
 * service is unavailable.
 */

import fetch from 'node-fetch';

const DEFAULT_BASE_URL = process.env.MCP_ROUTER_URL || process.env.ROUTER_URL || null;

export class RouterClient {
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl || DEFAULT_BASE_URL || '').replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs || 2000;
    this.cooldownMs = options.cooldownMs || 15000;
    this.apiKey = options.apiKey || process.env.MCP_ROUTER_API_KEY || process.env.ROUTER_API_KEY || null;
    this.disabledUntil = 0;
  }

  get isConfigured() {
    return Boolean(this.baseUrl);
  }

  async fetchJson(path, { method = 'GET', body, headers = {} } = {}) {
    if (!this.isConfigured) {
      return null;
    }

    const now = Date.now();
    if (now < this.disabledUntil) {
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { 'x-api-key': this.apiKey } : {}),
          ...headers
        },
        body,
        signal: controller.signal
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Router request failed: ${response.status} ${response.statusText} ${text}`.trim());
      }

      if (response.status === 204) {
        return null;
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }

      return await response.text();
    } catch (error) {
      this.disabledUntil = Date.now() + this.cooldownMs;
      if (error.name === 'AbortError') {
        throw new Error('Router request timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async query({ query, topK = 10, filter = null, scoreThreshold = null } = {}) {
    try {
      const response = await this.fetchJson('/router/query', {
        method: 'POST',
        body: JSON.stringify({ query, topK, filter, scoreThreshold })
      });

      return response?.results || null;
    } catch (error) {
      // Silence errors - consumers will fall back to local search
      return null;
    }
  }

  async upsert(documents = []) {
    return this.fetchJson('/router/upsert', {
      method: 'POST',
      body: JSON.stringify({ documents })
    });
  }

  async delete(ids = []) {
    return this.fetchJson('/router/delete', {
      method: 'POST',
      body: JSON.stringify({ ids })
    });
  }

  async health() {
    try {
      const response = await this.fetchJson('/health');
      return response;
    } catch (error) {
      return { status: 'error', error: error.message };
    }
  }
}

export default RouterClient;
