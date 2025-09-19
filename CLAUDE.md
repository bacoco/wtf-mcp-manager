# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**WTF-MCP-Manager** is a Smart MCP (Model Context Protocol) Manager for Claude that enables per-project MCP configuration. It allows natural language control of MCPs through Claude integration and automatic discovery of required MCPs based on project context.

## Build & Development Commands

- **Build**: `npm run build` (currently just echoes completion)
- **Test**: `npm test` or `node test/test-mcp-server.js` - Tests the MCP server functionality
- **Lint**: `npm run lint` - Runs ESLint on the lib/ directory
- **Install**: `npm install` - Installs dependencies and runs postinstall script

## Core Architecture

### Module Structure
- **ES Modules**: All code uses ES6 module syntax (import/export)
- **Entry Points**:
  - `bin/wtf-mcp.js` - CLI interface with Commander.js
  - `lib/mcp-server.js` - MCP server implementation for Claude integration
  - `lib/index.js` - Library exports

### Key Components

1. **MCPManager** (`lib/manager.js`)
   - Manages project-level MCP configurations in `.claude/` directory
   - Handles init, load, save, enable/disable operations
   - Manages profiles (default, dev, prod, test)
   - Creates backup files before configuration changes

2. **MCPRegistry** (`lib/registry.js`)
   - Central registry of known MCPs with metadata
   - Stores package names, required env vars, auto-detect patterns
   - Supports fallback local registry and dynamic fetching

3. **AutoDetector** (`lib/detector.js`)
   - Scans project for MCP requirements
   - Checks file patterns, package.json dependencies
   - Smart detection based on project structure

4. **WTFMCPManagerServer** (`lib/mcp-server.js`)
   - Real MCP server for Claude integration
   - Analyzes global vs project MCP configurations
   - Provides tools for enabling/disabling MCPs via Claude chat
   - Handles environment variable prompting
   - Can disable global MCPs to resolve conflicts

### Configuration Storage

Project configurations are stored in:
```
.claude/
├── mcp-config.json    # MCP configuration
├── .env               # Environment variables
└── .gitignore         # Security settings
```

## CLI Commands

Main commands accessible via `npx wtf-mcp-manager` or aliases `wtf-mcp`, `claude-mcp`:

- `init [--force] [--profile <name>]` - Initialize project configuration
- `list [--enabled] [--available]` - List MCPs
- `enable <mcp> [--env KEY=value]` - Enable an MCP with optional env vars
- `disable <mcp>` - Disable an MCP
- `detect` - Auto-detect needed MCPs based on project
- `serve` - Start Meta-MCP server for Claude integration
- `global <list|disable> [mcp]` - Manage global Claude MCPs
- `doctor` - Diagnose configuration issues
- `interactive` - Interactive mode with menu

## MCP Server Protocol

When running as an MCP server (`serve` command), the server:
1. Reads from stdin for JSON-RPC requests
2. Handles requests like `analyze_environment`, `fetch_mcps`, `enable_mcp`
3. Returns structured JSON responses
4. Provides tools that Claude can use to manage MCPs conversationally

## Development Notes

- Node.js 18+ required (specified in engines)
- Uses Chalk for colored output, Ora for spinners, Inquirer for prompts
- Environment variables stored in `.claude/.env` (gitignored)
- Backup files created before config modifications
- Global Claude config locations checked across platforms (macOS, Windows, Linux)
- MCP registry can fetch from remote sources with caching (30-minute TTL)