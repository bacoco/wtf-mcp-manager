FROM node:20-alpine AS base

WORKDIR /app

# Install production dependencies first to leverage Docker layer caching
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy source files required at runtime
COPY bin ./bin
COPY lib ./lib
COPY scripts ./scripts
COPY registry ./registry
COPY templates ./templates
COPY README.md LICENSE ./

ENV NODE_ENV=production \
    PORT=8080 \
    VECTOR_DB_URL=http://qdrant:6333

EXPOSE 8080

ENTRYPOINT ["node", "lib/mcp-server.js"]
