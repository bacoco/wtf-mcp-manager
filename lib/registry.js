import { readFileSync, existsSync } from 'fs';
import path from 'path';

/**
 * MCP Registry
 * Central registry of all known MCPs
 */

export class MCPRegistry {
  constructor() {
    this.registry = {
      'supabase': {
        name: 'Supabase',
        package: '@supabase/mcp-server-supabase@latest',
        command: 'npx',
        args: ['-y', '@supabase/mcp-server-supabase@latest'],
        requiredEnv: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
        description: '🗄️  Database & Storage - Supabase integration',
        categories: ['database', 'storage', 'auth'],
        autoDetect: ['supabase/', '.supabase/', 'supabase.config.js', 'supabase.config.toml']
      },
      'brave-search': {
        name: 'Brave Search',
        package: '@modelcontextprotocol/server-brave-search',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-brave-search'],
        requiredEnv: ['BRAVE_API_KEY'],
        description: '🔍 Web Search - Brave search engine',
        categories: ['search', 'web']
      },
      'firecrawl': {
        name: 'Firecrawl',
        package: 'firecrawl-mcp',
        command: 'npx',
        args: ['-y', 'firecrawl-mcp'],
        requiredEnv: ['FIRECRAWL_API_KEY'],
        description: '🕷️  Web Scraping - Advanced web scraping',
        categories: ['scraping', 'web']
      },
      'playwright': {
        name: 'Playwright',
        package: '@playwright/mcp@latest',
        command: 'npx',
        args: ['-y', '@playwright/mcp@latest'],
        requiredEnv: [],
        description: '🎭 Browser Automation - Control browsers',
        categories: ['automation', 'testing'],
        autoDetect: ['playwright.config.js', 'playwright.config.ts', 'tests/', 'e2e/']
      },
      'github': {
        name: 'GitHub',
        package: '@modelcontextprotocol/server-github',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        requiredEnv: ['GITHUB_TOKEN'],
        description: '🐙 GitHub - Repository management',
        categories: ['vcs', 'collaboration'],
        autoDetect: ['.git/', '.github/']
      },
      'docker': {
        name: 'Docker',
        package: '@modelcontextprotocol/server-docker',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-docker'],
        requiredEnv: [],
        description: '🐳 Docker - Container management',
        categories: ['devops', 'containers'],
        autoDetect: ['docker-compose.yml', 'docker-compose.yaml', 'Dockerfile', '.dockerignore']
      },
      'sequential-thinking': {
        name: 'Sequential Thinking',
        package: '@modelcontextprotocol/server-sequential-thinking',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
        requiredEnv: [],
        description: '🧠 AI Reasoning - Step-by-step thinking',
        categories: ['ai', 'reasoning']
      },
      'context7': {
        name: 'Context7',
        package: '@upstash/context7-mcp',
        command: 'npx',
        args: ['-y', '@upstash/context7-mcp'],
        requiredEnv: [],
        description: '📚 Documentation - Library docs access',
        categories: ['docs', 'reference']
      },
      'shadcn-ui': {
        name: 'Shadcn UI',
        package: '@jpisnice/shadcn-ui-mcp-server',
        command: 'npx',
        args: ['-y', '@jpisnice/shadcn-ui-mcp-server'],
        requiredEnv: [],
        description: '🎨 UI Components - Shadcn/ui components',
        categories: ['ui', 'components'],
        autoDetect: ['components.json', 'components/ui/']
      },
      'semgrep': {
        name: 'Semgrep',
        package: 'semgrep-mcp',
        command: 'uvx',
        args: ['semgrep-mcp'],
        requiredEnv: [],
        description: '🔒 Security - Code security analysis',
        categories: ['security', 'analysis'],
        autoDetect: ['.semgrep.yml', '.semgrep/']
      },
      'vercel': {
        name: 'Vercel',
        package: '@modelcontextprotocol/server-vercel',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-vercel'],
        requiredEnv: ['VERCEL_TOKEN'],
        description: '▲ Vercel - Deployment management',
        categories: ['deployment', 'hosting'],
        autoDetect: ['vercel.json', '.vercel/']
      },
      'aws': {
        name: 'AWS',
        package: '@modelcontextprotocol/server-aws',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-aws'],
        requiredEnv: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
        description: '☁️  AWS - Amazon Web Services',
        categories: ['cloud', 'infrastructure'],
        autoDetect: ['serverless.yml', '.aws/', 'sam.yml']
      }
    };

    this.loadOverrides();
  }

