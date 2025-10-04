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
npx wtf-mcp-manager ingest --provider memory  # Embed metadata into a vector DB
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

## 📚 Embed MCP knowledge into your vector store

The `ingest` command exports registry entries, discovery metadata, and `mcp-tools.json` definitions into a vector database so your LLM can retrieve rich MCP knowledge.

```bash
npx wtf-mcp-manager ingest \
  --provider chroma \
  --collection mcp_metadata
```

### Required environment variables

The CLI loads credentials from `.claude/.env` (created during `wtf-mcp-manager init`). Set the variables that match your stack:

| Purpose | Variable | Notes |
|---------|----------|-------|
| Vector database selection | `VECTOR_DB_PROVIDER` | `memory`, `chroma`, `qdrant`, or `supabase` |
| Vector DB auth | `VECTOR_DB_API_KEY` | API key/token if required by your provider |
| Vector DB location | `VECTOR_DB_URL` | Base URL for Chroma/Qdrant/Supabase REST endpoint |
| Collection/table | `VECTOR_DB_COLLECTION` | Collection/namespace for Chroma & Qdrant |
| Supabase table | `VECTOR_DB_TABLE` | Table containing `embedding` + metadata columns |
| Embedding provider | `EMBEDDING_PROVIDER` | `mock` (default) or `openai` |
| Embedding endpoint | `EMBEDDING_ENDPOINT` | Override HTTP endpoint (optional) |
| Embedding model | `EMBEDDING_MODEL` | Model identifier (e.g., `text-embedding-3-large`) |
| Embedding API key | `EMBEDDING_API_KEY` | Secret for your embedding provider |

Example `.claude/.env` snippet:

```env
VECTOR_DB_PROVIDER=chroma
VECTOR_DB_URL=http://localhost:8000
VECTOR_DB_COLLECTION=mcp_metadata
EMBEDDING_PROVIDER=openai
EMBEDDING_API_KEY=sk-...
EMBEDDING_MODEL=text-embedding-3-large
```

Run `wtf-mcp-manager ingest` any time you update MCP definitions to sync the knowledge base.

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