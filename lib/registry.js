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
        args: ['@playwright/mcp@latest'],
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
        args: ['@modelcontextprotocol/server-sequential-thinking'],
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
}
