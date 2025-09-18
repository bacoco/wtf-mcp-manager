# 🎯 WTF-MCP

[![npm version](https://badge.fury.io/js/wtf-mcp.svg)](https://badge.fury.io/js/wtf-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> What The F*** MCP Manager - Smart MCP (Model Context Protocol) manager for Claude. Enable/disable MCPs per project, not globally!

## WTF is this?

Tired of Claude having ALL your MCPs enabled globally? Want different tools for different projects? **WTF-MCP** solves this shit!

## ✨ Features

- 🎯 **Per-project MCP configuration** - Each project gets its own MCPs
- 🔍 **Auto-detection** - WTF do I need? Auto-detects Supabase, Docker, GitHub, etc.
- 🤬 **Simple AF** - One command and you're done
- 🤖 **Meta-MCP Server** - Control MCPs directly from Claude
- 📦 **Smart profiles** - dev/prod/test configurations
- 🏥 **Doctor mode** - WTF is wrong? Diagnose issues instantly

## 🚀 Quick Start

```bash
# Just run this shit
npx wtf-mcp init

# Or if you prefer
npm install -g wtf-mcp
wtf-mcp init
```

## 📖 Usage

### Initialize in your project

```bash
cd /your/project
npx wtf-mcp init
```

This creates a `.claude/` directory with your MCP configuration. No more global mess!

### Basic Commands

```bash
# WTF do I have?
npx wtf-mcp list

# Enable some MCP
npx wtf-mcp enable supabase

# WTF do I need? (auto-detect)
npx wtf-mcp detect

# WTF is wrong?
npx wtf-mcp doctor
```

### Interactive Mode

Don't remember commands? No problem:

```bash
npx wtf-mcp
# Interactive menu appears - pick what you want!
```

## 🤖 Meta-MCP Server (The Cool Shit)

Start a Meta-MCP that lets you control other MCPs directly from Claude:

1. Start the server:
```bash
npx wtf-mcp serve
```

2. Add to your Claude config:
```json
{
  "mcpServers": {
    "wtf-mcp": {
      "command": "npx",
      "args": ["wtf-mcp", "serve"]
    }
  }
}
```

3. In Claude, just say:
- "WTF MCPs are available?"
- "Enable that Supabase MCP"
- "Disable all MCPs except search"
- "Auto-detect my project MCPs"

## 📦 Supported MCPs

| MCP | Auto-detect | WTF it does |
|-----|-------------|-------------|
| `supabase` | ✅ | Database & Storage |
| `github` | ✅ | Git stuff |
| `docker` | ✅ | Container management |
| `playwright` | ✅ | Browser automation |
| `brave-search` | ❌ | Web search |
| `firecrawl` | ❌ | Web scraping |
| `vercel` | ✅ | Deployment |
| `aws` | ✅ | Cloud stuff |
| `shadcn-ui` | ✅ | UI components |

## 🎭 Examples

### Example: Supabase Project

```bash
cd ~/my-supabase-app
npx wtf-mcp init
npx wtf-mcp detect
# Auto-detects: supabase, github
# Prompts for SUPABASE_URL and keys
```

### Example: Full-Stack Project

```bash
cd ~/my-fullstack-app
npx wtf-mcp detect
# Finds: docker, playwright, github, vercel
# Enable all? Hell yes!
```

## 🏥 Troubleshooting

Something fucked up? Run the doctor:

```bash
npx wtf-mcp doctor
# Shows you exactly WTF is wrong and how to fix it
```

## 🔧 Configuration

Your config lives in `.claude/mcp-config.json`:

```json
{
  "project": "my-badass-app",
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase@latest"],
      "env": {
        "SUPABASE_URL": "https://xxx.supabase.co",
        "SUPABASE_SERVICE_KEY": "***"
      }
    }
  }
}
```

## 🤝 Contributing

Found a bug? Want to add some cool shit? PRs welcome!

```bash
git clone https://github.com/loic/wtf-mcp.git
cd wtf-mcp
npm install
# Make your changes
npm test
```

## 📄 License

MIT - Do whatever the fuck you want with it!

## 🙏 Credits

- [Anthropic](https://anthropic.com) for Claude and MCP
- All the awesome MCP server authors
- You, for using this shit

---

## Why WTF-MCP?

### The Problem 😤
- Claude's default MCP config is **GLOBAL** (WTF?)
- Every project gets ALL MCPs (messy AF)
- Manual configuration sucks
- No easy way to manage per project

### The Solution 😎
- ✅ **Per-project** configs (finally!)
- ✅ **Auto-detection** (smart AF)
- ✅ **Meta-MCP** control from Claude
- ✅ **One command** to rule them all

## Real Talk

Look, managing MCPs shouldn't be this hard. You want Supabase for your Supabase project, Docker for your Docker project, not everything everywhere all at once. WTF-MCP fixes this shit.

Install it, run it, forget about it. It just works.

---

**Made with 🤬 and ❤️ for developers who are tired of configuration hell**

*PS: Yes, the name is intentional. Because seriously, WTF were we doing before this?*
