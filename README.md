# 🎯 WTF-MCP-Manager: Dynamic MCP Generation Engine for Claude

[![npm version](https://badge.fury.io/js/wtf-mcp-manager.svg)](https://badge.fury.io/js/wtf-mcp-manager)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **Status: v1.1.1 (experimental dynamic generation)**
> The current release ships a heuristic discovery pipeline and a template-based MCP generator. Automated Gorilla discovery, workflow orchestration, and end-to-end testing are still on the roadmap.

## 🤯 What Dynamic Generation Means Today

The `lib/discovery/api-discovery.js` module combines several pragmatic heuristics to propose candidate APIs:

- 🔎 **Curated Database Search** – Queries the local API catalog shipped in `lib/discovery/api-database.js` for quick matches.
- 🌐 **Public Registry Lookups** – Pulls data from APIs.guru and other public indexes when network access is available.
- 🐙 **GitHub Repository Scan** – Hits the GitHub search endpoint for repos whose descriptions mention the requested capability.
- 🧭 **Domain Hints** – Falls back to the hard-coded maritime/weather catalog in `lib/discovery/web-search.js` when web search APIs require keys.

These sources are merged, deduplicated, and scored before being returned to Claude. The Gorilla API endpoint is referenced in code but not yet wired up with authentication or ranking, so Gorilla-powered discovery remains future work.

## 🛠️ Template-Based MCP Generation

`lib/dynamic/mcp-generator.js` renders language-specific templates from `lib/templates/` to build runnable MCP servers on the fly, and `lib/mcp-server.js` exposes that generator through the MCP protocol. Today this means:

- ✨ **Template Rendering** – REST, FastAPI, GraphQL, and WebSocket scaffolds interpolate API metadata into ready-to-run projects.
- 🗂️ **Local File Output** – Generated servers are stored under `.claude/dynamic-mcps/` with simple lifecycle tracking.
- 🧰 **Manual Review Expected** – Generated code focuses on shape and wiring; authentication, pagination, and schema validation still require human tweaks.

### Current Limitations

- 🚫 No Gorilla API integration yet, so discovery relies on local heuristics and public registries.
- ⚙️ No automatic end-to-end verification—the repository’s Node-based smoke test does not exercise generated MCPs.
- 🔄 Multi-MCP workflows, zero-config deployment, and other roadmap items described in earlier drafts have not been implemented.

### Roadmap Highlights

- Integrate Gorilla search once API access is available.
- Expand `web-search.js` beyond maritime/weather shortcuts to real web queries.
- Add automated regression tests for the generator output and live MCP lifecycle.
- Revisit workflow orchestration once the generation pipeline is battle-tested.

---

## 🚀 Get Started in 30 Seconds

```bash
# 1. Add to Claude and chat directly!
# 2. Or start with auto-detection
npx -y wtf-mcp-manager init
```

During `wtf-mcp-manager init`, the auto-enable flow now prompts you for any required secrets and politely skips MCPs when you decline or leave credentials empty. No secrets lying around? No problem.

**That's it.** The chatbot discovers your needs, suggests MCPs, and configures everything.

---

## 🤖 Two Ways to Control MCPs

### 1. 💬 Direct Claude Integration (Recommended)

Add to Claude config, then just talk naturally:

**You**: "I need to work with databases"

**Claude**: Let me find the right MCPs for you...

📦 Here are the MCPs that match your needs:
1. Supabase - Database, storage and authentication
2. PostgreSQL - PostgreSQL database
3. SQLite - Local SQLite database

Would you like me to enable any of these for your project?

### 2. 🛠️ Traditional CLI (When needed)

**For project setup and direct management:**

```bash
npx -y wtf-mcp-manager init                # Initialize project
npx -y wtf-mcp-manager list                # Show all MCPs
npx -y wtf-mcp-manager enable supabase     # Enable specific MCP
npx -y wtf-mcp-manager detect              # Auto-detect MCPs
npx -y wtf-mcp-manager ingest --provider memory  # Embed metadata into a vector DB
npx -y wtf-mcp-manager doctor              # Diagnose issues
```

**But the magic happens when you add it to Claude:**

```json
{
  "mcpServers": {
    "wtf-mcp-manager": {
      "command": "npx",
      "args": ["-y", "wtf-mcp-manager", "serve"]
    }
  }
}
```

**Then just talk to Claude naturally and it will manage everything!**

---

## 🛰 Router & Vector Retrieval Service

The MCP manager now ships with an optional HTTP router that fronts a vector database. The CLI (`wtf-mcp-manager`) and the MCP tools will automatically call this service whenever `MCP_ROUTER_URL` is configured. If the router cannot be reached the manager gracefully falls back to the local search heuristics, so offline usage continues to work.

### Quick start

```bash
# Start the router against a locally running vector DB
npm run router

# Or launch the full stack (router + Qdrant) with Docker
docker compose up --build
```

The router exposes the following endpoints:

| Endpoint | Description |
|----------|-------------|
| `POST /router/query` | Query the vector retriever. Body: `{ query, topK?, filter?, scoreThreshold? }`. |
| `POST /router/upsert` | Ingest or update documents. Body: `{ documents: [{ id, text, metadata, ... }] }`. |
| `POST /router/delete` | Remove vectors by id. Body: `{ ids: string[] }`. |
| `GET /health` | Readiness and vector DB diagnostics. |

When `ROUTER_API_KEY` is set the router requires callers to send the matching value in the `x-api-key` header. The client automatically includes `MCP_ROUTER_API_KEY` (or `ROUTER_API_KEY`) when available.

### Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `ROUTER_PORT` | `3333` | TCP port for the HTTP wrapper. |
| `ROUTER_HOST` | `0.0.0.0` | Bind address for the router. |
| `VECTOR_DB_URL` | `http://localhost:6333` | Qdrant (or compatible) base URL. |
| `VECTOR_DB_COLLECTION` | `wtf-mcp-router` | Collection name for stored MCP vectors. |
| `VECTOR_BOOTSTRAP` | `true` | Seed the vector store from the built-in registry on start. |
| `VECTOR_BOOTSTRAP_FORCE` | `false` | Force a fresh bootstrap even when vectors exist. |
| `ROUTER_API_KEY` | unset | Require `x-api-key` authentication for HTTP requests. |
| `MCP_ROUTER_URL` | unset | CLI and MCP server will use the router when provided. |
| `MCP_ROUTER_API_KEY` | unset | API key sent by clients when calling the router. |

### Docker Compose deployment

The included `docker-compose.yml` spins up the router alongside a Qdrant vector database. The router image is built from the local source (`Dockerfile`) and automatically bootstraps the MCP registry into Qdrant. To launch the stack:

```bash
docker compose up --build
```

Persisted data lives in the `qdrant_data` volume. Override environment variables via a `.env` file (for example to set `ROUTER_API_KEY` or change the exposed ports).

### Security notes

- Always set `ROUTER_API_KEY` (and `MCP_ROUTER_API_KEY` for clients) before exposing the router outside of localhost. The server rejects unauthenticated traffic when the key is present.
- Run Qdrant and the router on a private network or behind a reverse proxy that terminates TLS. The vector DB should never be reachable directly from the public internet.
- Store secrets in `.env` files or secret managers rather than committing them to git. The CLI automatically respects environment variables at runtime.
- Consider restricting Docker network access (`docker compose --profile internal` or a custom network) if you deploy alongside other infrastructure.

### Local profiling

Use the bundled scripts to profile performance hotspots:

```bash
# Generate a V8 CPU profile for the router
npm run profile:router

# Inspect the resulting isolate file
node --prof-process isolate-*.log

# For live debugging, start with the inspector enabled
NODE_OPTIONS="--inspect" npm run router
```

These commands work both on bare metal and inside the Docker container (`docker compose run --service-ports router npm run profile:router`).

---

## ✨ Intelligent Features

### 🧠 Smart MCP Discovery
- **Context-aware**: Understands "databases", "web scraping", "APIs"
- **Project scanning**: Auto-detects tools from your codebase
- **Live MCP registry**: Fetches latest MCPs from official sources
- **Relevance scoring**: Best matches for your needs

### 🎯 Per-Project Configuration
- **No global mess**: Each project gets its own `.claude/` config
- **Environment management**: Secure credential storage
- **Profile support**: dev/prod/test configurations
- **Smart defaults**: Works out of the box

### 🔧 Developer Experience
- **Natural language**: No memorizing commands
- **Interactive prompts**: Guided setup for credentials
- **Auto-completion**: Smart suggestions as you type
- **Error diagnosis**: "WTF is wrong?" diagnostic mode

---

## 📦 Supported MCPs & Auto-Detection

| MCP | Chat Keywords | Auto-detect | Description |
|-----|---------------|-------------|-------------|
| **Supabase** | "database", "auth", "storage" | ✅ `supabase/` | Database & Authentication |
| **GitHub** | "git", "repos", "issues" | ✅ `.git/` | Repository management |
| **Docker** | "containers", "docker" | ✅ `Dockerfile` | Container management |
| **Brave Search** | "search", "web" | ❌ | Web search engine |
| **PostgreSQL** | "postgres", "sql" | ✅ `pg`, `postgresql` | PostgreSQL database |
| **AWS** | "cloud", "aws" | ✅ `.aws/` | Amazon Web Services |
| **Playwright** | "testing", "browser" | ✅ `playwright.config` | Browser automation |
| **Vercel** | "deploy", "hosting" | ✅ `vercel.json` | Deployment platform |

**And 50+ more MCPs discovered dynamically!**

---

## 🎭 Real Examples

### 🌟 NEW: Dynamic MCP Generation

#### Generate from ANY API
```
🤖 > I need cryptocurrency prices

🔍 Discovering crypto APIs...
Found: CoinGecko, Binance, CoinMarketCap

✨ Generating MCP from CoinGecko API...
📦 Created with tools:
- get_price(coin_id, currency)
- get_market_data(coin_id)
- get_trending_coins()

✅ CoinGecko MCP ready to use!
```

#### Convert FastAPI to MCP
```
🤖 > Convert my FastAPI app at /api/app.py to MCP

🔄 Analyzing FastAPI application...
Found 5 endpoints

✨ Generating MCP wrapper...
📦 Created MCP with all your endpoints as tools

✅ Your FastAPI is now an MCP!
```

#### Create Multi-MCP Workflows
```
🤖 > Create workflow to sync GitHub issues to Notion

🔗 Creating workflow with:
- GitHub MCP (fetch issues)
- Notion MCP (create pages)

✨ Workflow created:
1. Fetch new GitHub issues
2. Transform to Notion format
3. Create Notion pages
4. Update GitHub with links

✅ Workflow deployed and running!
```

### 🏗️ "I'm building a full-stack app"
```
🤖 > I'm building a full-stack app with authentication

🔍 Perfect! I found these MCPs for full-stack development:
• Supabase (database + auth)
• GitHub (version control)
• Vercel (deployment)
• Docker (containerization)

🤖 > Install Supabase and GitHub
📦 Installing Supabase...
📝 I need SUPABASE_URL and SUPABASE_SERVICE_KEY
✅ Supabase configured!
✅ GitHub configured!
```

### 🔍 "I need to scrape some websites"
```
🤖 > Find MCP for web scraping

🔍 Here are the best MCPs for web scraping:
• Brave Search (search results)
• Firecrawl (content extraction)
• Playwright (browser automation)

Want to install any of these?
```

### 🚀 "Auto-detect everything"
```
🤖 > Auto-detect my project

🔍 Scanning your project...
Found: package.json, Dockerfile, .git/, supabase/
Suggested: GitHub, Docker, Supabase, Node.js

Install all? [Y/n] y
✅ All MCPs configured! Ready to code!
```

---

## 🛠️ Technical Details

### Project Structure
```
your-project/
├── .claude/
│   ├── mcp-config.json    # MCP configuration
│   ├── .env               # Environment variables
│   └── .gitignore         # Security
└── ...
```

### Sample Configuration
```json
{
  "project": "my-awesome-app",
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase"],
      "env": {
        "SUPABASE_URL": "https://xxx.supabase.co",
        "SUPABASE_SERVICE_KEY": "***"
      }
    }
  }
}
```

---

## 🤝 Advanced Usage

### Command Line Interface
```bash
# CLI commands
npx -y wtf-mcp-manager init                # Initialize project
npx -y wtf-mcp-manager list                # Show all MCPs
npx -y wtf-mcp-manager enable supabase     # Enable specific MCP
npx -y wtf-mcp-manager detect              # Auto-detect MCPs
npx -y wtf-mcp-manager ingest              # Ingest metadata into your vector store
npx -y wtf-mcp-manager doctor              # Diagnose issues

# Interactive mode
npx -y wtf-mcp-manager
```

### Vector Store Ingestion & Embeddings

Use the `ingest` command to collect all MCP metadata from the built-in registry, discovery modules, and tool definitions, then persist it to your vector database for semantic search.

```bash
# Dry run – view a preview without writing
npx -y wtf-mcp-manager ingest --dry-run

# Full ingestion (requires environment variables below)
npx -y wtf-mcp-manager ingest
```

Set the required credentials in `.claude/.env` (loaded automatically when the CLI runs):

| Variable | Description |
|----------|-------------|
| `VECTOR_DB_PROVIDER` | Vector database provider (currently `chroma` is supported). |
| `VECTOR_DB_URL` | Base URL for the vector database REST API. |
| `VECTOR_DB_COLLECTION` | Collection/table name for MCP metadata (defaults to `wtf-mcps`). |
| `VECTOR_DB_API_KEY` | API key or bearer token for the vector database (optional). |
| `EMBEDDING_PROVIDER` | Embedding provider identifier (supports `anthropic`). |
| `ANTHROPIC_API_KEY` | API key used to request embeddings from Anthropic. |
| `ANTHROPIC_EMBEDDING_MODEL` | Override the Anthropic embedding model (defaults to `text-embedding-001`). |

> 💡 These settings live beside your project configuration in `.claude/.env`, keeping secrets out of version control while letting the CLI bootstrap new MCP metadata automatically.

### Integration with Claude
```bash
# Start Meta-MCP server
npx -y wtf-mcp-manager serve

# Add to Claude Desktop config
# Then control MCPs directly in Claude!
```

### Semantic Router & Retrieval

The router module keeps a normalized catalogue of MCP metadata, embeds it, and serves fast semantic retrieval for Claude. Run the dedicated CLI to keep the vector store fresh:

```bash
# Normalize metadata from the registry, local configs, and custom files
npx wtf-mcp-router ingest

# Debug a query against the vector DB
npx wtf-mcp-router retrieve "I need a database API"
```

#### Configuration cheat sheet

| Variable | Description |
| --- | --- |
| `ROUTER_VECTOR_STORE` | `memory` (default), `supabase`, `qdrant`, or `chroma`. |
| `ROUTER_VECTOR_STORE_URL` / `ROUTER_VECTOR_STORE_API_KEY` | Connection details for remote stores. |
| `ROUTER_SUPABASE_TABLE` / `ROUTER_SUPABASE_SCHEMA` / `ROUTER_SUPABASE_MATCH_FN` | Supabase table + RPC function for pgvector search. |
| `ROUTER_QDRANT_COLLECTION` / `ROUTER_QDRANT_TIMEOUT_MS` | Target collection + timeout. |
| `ROUTER_CHROMA_COLLECTION` / `ROUTER_CHROMA_TENANT` / `ROUTER_CHROMA_DATABASE` | Chroma namespace configuration. |
| `ROUTER_EMBEDDING_PROVIDER` | `openai`, `anthropic`, or `local` (hash-based fallback). |
| `ROUTER_EMBEDDING_MODEL` / `ROUTER_EMBEDDING_ENDPOINT` | Override provider defaults. |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Credentials for embedding providers. |
| `ROUTER_REMOTE_REGISTRIES` | Comma-separated registry URLs to ingest (JSON/YAML). |
| `ROUTER_ADDITIONAL_GLOBS` | Glob patterns for local JSON/YAML MCP definitions. |
| `ROUTER_DYNAMIC_CONFIG_DIR` | Relative directory that contains generated MCP manifests (`.claude` by default). |
| `ROUTER_TOP_K` | Default number of matches returned by the retriever. |
| `ROUTER_CACHE_TTL_MS` | Cache lifetime for repeated lookups. |
| `ROUTER_MEMORY_STORE_PATH` | On-disk cache file when using the built-in memory vector store. |
| `ROUTER_AUTO_INGEST` | Set to `true` to ingest automatically when the MCP server boots. |
| `ROUTER_OBSERVABILITY_ENABLED` / `ROUTER_OBSERVABILITY_EMITTER` | Emit router latency + count metrics (defaults to console JSON). |

> ⚠️ Vector store clients are optional dependencies. Install the ones you need, e.g. `npm install openai`, `npm install @supabase/supabase-js`, `npm install @qdrant/js-client-rest`, or `npm install chromadb`.

#### Local Docker Compose profiles

Quick-start infrastructure for local retrieval experiments:

```yaml
# docker-compose.router.yml
services:
  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
    environment:
      QDRANT__SERVICE__GRPC_PORT: 6334
  chroma:
    image: chromadb/chroma:latest
    ports:
      - "8000:8000"
```

Point the router at one of the services:

```bash
ROUTER_VECTOR_STORE=qdrant \
ROUTER_VECTOR_STORE_URL=http://localhost:6333 \
ROUTER_QDRANT_COLLECTION=mcp-router \
npx wtf-mcp-router ingest
```

#### Observability hooks

Enable lightweight JSON metrics during ingestion and retrieval by setting:

```bash
export ROUTER_OBSERVABILITY_ENABLED=true
export ROUTER_OBSERVABILITY_EMITTER=console
```

The MCP server will log per-query latency and hit counts, which can be piped to your tracing or token-tracking pipeline.

---

## 🚨 Troubleshooting

### "WTF is wrong?" Mode
```bash
npx -y wtf-mcp-manager doctor
```

Common issues:
- ❌ **Missing API keys**: Use the chat to configure safely
- ❌ **Wrong Node version**: Requires Node.js 18+
- ❌ **Permission errors**: Check `.claude/` directory permissions
- ❌ **MCP not working**: Run `doctor` for specific diagnostics

---

## 🌟 Why WTF-MCP-Manager Changes Everything

### Before WTF-MCP-Manager 😤
- Manual JSON configuration
- Global MCP chaos
- Google for MCP names
- Environment variable hell
- No project isolation

### After WTF-MCP-Manager 😎
- **"I need databases"** → Done
- **Per-project** everything
- **Auto-discovery** of MCPs
- **Secure** credential management
- **Talk to Claude** to control MCPs

---

## 🧱 Deployment & Operations

### Docker Compose quickstart

```yaml
services:
  wtf-mcp-manager:
    image: node:20
    working_dir: /app
    volumes:
      - ./:/app
      - ./.claude:/app/.claude
    command: ["npx", "-y", "wtf-mcp-manager", "serve"]
    environment:
      # Claude / Anthropic credentials for conversational control
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      # Optional: override or supplement registry metadata
      WTF_MCP_REGISTRY_OVERRIDES: /app/.claude/registry-overrides.json
    ports:
      - "8722:8722"
```

1. Copy the snippet into `docker-compose.yml` inside your project.
2. Run `docker compose up --build` to boot the server with persistent `.claude` state mounted from the host.
3. Update `.claude/mcp-config.json` or use the CLI from inside the container to enable/disable MCPs per environment.【F:lib/manager.js†L10-L118】【F:bin/wtf-mcp.js†L33-L121】

### Environment variables at a glance

| MCP | Required env vars | Source |
|-----|-------------------|--------|
| Supabase | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `.claude/.env`, secret manager | 
| Brave Search | `BRAVE_API_KEY` | `.claude/.env`, secret manager |
| Firecrawl | `FIRECRAWL_API_KEY` | `.claude/.env`, secret manager |
| GitHub | `GITHUB_TOKEN` | `.claude/.env`, secret manager |
| Vercel | `VERCEL_TOKEN` | `.claude/.env`, secret manager |
| AWS | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | `.claude/.env`, secret manager |

The registry also includes Docker, Playwright, Context7, Semgrep, and other MCPs that do not require secrets by default.【F:lib/registry.js†L5-L121】 Keep secrets out of version control—`wtf-mcp-manager` writes them to `.claude/.env` when you supply values through the CLI prompts.【F:lib/manager.js†L128-L213】【F:bin/wtf-mcp.js†L90-L137】

### Extend metadata without touching code

1. Create `.claude/registry-overrides.json` or point `WTF_MCP_REGISTRY_OVERRIDES` at a JSON file containing new MCP definitions.
2. Each JSON entry should include the MCP id and its metadata (name, command, args, required env vars, categories).
3. Restart the server or rerun `wtf-mcp-manager list`—overrides are merged on load, enabling `enable`/`disable` workflows for the new MCPs immediately.【F:lib/registry.js†L1-L121】【F:bin/wtf-mcp.js†L72-L158】

See [docs/router.md](docs/router.md) for architecture diagrams detailing how overrides participate in ingestion and routing.

### Maintenance playbook

| Task | When | How |
|------|------|-----|
| Re-index registry metadata | After registry refreshes or override edits | Run `wtf-mcp-manager fetch --force` then rebuild your embeddings or rerun the vectorizer job.【F:lib/mcp-server.js†L120-L188】 |
| Refresh auto-detection signals | When project structure changes | Execute `wtf-mcp-manager detect` to rescan the repository for MCP hints.【F:bin/wtf-mcp.js†L158-L206】 |
| Monitor relevance metrics | Continuous | Track match scores returned by your vector store and log how often suggested MCPs are accepted; alert when similarity or acceptance rate dips. |
| Tune performance | When latency increases | Adjust caching windows (30-minute TTL) and prewarm embeddings for frequently used MCP families.【F:lib/mcp-server.js†L24-L33】【F:docs/router.md†L17-L70】 |

---

## 🚀 Installation & Publishing

### Use Directly
```bash
# Add to Claude config and talk directly!
```

### Install Globally
```bash
npm install -g wtf-mcp-manager
# Then add to Claude config
```

### Development
```bash
git clone https://github.com/bacoco/wtf-mcp-manager.git
cd wtf-mcp-manager
npm install
npm test
```

#### Containerised local stack

1. Copy `.env.example` to `.env` and update any variables you need.
2. (Optional) If your Qdrant instance requires an API key, save it to `secrets/vector_db_api_key` (this path is mounted as a Docker secret).
3. Start the router and vector database:

   ```bash
   npm run compose:up
   ```

4. Tail logs from the router service:

   ```bash
   npm run compose:logs
   ```

5. Run the smoke test to verify that the router can talk to the vector database:

   ```bash
   npm run compose:test
   ```

6. Tear the stack down when you're done:

   ```bash
   npm run compose:down
   ```

The router container uses the `scripts/healthcheck.js` probe both for Docker health checks and the smoke test. It will fail fast if `VECTOR_DB_URL` is unreachable or the API key secret is misconfigured.

---

## 🎯 The Future is Conversational

**Stop fighting with configuration files.** Start talking to your tools.

**WTF-MCP-Manager** is the first step toward truly conversational development environments. Your IDE understands what you're building and configures itself.

---

## 🧭 Architecture & Ops Docs

- [Router, Retriever & Vector Store Overview](docs/router.md) – Deep dive into query routing, vector search flow, Docker Compose deployment, and maintenance runbooks.

## 📄 License & Credits

**MIT License** - Do whatever you want!

Built with ❤️ for developers who are tired of configuration hell.

- [Anthropic Claude](https://anthropic.com) - For the best AI assistant
- [Model Context Protocol](https://modelcontextprotocol.io) - For the amazing standard
- **You** - For choosing the conversational future

---

**Made with 🤬 and ❤️ because seriously, WTF were we doing before this?**

*The last MCP manager you'll ever need to learn.*