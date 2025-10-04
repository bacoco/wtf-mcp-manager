#!/usr/bin/env node
import { Command } from 'commander';
import dotenv from 'dotenv';
import { MCPRouterService, RouterConfig } from '../lib/router/index.js';

dotenv.config();

const program = new Command();
program
  .name('wtf-mcp-router')
  .description('Metadata router utilities for MCP Manager');

program
  .command('ingest')
  .description('Normalize MCP metadata and upsert embeddings into the configured vector store')
  .option('--skip-remote', 'Skip loading remote registries')
  .option('--top-k <number>', 'Override top-k configuration during ingestion preview')
  .action(async (options) => {
    const config = new RouterConfig();
    if (options.topK) {
      config.defaultTopK = Number(options.topK);
    }

    if (options.skipRemote) {
      config.remoteRegistries = [];
    }

    const service = new MCPRouterService({ config });

    try {
      const result = await service.ingest(options);
      console.log(JSON.stringify({
        status: 'ok',
        vectorStore: config.vectorStore,
        embeddingProvider: config.embeddingProvider,
        count: result.count,
        sources: result.sources
      }, null, 2));
      process.exit(0);
    } catch (error) {
      console.error('Router ingestion failed:', error.message);
      process.exit(1);
    }
  });

program
  .command('retrieve <query>')
  .description('Execute an ad-hoc retrieval against the router vector store for debugging')
  .option('--top-k <number>', 'Number of matches to return')
  .action(async (query, options) => {
    const config = new RouterConfig();
    if (options.topK) {
      config.defaultTopK = Number(options.topK);
    }

    const service = new MCPRouterService({ config });

    try {
      const { results } = await service.retrieve(query, { topK: config.defaultTopK });
      console.log(JSON.stringify({
        status: 'ok',
        count: results.length,
        results
      }, null, 2));
      process.exit(0);
    } catch (error) {
      console.error('Router retrieval failed:', error.message);
      process.exit(1);
    }
  });

program.parseAsync(process.argv);
