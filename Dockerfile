# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
WORKDIR /app

# Install production dependencies first for better caching
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY bin ./bin
COPY lib ./lib
COPY scripts ./scripts
COPY docs ./docs
COPY mcp-tools.json ./mcp-tools.json

# Ensure CLI entrypoint is executable
RUN chmod +x bin/wtf-mcp.js

ENV NODE_ENV=production

# The meta MCP server acts as the router
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD ["node", "scripts/healthcheck.js"]

CMD ["node", "lib/mcp-server.js"]
