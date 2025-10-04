# 🎯 WTF-MCP-Manager: Dynamic MCP Generation Engine for Claude

[![npm version](https://badge.fury.io/js/wtf-mcp-manager.svg)](https://badge.fury.io/js/wtf-mcp-manager)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **🚀 NEW v2.0: Dynamic MCP Generation!** Create MCPs from ANY API on-the-fly. Just tell Claude what you need: "I need weather data" → MCP generated instantly from any weather API!

## 🤯 The Magic: Dynamic MCP Generation

**v2.0 - Generate MCPs from ANY API instantly!**

### ✨ New Capabilities

- 🎯 **Dynamic Generation**: Create MCPs from any API specification
- 🔍 **Intelligent Discovery**: Find APIs using Gorilla API & web scraping
- 🚀 **Zero Config**: Generate and deploy MCPs without writing code
- 🔄 **Multi-MCP Workflows**: Compose multiple MCPs into workflows
- 🧪 **Auto-Testing**: Validate generated MCPs automatically

### 💬 Just Chat Naturally

- **"I need weather data"** → Discovers weather APIs, generates MCP instantly
- **"Connect to my FastAPI app"** → Converts your FastAPI to MCP automatically
- **"Find API for stock prices"** → Discovers and creates stock market MCP
- **"Sync data between services"** → Creates multi-MCP workflow

**One MCP to rule them all - Install once, generate infinite MCPs!**

---

## 🚀 Get Started in 30 Seconds

```bash
# 1. Add to Claude and chat directly!
# 2. Or start with auto-detection
npx wtf-mcp-manager init
```

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
npx wtf-mcp-manager init                # Initialize project
npx wtf-mcp-manager list                # Show all MCPs
npx wtf-mcp-manager enable supabase     # Enable specific MCP
npx wtf-mcp-manager detect              # Auto-detect MCPs
npx wtf-mcp-manager doctor              # Diagnose issues
```

**But the magic happens when you add it to Claude:**

```json
{
  "mcpServers": {
    "wtf-mcp-manager": {
      "command": "npx",
      "args": ["wtf-mcp-manager", "serve"]
    }
  }
}
```

**Then just talk to Claude naturally and it will manage everything!**

---

## 🌐 Router HTTP Service & Docker Deployment

The WTF router now ships with an optional HTTP interface that mirrors the retrieval capabilities of the in-process MCP server. This makes it easy to host the router next to a vector database and let both the CLI and the MCP instance talk to it over HTTP when available.

### API Overview

- **Endpoint:** `POST /router/query`
- **Request body:**
  ```json
  {
    "query": "database tools",
    "limit": 8
  }
  ```
- **Response:**
  ```json
  {
    "results": [
      { "id": "supabase", "name": "Supabase", "score": 12 },
      { "id": "postgresql", "name": "PostgreSQL", "score": 9 }
    ]
  }
  ```

You can test the endpoint with curl once the service is running:

```bash
curl -X POST http://localhost:3000/router/query \
  -H 'content-type: application/json' \
  -d '{"query":"database", "limit":5}'
```

### CLI & MCP Integration

- Set `WTF_MCP_ROUTER_URL` (or `ROUTER_HTTP_URL`) to the base URL of the HTTP service to make the CLI and MCP server prefer HTTP over stdio.
- Fallback is automatic—if the HTTP call fails, the CLI/server falls back to the local registry search logic.
- A new CLI helper command makes manual queries easy:

  ```bash
  npx wtf-mcp-manager router "vector database"
  ```

### Docker & Compose

- `Dockerfile` runs the Node router service (`lib/server/http.js`).
- `docker-compose.yml` launches both the router and a Qdrant vector database:

  ```bash
  docker compose up --build
  ```

- The router service exposes port `3000` by default and depends on `vector-db` (Qdrant) listening on `6333`.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WTF_MCP_ROUTER_URL` | _unset_ | Preferred HTTP endpoint for CLI/MCP clients. |
| `ROUTER_HTTP_PORT` | `3000` | HTTP listen port for the router service. |
| `ROUTER_HTTP_HOST` | `0.0.0.0` | Bind address for the HTTP server. |
| `ROUTER_HTTP_CORS` | `*` | Comma-separated allow list for CORS responses. |
| `ROUTER_VECTOR_URL` | `http://vector-db:6333` | Base URL for the vector database. |
| `ROUTER_VECTOR_COLLECTION` | `wtf-mcp-router` | Qdrant collection name that stores router documents. |
| `ROUTER_TOP_K` | `10` | Default number of results returned for queries. |
| `ROUTER_HTTP_TIMEOUT` | `10000` | Timeout (ms) for vector DB requests. |
| `ROUTER_EMBEDDINGS_URL` | _unset_ | Optional external embeddings endpoint for vector search. |
| `ROUTER_EMBEDDINGS_API_KEY` | _unset_ | API key forwarded to the embeddings endpoint. |
| `ROUTER_EMBEDDINGS_MODEL` | _unset_ | Model hint for the embeddings endpoint. |

### Security Considerations

- Restrict the router and vector database to private networks or VPNs; do not expose them directly to the public internet.
- Configure `ROUTER_HTTP_CORS` and firewalls to allow only trusted origins and IP ranges.
- Store secrets (embedding API keys, etc.) in `.env` or external secret managers—never commit them to git.
- Enable TLS/HTTPS via a reverse proxy when the router is accessed across networks.
- Apply access control to the vector database (Qdrant) and regularly rotate any API keys used for embeddings.

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
npx wtf-mcp-manager init                # Initialize project
npx wtf-mcp-manager list                # Show all MCPs
npx wtf-mcp-manager enable supabase     # Enable specific MCP
npx wtf-mcp-manager detect              # Auto-detect MCPs
npx wtf-mcp-manager doctor              # Diagnose issues

# Interactive mode
npx wtf-mcp-manager
```

### Integration with Claude
```bash
# Start Meta-MCP server
npx wtf-mcp-manager serve

# Add to Claude Desktop config
# Then control MCPs directly in Claude!
```

---

## 🚨 Troubleshooting

### "WTF is wrong?" Mode
```bash
npx wtf-mcp-manager doctor
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

---

## 🎯 The Future is Conversational

**Stop fighting with configuration files.** Start talking to your tools.

**WTF-MCP-Manager** is the first step toward truly conversational development environments. Your IDE understands what you're building and configures itself.

---

## 📄 License & Credits

**MIT License** - Do whatever you want!

Built with ❤️ for developers who are tired of configuration hell.

- [Anthropic Claude](https://anthropic.com) - For the best AI assistant
- [Model Context Protocol](https://modelcontextprotocol.io) - For the amazing standard
- **You** - For choosing the conversational future

---

**Made with 🤬 and ❤️ because seriously, WTF were we doing before this?**

*The last MCP manager you'll ever need to learn.*