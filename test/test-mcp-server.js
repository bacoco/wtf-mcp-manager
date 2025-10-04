#!/usr/bin/env node

/**
 * Test script for WTF-MCP-Manager Meta Server
 */

import { WTFMCPManagerServer } from '../lib/mcp-server.js';
import chalk from 'chalk';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import assert from 'assert/strict';

async function runTests() {
  console.log(chalk.cyan('\n🧪 Testing WTF-MCP-Manager Meta Server\n'));

  const server = new WTFMCPManagerServer();

  // Test 1: Environment Analysis
  console.log(chalk.yellow('1. Testing environment analysis...'));
  try {
    const analysis = await server.handleRequest('analyze_environment');
    console.log(chalk.green('✅ Environment analysis:'));
    console.log(`   Global MCPs: ${analysis.global.mcps.length}`);
    console.log(`   Project MCPs: ${analysis.project.mcps.length}`);
    console.log(`   Conflicts: ${analysis.conflicts.length}`);
    console.log(`   Recommendations: ${analysis.recommendations.length}`);
  } catch (error) {
    console.log(chalk.red('❌ Environment analysis failed:'), error.message);
  }

  // Test 2: Fetch Available MCPs
  console.log(chalk.yellow('\n2. Testing MCP registry fetch...'));
  try {
    const result = await server.handleRequest('fetch_mcps');
    console.log(chalk.green('✅ MCP registry fetch:'));
    console.log(`   Count: ${result.count || Object.keys(result.mcps).length}`);
    console.log(`   Cached: ${result.cached}`);
    console.log(`   Last fetch: ${result.lastFetch}`);
    if (result.fallback) {
      console.log(chalk.yellow('   ⚠️  Using fallback registry'));
    }
  } catch (error) {
    console.log(chalk.red('❌ MCP fetch failed:'), error.message);
  }

  // Test 3: Auto-detection
  console.log(chalk.yellow('\n3. Testing auto-detection...'));
  try {
    const detected = await server.handleRequest('auto_detect');
    console.log(chalk.green('✅ Auto-detection:'));
    console.log(`   Detected MCPs: ${detected.length}`);
    detected.forEach(mcp => {
      console.log(`   • ${mcp.name} - ${mcp.reason}`);
    });
  } catch (error) {
    console.log(chalk.red('❌ Auto-detection failed:'), error.message);
  }

  // Test 4: Search MCPs
  console.log(chalk.yellow('\n4. Testing MCP search...'));
  try {
    const searchResults = await server.handleRequest('search_mcps', { query: 'database' });
    console.log(chalk.green('✅ MCP search for "database":'));
    searchResults.slice(0, 3).forEach(mcp => {
      console.log(`   • ${mcp.name} (score: ${mcp.score})`);
    });
  } catch (error) {
    console.log(chalk.red('❌ MCP search failed:'), error.message);
  }

  // Test 5: Suggest MCPs
  console.log(chalk.yellow('\n5. Testing MCP suggestions...'));
  try {
    const suggestions = await server.handleRequest('suggest_mcps', {
      requirements: 'I need to work with databases and APIs'
    });
    console.log(chalk.green('✅ MCP suggestions:'));
    console.log(`   Requirements-based: ${suggestions.based_on_requirements.length}`);
    console.log(`   Auto-detected: ${suggestions.auto_detected.length}`);
    console.log(`   Recommendations: ${suggestions.recommendations.length}`);
  } catch (error) {
    console.log(chalk.red('❌ MCP suggestions failed:'), error.message);
  }

  // Test 6: List MCPs
  console.log(chalk.yellow('\n6. Testing MCP listing...'));
  try {
    const mcps = await server.handleRequest('list_mcps');
    console.log(chalk.green('✅ MCP listing:'));
    console.log(`   Total MCPs: ${mcps.length}`);
    const enabled = mcps.filter(m => m.enabled);
    console.log(`   Enabled: ${enabled.length}`);
  } catch (error) {
    console.log(chalk.red('❌ MCP listing failed:'), error.message);
  }

  // Test 7b: List dynamic MCPs
  console.log(chalk.yellow('\n7b. Testing dynamic MCP listing...'));
  try {
    const { active, available, total } = await server.handleRequest('list_dynamic_mcps');
    if (!Array.isArray(active) || !Array.isArray(available) || typeof total !== 'number') {
      throw new Error('Unexpected response structure');
    }
    console.log(chalk.green('✅ Dynamic MCP listing:'));
    console.log(`   Active: ${active.length}`);
    console.log(`   Available: ${available.length}`);
    console.log(`   Total: ${total}`);
  } catch (error) {
    console.log(chalk.red('❌ Dynamic MCP listing failed:'), error.message);
  }

  // Test 7: Diagnostics
  console.log(chalk.yellow('\n7. Testing diagnostics...'));
  try {
    const issues = await server.handleRequest('diagnose');
    console.log(chalk.green('✅ Diagnostics:'));
    console.log(`   Issues found: ${issues.length}`);
    issues.forEach(issue => {
      const color = issue.type === 'error' ? chalk.red : chalk.yellow;
      console.log(color(`   • ${issue.message}`));
    });
  } catch (error) {
    console.log(chalk.red('❌ Diagnostics failed:'), error.message);
  }

  // Test 8: List Dynamic MCPs
  console.log(chalk.yellow('\n8. Testing dynamic MCP listing...'));
  const originalBaseDir = server.generator.baseDir;
  const tempBaseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wtf-dynamic-mcps-'));

  try {
    server.generator.baseDir = tempBaseDir;
    server.generator.activeMCPs.set('active-mcp', {
      config: { name: 'Active MCP', type: 'dynamic', port: 1234 },
      process: { pid: 4321, kill: () => {} },
      startTime: new Date(Date.now() - 1000)
    });

    const availableDir = path.join(tempBaseDir, 'available-mcp');
    await fs.mkdir(availableDir, { recursive: true });
    await fs.writeFile(path.join(availableDir, 'config.json'), JSON.stringify({
      id: 'available-mcp',
      name: 'Available MCP',
      description: 'Test dynamic MCP'
    }));

    const result = await server.handleRequest('list_dynamic_mcps');

    assert.ok(Array.isArray(result.active), 'Active MCPs should be an array');
    assert.ok(Array.isArray(result.available), 'Available MCPs should be an array');
    assert.strictEqual(result.total, result.active.length + result.available.length, 'Total should match counts');

    const activeIds = result.active.map(mcp => mcp.id);
    assert.ok(activeIds.includes('active-mcp'), 'Active MCPs should include the mocked entry');

    const availableIds = result.available.map(mcp => mcp.id);
    assert.ok(availableIds.includes('available-mcp'), 'Available MCPs should include the mocked directory');

    const availableEntry = result.available.find(mcp => mcp.id === 'available-mcp');
    assert.strictEqual(availableEntry.status, 'stopped', 'Available MCP should be marked as stopped');

    console.log(chalk.green('✅ Dynamic MCP listing passed.'));
  } catch (error) {
    console.log(chalk.red('❌ Dynamic MCP listing failed:'), error.message);
  } finally {
    server.generator.baseDir = originalBaseDir;
    server.generator.activeMCPs.clear();
    await fs.rm(tempBaseDir, { recursive: true, force: true });
  }

  console.log(chalk.cyan('\n🎯 All tests completed!\n'));
}

// Run tests
runTests().catch(console.error);
