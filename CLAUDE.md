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
- `wtf-mcp-router ingest` - Normalize metadata and upsert embeddings into the router vector store
- `wtf-mcp-router retrieve <query>` - Debug semantic routing responses locally

### Router configuration quick reference

- **Vector store selection**: `ROUTER_VECTOR_STORE` supports `memory` (default), `supabase`, `qdrant`, and `chroma`. Provide connection parameters via `ROUTER_VECTOR_STORE_URL` / `ROUTER_VECTOR_STORE_API_KEY`, or Supabase/Qdrant/Chroma specific variables (`ROUTER_SUPABASE_TABLE`, `ROUTER_QDRANT_COLLECTION`, `ROUTER_CHROMA_COLLECTION`, etc.).
- **Embeddings**: Set `ROUTER_EMBEDDING_PROVIDER` to `openai`, `anthropic`, or `local`. Supply credentials (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) and optional overrides (`ROUTER_EMBEDDING_MODEL`, `ROUTER_EMBEDDING_ENDPOINT`).
- **Metadata sources**: Add remote registries with `ROUTER_REMOTE_REGISTRIES`, load custom JSON/YAML via `ROUTER_ADDITIONAL_GLOBS`, and point at generated MCP manifests with `ROUTER_DYNAMIC_CONFIG_DIR`.
- **Performance**: Tweak `ROUTER_TOP_K`, `ROUTER_CACHE_TTL_MS`, `ROUTER_MEMORY_STORE_PATH`, and enable auto-ingestion on boot using `ROUTER_AUTO_INGEST=true`.
- **Observability**: Enable router telemetry with `ROUTER_OBSERVABILITY_ENABLED=true` (defaults to console JSON payloads, configurable via `ROUTER_OBSERVABILITY_EMITTER`).

> Optional packages: install the clients you need per backend (`npm install openai`, `npm install @supabase/supabase-js`, `npm install @qdrant/js-client-rest`, `npm install chromadb`).

### Local Docker Compose profiles

For local experimentation, spin up vector stores quickly:

```yaml
# docker-compose.router.yml
services:
  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
  chroma:
    image: chromadb/chroma:latest
    ports:
      - "8000:8000"
```

Point the router at the desired service:

```bash
ROUTER_VECTOR_STORE=qdrant \
ROUTER_VECTOR_STORE_URL=http://localhost:6333 \
ROUTER_QDRANT_COLLECTION=mcp-router \
npx wtf-mcp-router ingest
```

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