  get(mcpId) {
    return this.registry[mcpId];
  }

  getAll() {
    return this.registry;
  }

  search(query) {
    const results = [];
    const q = query.toLowerCase();
    
    for (const [id, info] of Object.entries(this.registry)) {
      if (
        id.includes(q) ||
        info.name.toLowerCase().includes(q) ||
        info.description.toLowerCase().includes(q) ||
        (info.categories || []).some(cat => cat.includes(q))
      ) {
        results.push({ id, ...info });
      }
    }
    
    return results;
  }

  getByCategory(category) {
    const results = [];
    
    for (const [id, info] of Object.entries(this.registry)) {
      if ((info.categories || []).includes(category)) {
        results.push({ id, ...info });
      }
    }
    
    return results;
  }

  getCategories() {
    const categories = new Set();
    
    for (const info of Object.values(this.registry)) {
      (info.categories || []).forEach(cat => categories.add(cat));
    }
    
    return Array.from(categories).sort();
  }

  add(mcpId, info) {
    this.registry[mcpId] = info;
  }

  remove(mcpId) {
    delete this.registry[mcpId];
  }

  loadOverrides() {
    const overridePaths = new Set();

    const envOverrides = process.env.WTF_MCP_REGISTRY_OVERRIDES;
    if (envOverrides) {
      envOverrides
        .split(',')
        .map(pathStr => pathStr.trim())
        .filter(Boolean)
        .forEach(pathStr => {
          const absolute = path.isAbsolute(pathStr)
            ? pathStr
            : path.resolve(process.cwd(), pathStr);
          overridePaths.add(absolute);
        });
    }

    const defaultPath = path.join(process.cwd(), '.claude', 'registry-overrides.json');
    if (existsSync(defaultPath)) {
      overridePaths.add(defaultPath);
    }

    for (const filePath of overridePaths) {
      if (!existsSync(filePath)) continue;

      try {
        const raw = readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);

        if (Array.isArray(parsed)) {
          parsed.forEach(entry => this.applyOverrideEntry(entry));
        } else if (parsed && typeof parsed === 'object') {
          Object.entries(parsed).forEach(([id, info]) => {
            this.applyOverrideEntry({ id, ...info });
          });
        }
      } catch (error) {
        console.warn(`Failed to load registry overrides from ${filePath}: ${error.message}`);
      }
    }
  }

  applyOverrideEntry(entry) {
    if (!entry || typeof entry !== 'object') return;

    const { id: explicitId, ...rest } = entry;
    const mcpId = typeof explicitId === 'string' && explicitId.trim()
      ? explicitId.trim()
      : typeof rest.id === 'string' && rest.id.trim()
        ? rest.id.trim()
        : null;

    if (!mcpId) return;

    const normalizedInfo = { ...rest };
    delete normalizedInfo.id;

    const existing = this.registry[mcpId] || {};
    this.registry[mcpId] = {
      ...existing,
      ...normalizedInfo
    };

    if (!this.registry[mcpId].name) {
      this.registry[mcpId].name = this.formatNameFromId(mcpId);
    }

    if (!this.registry[mcpId].command && this.registry[mcpId].package) {
      this.registry[mcpId].command = 'npx';
      this.registry[mcpId].args = ['-y', this.registry[mcpId].package];
    }

    this.registry[mcpId].source = normalizedInfo.source || existing.source || 'override';
  }

  formatNameFromId(id) {
    return id
      .split('-')
      .filter(Boolean)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
