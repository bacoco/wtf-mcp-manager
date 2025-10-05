/**
 * WTF-MCP-Manager Core
 * Main library for managing MCP configurations
 */

import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import { MCPRegistry } from './registry.js';

export function parseNodeVersion(versionInput = process.versions?.node || process.version) {
  if (typeof versionInput !== 'string') {
    return { major: null, minor: null };
  }

  const normalized = versionInput.trim();
  const match = normalized.match(/^v?(\d+)(?:\.(\d+))?/);

  if (!match) {
    return { major: null, minor: null };
  }

  const major = Number.parseInt(match[1], 10);
  const minor = match[2] !== undefined ? Number.parseInt(match[2], 10) : null;

  if (Number.isNaN(major)) {
    return { major: null, minor: null };
  }

  return {
    major,
    minor: Number.isNaN(minor) ? null : minor
  };
}

export class MCPManager {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.configDir = path.join(projectRoot, '.claude');
    this.configFile = path.join(this.configDir, 'mcp-config.json');
    this.envFile = path.join(this.configDir, '.env');
    this.registry = new MCPRegistry();
    this.config = null;
  }

  async init(options = {}) {
    // Create .claude directory
    await fs.mkdir(this.configDir, { recursive: true });
    
    // Check if config already exists
    if (!options.force) {
      try {
        await fs.access(this.configFile);
        throw new Error('Configuration already exists. Use --force to overwrite.');
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
    }
    
    // Create initial configuration
    this.config = {
      version: '1.0.0',
      project: path.basename(this.projectRoot),
      created: new Date().toISOString(),
      mcpServers: {},
      profiles: {
        default: [],
        dev: [],
        prod: [],
        test: []
      },
      activeProfile: options.profile || 'default',
      settings: {
        autoDetect: true,
        autoUpdate: false,
        lazy: true
      }
    };
    
    await this.save();
    
    // Create .gitignore
    const gitignore = `# Claude MCP Configuration
.env
*.backup
*.log
node_modules/
`;
    await fs.writeFile(path.join(this.configDir, '.gitignore'), gitignore);
    
    return this.config;
  }

  async load() {
    if (this.config) return this.config;
    
    try {
      const data = await fs.readFile(this.configFile, 'utf-8');
      this.config = JSON.parse(data);
      return this.config;
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new Error('No configuration found. Run `wtf-mcp-manager init` first.');
      }
      throw err;
    }
  }

  async save() {
    if (!this.config) throw new Error('No configuration loaded');
    
    // Backup existing config
    try {
      const existing = await fs.readFile(this.configFile, 'utf-8');
      const backupFile = `${this.configFile}.${Date.now()}.backup`;
      await fs.writeFile(backupFile, existing);
    } catch (err) {
      // No existing config, skip backup
    }
    
    // Save configuration
    await fs.writeFile(
      this.configFile,
      JSON.stringify(this.config, null, 2)
    );
  }

  async list(options = {}) {
    await this.load();
    
    const mcps = [];
    const allMCPs = this.registry.getAll();
    
    for (const [id, info] of Object.entries(allMCPs)) {
      const enabled = !!this.config.mcpServers[id];
      
      if (options.enabled && !enabled) continue;
      if (options.available && enabled) continue;
      
      mcps.push({
        id,
        name: info.name,
        description: info.description,
        enabled,
        env: enabled ? this.config.mcpServers[id].env : null,
        categories: info.categories || []
      });
    }
    
    return mcps;
  }

  async enable(mcpId, envVars = {}) {
    await this.load();
    
    const mcpInfo = this.registry.get(mcpId);
    if (!mcpInfo) {
      throw new Error(`Unknown MCP: ${mcpId}. WTF is that?`);
    }
    
    // Check required environment variables
    const missing = (mcpInfo.requiredEnv || []).filter(
      key => !envVars[key] && !process.env[key]
    );
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
    
    // Add to configuration
    this.config.mcpServers[mcpId] = {
      command: mcpInfo.command,
      args: mcpInfo.args,
      env: envVars
    };
    
    // Add to current profile
    const profile = this.config.activeProfile;
    if (!this.config.profiles[profile].includes(mcpId)) {
      this.config.profiles[profile].push(mcpId);
    }
    
    await this.save();
    
    // Save environment variables to .env file
    if (Object.keys(envVars).length > 0) {
      await this.saveEnvVars(mcpId, envVars);
    }
    
    return mcpInfo;
  }

  async disable(mcpId) {
    await this.load();
    
    if (!this.config.mcpServers[mcpId]) {
      throw new Error(`MCP ${mcpId} is not enabled. WTF?`);
    }
    
    // Remove from configuration
    delete this.config.mcpServers[mcpId];
    
    // Remove from all profiles
    for (const profile of Object.keys(this.config.profiles)) {
      this.config.profiles[profile] = this.config.profiles[profile].filter(
        id => id !== mcpId
      );
    }
    
    await this.save();
  }

  async saveEnvVars(mcpId, envVars) {
    let envContent = '';
    
    try {
      envContent = await fs.readFile(this.envFile, 'utf-8');
    } catch (err) {
      // File doesn't exist yet
    }
    
    // Add new variables
    const lines = envContent.split('\n');
    const prefix = `# ${mcpId.toUpperCase()}`;
    
    // Remove old section
    const startIdx = lines.findIndex(line => line === prefix);
    if (startIdx !== -1) {
      let endIdx = startIdx + 1;
      while (endIdx < lines.length && !lines[endIdx].startsWith('#')) {
        endIdx++;
      }
      lines.splice(startIdx, endIdx - startIdx);
    }
    
    // Add new section
    const newLines = [prefix];
    for (const [key, value] of Object.entries(envVars)) {
      newLines.push(`${key}=${value}`);
    }
    newLines.push('');
    
    lines.push(...newLines);
    
    await fs.writeFile(this.envFile, lines.join('\n'));
  }

  async diagnose() {
    const issues = [];
    
    try {
      await this.load();
    } catch (err) {
      issues.push({
        type: 'error',
        message: 'No configuration found',
        fix: 'Run `wtf-mcp-manager init`'
      });
      return issues;
    }
    
    // Check Node.js version
    const nodeVersionRaw = process.versions?.node || process.version;
    const nodeVersionDisplay = process.version || (nodeVersionRaw ? `v${nodeVersionRaw}` : 'unknown');
    const { major } = parseNodeVersion(nodeVersionRaw);

    if (major !== null && major < 18) {
      issues.push({
        type: 'warning',
        message: `Node.js ${nodeVersionDisplay} is outdated`,
        fix: 'Update to Node.js 18 or later'
      });
    }
    
    // Check for missing environment variables
    for (const [mcpId, config] of Object.entries(this.config.mcpServers)) {
      const mcpInfo = this.registry.get(mcpId);
      if (mcpInfo && mcpInfo.requiredEnv) {
        for (const envKey of mcpInfo.requiredEnv) {
          if (!config.env[envKey] && !process.env[envKey]) {
            issues.push({
              type: 'error',
              message: `${mcpId}: Missing ${envKey}`,
              fix: `Set ${envKey} in .claude/.env`
            });
          }
        }
      }
    }
    
    // Check npm/npx availability
    try {
      execSync('npm --version', { stdio: 'ignore' });
    } catch (err) {
      issues.push({
        type: 'error',
        message: 'npm not found',
        fix: 'Install Node.js and npm'
      });
    }
    
    return issues;
  }
}
