#!/usr/bin/env node

import assert from 'assert/strict';
import chalk from 'chalk';

import { ToolRetriever } from '../lib/router/retriever.js';
import { MCPRegistry } from '../lib/registry.js';

async function runRetrieverTests() {
  console.log(chalk.cyan('\n🧪 Testing ToolRetriever integration\n'));

  const registry = new MCPRegistry();
  const retriever = new ToolRetriever();
  retriever.setDocuments(registry.getAll());

  console.log(chalk.yellow('1. Matching database tools for semantic query...'));
  const databaseResults = await retriever.retrieve('manage PostgreSQL databases and authentication', { topK: 5 });
  assert(databaseResults.some(result => result.id === 'supabase'), 'Expected Supabase to appear for database queries');
  console.log(chalk.green('   ✅ Supabase surfaced for database query'));

  console.log(chalk.yellow('2. Matching security analysis tools...'));
  const securityResults = await retriever.retrieve('scan code for vulnerabilities and security issues', { topK: 5 });
  assert(securityResults.some(result => result.id === 'semgrep'), 'Expected Semgrep to appear for security queries');
  console.log(chalk.green('   ✅ Semgrep surfaced for security query'));

  console.log(chalk.yellow('3. Matching browser automation tools...'));
  const browserResults = await retriever.retrieve('control a headless browser to run tests', { topK: 5 });
  assert(browserResults.some(result => result.id === 'playwright'), 'Expected Playwright to appear for browser automation queries');
  console.log(chalk.green('   ✅ Playwright surfaced for browser automation query'));

  console.log(chalk.cyan('\n🎯 ToolRetriever integration tests completed successfully!\n'));
}

runRetrieverTests().catch(error => {
  console.error(chalk.red('❌ ToolRetriever integration tests failed'), error);
  process.exitCode = 1;
});
