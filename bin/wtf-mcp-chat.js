#!/usr/bin/env node

/**
 * WTF-MCP Interactive Chat
 * Chatbot CLI qui dialogue avec Claude pour découvrir et installer des MCP dynamiquement
 */

import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import readline from 'readline';

class MCPChatbot {
  constructor() {
    this.projectRoot = process.cwd();
    this.configPath = path.join(this.projectRoot, '.claude', 'mcp-config.json');
    this.mcpSourceUrl = 'https://modelcontextprotocol.io/llms-full.txt';
    this.localMCPs = null;
    this.availableMCPs = null;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.cyan('\n🤖 > ')
    });
  }

  async init() {
    console.log(chalk.cyan(`
╔════════════════════════════════════════════════════╗
║                                                    ║
║        🤖 WTF-MCP Interactive Assistant           ║
║        Chat with me to discover and manage MCPs   ║
║                                                    ║
╚════════════════════════════════════════════════════╝
    `));

    // Charger la configuration locale
    await this.loadLocalConfig();
    
    console.log(chalk.yellow('\n💡 How to use:'));
    console.log(chalk.gray('  • Ask me about MCPs: "I need to work with databases"'));
    console.log(chalk.gray('  • List MCPs: "What MCPs are available?"'));
    console.log(chalk.gray('  • Install: "Install supabase MCP"'));
    console.log(chalk.gray('  • Search: "Find MCP for web scraping"'));
    console.log(chalk.gray('  • Type "help" for more commands or "exit" to quit\n'));

    console.log(chalk.green('👋 Hi! I\'m your MCP assistant. What can I help you with?\n'));
  }

  async loadLocalConfig() {
    try {
      const config = await fs.readFile(this.configPath, 'utf-8');
      this.localMCPs = JSON.parse(config).mcpServers || {};
      console.log(chalk.gray(`📦 Found ${Object.keys(this.localMCPs).length} local MCPs configured`));
    } catch {
      this.localMCPs = {};
      console.log(chalk.gray('📦 No local MCPs configured yet'));
    }
  }

  async fetchAvailableMCPs() {
    const spinner = ora('Fetching latest MCP list...').start();
    
    try {
      // Fetch the latest MCP list from the official source
      const response = await fetch(this.mcpSourceUrl);
      const text = await response.text();
      
      // Parse the text to extract MCP information
      this.availableMCPs = this.parseMCPList(text);
      
      spinner.succeed(`Found ${Object.keys(this.availableMCPs).length} available MCPs`);
      return this.availableMCPs;
    } catch (error) {
      spinner.fail('Failed to fetch MCP list');
      console.error(chalk.red('Error:', error.message));
      
      // Fallback to a basic list
      return this.getBasicMCPList();
    }
  }

  parseMCPList(text) {
    const mcps = {};
    
    // Extract MCP servers from the document
    // Look for patterns like @modelcontextprotocol/server-* or mcp-server-*
    const patterns = [
      /@[\w-]+\/[\w-]*mcp[\w-]*/gi,
      /mcp-server-[\w-]+/gi,
      /[\w-]+-mcp-server/gi,
      /@[\w-]+\/server-[\w-]+/gi
    ];
    
    const foundPackages = new Set();
    patterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => foundPackages.add(match));
      }
    });

    // Convert to MCP object format
    foundPackages.forEach(pkg => {
      const name = pkg.split('/').pop().replace(/^(mcp-)?server-/, '');
      mcps[name] = {
        package: pkg,
        name: this.formatName(name),
        description: this.inferDescription(name),
        categories: this.inferCategories(name)
      };
    });

    return mcps;
  }

  formatName(name) {
    return name.split('-').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }

  inferDescription(name) {
    const descriptions = {
      'supabase': 'Database, storage and authentication',
      'github': 'GitHub repositories and issues',
      'slack': 'Slack messaging integration',
      'notion': 'Notion workspace management',
      'postgres': 'PostgreSQL database',
      'sqlite': 'SQLite local database',
      'brave': 'Brave search engine',
      'gdrive': 'Google Drive storage',
      'aws': 'Amazon Web Services',
      'docker': 'Docker container management',
      'linear': 'Linear issue tracking',
      'vercel': 'Vercel deployments',
      'anthropic': 'Anthropic Claude API',
      'openai': 'OpenAI API integration'
    };
    
    for (const [key, desc] of Object.entries(descriptions)) {
      if (name.toLowerCase().includes(key)) {
        return desc;
      }
    }
    
    return `${this.formatName(name)} integration`;
  }

  inferCategories(name) {
    const categoryMap = {
      database: ['postgres', 'sqlite', 'mongodb', 'mysql', 'redis', 'supabase', 'neon'],
      storage: ['s3', 'gdrive', 'dropbox', 'blob', 'supabase'],
      search: ['brave', 'google', 'bing', 'exa', 'tavily'],
      ai: ['openai', 'anthropic', 'huggingface', 'replicate'],
      communication: ['slack', 'discord', 'email', 'telegram'],
      development: ['github', 'gitlab', 'git', 'docker'],
      cloud: ['aws', 'gcp', 'azure', 'vercel', 'netlify'],
      productivity: ['notion', 'obsidian', 'linear', 'jira']
    };
    
    const categories = [];
    for (const [category, keywords] of Object.entries(categoryMap)) {
      if (keywords.some(keyword => name.toLowerCase().includes(keyword))) {
        categories.push(category);
      }
    }
    
    return categories.length > 0 ? categories : ['general'];
  }

  getBasicMCPList() {
    // Fallback list of essential MCPs
    return {
      'supabase': {
        package: '@supabase/mcp-server-supabase',
        name: 'Supabase',
        description: 'Database, storage and authentication',
        categories: ['database', 'storage', 'auth']
      },
      'github': {
        package: '@modelcontextprotocol/server-github',
        name: 'GitHub',
        description: 'GitHub repositories and issues',
        categories: ['development', 'vcs']
      },
      'brave-search': {
        package: '@modelcontextprotocol/server-brave-search',
        name: 'Brave Search',
        description: 'Web search engine',
        categories: ['search', 'web']
      },
      'sqlite': {
        package: '@modelcontextprotocol/server-sqlite',
        name: 'SQLite',
        description: 'Local SQLite database',
        categories: ['database', 'local']
      }
    };
  }

  async processCommand(input) {
    const command = input.trim().toLowerCase();
    
    // Exit commands
    if (['exit', 'quit', 'bye'].includes(command)) {
      console.log(chalk.cyan('\n👋 Goodbye! Happy coding with MCPs!\n'));
      process.exit(0);
    }
    
    // Help command
    if (command === 'help') {
      this.showHelp();
      return;
    }
    
    // List local MCPs
    if (command.includes('list local') || command.includes('show installed')) {
      await this.listLocalMCPs();
      return;
    }
    
    // Intelligent command processing
    if (command.includes('need') || command.includes('want') || command.includes('work with')) {
      await this.suggestMCPs(input);
    } else if (command.includes('install')) {
      await this.installMCP(input);
    } else if (command.includes('available') || command.includes('what mcp')) {
      await this.showAvailableMCPs();
    } else if (command.includes('search') || command.includes('find')) {
      await this.searchMCPs(input);
    } else if (command.includes('remove') || command.includes('uninstall')) {
      await this.removeMCP(input);
    } else {
      // Default: try to understand the intent
      await this.intelligentResponse(input);
    }
  }

  async suggestMCPs(query) {
    console.log(chalk.yellow('\n🔍 Let me find the right MCPs for you...\n'));
    
    if (!this.availableMCPs) {
      await this.fetchAvailableMCPs();
    }
    
    // Keywords extraction
    const keywords = this.extractKeywords(query);
    const suggestions = [];
    
    for (const [id, mcp] of Object.entries(this.availableMCPs)) {
      const score = this.calculateRelevance(mcp, keywords);
      if (score > 0) {
        suggestions.push({ id, ...mcp, score });
      }
    }
    
    // Sort by relevance
    suggestions.sort((a, b) => b.score - a.score);
    const topSuggestions = suggestions.slice(0, 5);
    
    if (topSuggestions.length > 0) {
      console.log(chalk.green('📦 Here are the MCPs that match your needs:\n'));
      
      topSuggestions.forEach((mcp, i) => {
        const installed = this.localMCPs[mcp.id] ? chalk.green(' ✓') : '';
        console.log(`${i + 1}. ${chalk.cyan(mcp.name)}${installed}`);
        console.log(`   ${chalk.gray(mcp.description)}`);
        console.log(`   Package: ${chalk.yellow(mcp.package)}`);
        console.log();
      });
      
      const { action } = await inquirer.prompt([{
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'Install one or more MCPs', value: 'install' },
          { name: 'Get more details', value: 'details' },
          { name: 'Continue chatting', value: 'continue' }
        ]
      }]);
      
      if (action === 'install') {
        const { toInstall } = await inquirer.prompt([{
          type: 'checkbox',
          name: 'toInstall',
          message: 'Select MCPs to install:',
          choices: topSuggestions.map(mcp => ({
            name: mcp.name,
            value: mcp.id,
            checked: false
          }))
        }]);
        
        for (const mcpId of toInstall) {
          await this.installMCPById(mcpId);
        }
      }
    } else {
      console.log(chalk.yellow('🤔 I couldn\'t find specific MCPs for that. Can you be more specific?'));
    }
  }

  extractKeywords(query) {
    const keywords = query.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !this.isStopWord(word));
    
    return keywords;
  }

  isStopWord(word) {
    const stopWords = ['the', 'and', 'for', 'with', 'need', 'want', 'would', 'like', 'help', 'can', 'how', 'what', 'where', 'when', 'work'];
    return stopWords.includes(word);
  }

  calculateRelevance(mcp, keywords) {
    let score = 0;
    
    keywords.forEach(keyword => {
      // Check name
      if (mcp.name.toLowerCase().includes(keyword)) {
        score += 3;
      }
      // Check description
      if (mcp.description.toLowerCase().includes(keyword)) {
        score += 2;
      }
      // Check categories
      if (mcp.categories.some(cat => cat.includes(keyword))) {
        score += 2;
      }
    });
    
    return score;
  }

  async installMCPById(mcpId) {
    const mcp = this.availableMCPs[mcpId];
    if (!mcp) {
      console.log(chalk.red(`MCP ${mcpId} not found`));
      return;
    }
    
    console.log(chalk.cyan(`\n📦 Installing ${mcp.name}...`));
    
    // Check for required environment variables
    const envVars = await this.promptForEnvVars(mcpId);
    
    // Add to config
    if (!this.localMCPs[mcpId]) {
      this.localMCPs[mcpId] = {
        command: 'npx',
        args: ['-y', mcp.package],
        env: envVars
      };
      
      await this.saveConfig();
      console.log(chalk.green(`✅ ${mcp.name} installed successfully!`));
    } else {
      console.log(chalk.yellow(`⚠️  ${mcp.name} is already installed`));
    }
  }

  async promptForEnvVars(mcpId) {
    // Common environment variables by MCP type
    const commonEnvVars = {
      'supabase': ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'],
      'github': ['GITHUB_TOKEN'],
      'openai': ['OPENAI_API_KEY'],
      'anthropic': ['ANTHROPIC_API_KEY'],
      'aws': ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
      'brave-search': ['BRAVE_API_KEY']
    };
    
    const requiredVars = commonEnvVars[mcpId] || [];
    const envVars = {};
    
    if (requiredVars.length > 0) {
      console.log(chalk.yellow('\nThis MCP requires some environment variables:'));
      
      for (const varName of requiredVars) {
        const { value } = await inquirer.prompt([{
          type: 'password',
          name: 'value',
          message: `Enter ${varName} (or press Enter to skip):`,
          mask: '*'
        }]);
        
        if (value) {
          envVars[varName] = value;
        }
      }
    }
    
    return envVars;
  }

  async saveConfig() {
    const config = {
      version: '1.0.0',
      project: path.basename(this.projectRoot),
      mcpServers: this.localMCPs,
      updated: new Date().toISOString()
    };
    
    const configDir = path.dirname(this.configPath);
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
  }

  async intelligentResponse(input) {
    console.log(chalk.cyan('\n🤔 Let me understand what you need...\n'));
    
    // Try to understand the intent
    if (input.includes('database') || input.includes('storage')) {
      await this.suggestMCPs('database storage');
    } else if (input.includes('api') || input.includes('web')) {
      await this.suggestMCPs('api web search scraping');
    } else if (input.includes('code') || input.includes('git')) {
      await this.suggestMCPs('github git development');
    } else {
      console.log(chalk.yellow('I can help you with:'));
      console.log(chalk.gray('  • Finding MCPs for specific tasks'));
      console.log(chalk.gray('  • Installing and configuring MCPs'));
      console.log(chalk.gray('  • Managing your MCP setup'));
      console.log(chalk.gray('\nTry asking: "I need to work with databases" or "Show available MCPs"'));
    }
  }

  async listLocalMCPs() {
    if (Object.keys(this.localMCPs).length === 0) {
      console.log(chalk.yellow('\n📦 No MCPs installed yet'));
      console.log(chalk.gray('Try: "I need to work with databases" to get started'));
    } else {
      console.log(chalk.green('\n📦 Installed MCPs:\n'));
      
      for (const [id, config] of Object.entries(this.localMCPs)) {
        console.log(`• ${chalk.cyan(id)}`);
        if (config.env && Object.keys(config.env).length > 0) {
          console.log(`  ${chalk.gray('Configured: ✓')}`);
        }
      }
    }
  }

  async showAvailableMCPs() {
    if (!this.availableMCPs) {
      await this.fetchAvailableMCPs();
    }
    
    const categories = {};
    for (const [id, mcp] of Object.entries(this.availableMCPs)) {
      mcp.categories.forEach(cat => {
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push({ id, ...mcp });
      });
    }
    
    console.log(chalk.green('\n📦 Available MCPs by category:\n'));
    
    for (const [category, mcps] of Object.entries(categories)) {
      console.log(chalk.cyan(`${category.toUpperCase()}:`));
      mcps.slice(0, 5).forEach(mcp => {
        const installed = this.localMCPs[mcp.id] ? chalk.green(' ✓') : '';
        console.log(`  • ${mcp.name}${installed}`);
      });
      if (mcps.length > 5) {
        console.log(chalk.gray(`  ... and ${mcps.length - 5} more`));
      }
      console.log();
    }
  }

  async searchMCPs(query) {
    if (!this.availableMCPs) {
      await this.fetchAvailableMCPs();
    }
    
    const searchTerm = query.replace(/search|find/gi, '').trim();
    await this.suggestMCPs(searchTerm);
  }

  async removeMCP(input) {
    const mcpName = input.replace(/remove|uninstall/gi, '').trim();
    
    if (this.localMCPs[mcpName]) {
      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: `Remove ${mcpName} MCP?`,
        default: false
      }]);
      
      if (confirm) {
        delete this.localMCPs[mcpName];
        await this.saveConfig();
        console.log(chalk.green(`✅ ${mcpName} removed`));
      }
    } else {
      console.log(chalk.yellow(`MCP ${mcpName} is not installed`));
    }
  }

  showHelp() {
    console.log(chalk.cyan('\n📚 Available commands:\n'));
    console.log(chalk.white('Natural language:'));
    console.log(chalk.gray('  • "I need to work with databases"'));
    console.log(chalk.gray('  • "Find MCP for web scraping"'));
    console.log(chalk.gray('  • "What can help me with GitHub?"'));
    
    console.log(chalk.white('\nDirect commands:'));
    console.log(chalk.gray('  • list local - Show installed MCPs'));
    console.log(chalk.gray('  • install <name> - Install a specific MCP'));
    console.log(chalk.gray('  • remove <name> - Remove an MCP'));
    console.log(chalk.gray('  • help - Show this help'));
    console.log(chalk.gray('  • exit - Quit the chat'));
  }

  async start() {
    await this.init();
    
    this.rl.on('line', async (line) => {
      await this.processCommand(line);
      this.rl.prompt();
    });
    
    this.rl.on('close', () => {
      console.log(chalk.cyan('\n👋 Goodbye!\n'));
      process.exit(0);
    });
    
    this.rl.prompt();
  }
}

// Start the chatbot
const bot = new MCPChatbot();
bot.start().catch(console.error);
