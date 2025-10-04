#!/usr/bin/env node

/**
 * Test script for WTF-MCP-Manager Meta Server
 */

import { WTFMCPManagerServer } from '../lib/mcp-server.js';
import chalk from 'chalk';

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

  // Test 8: Auto-create existing MCP flow
  console.log(chalk.yellow('\n8. Testing auto-create with existing MCP...'));
  const originalDiscoverAPIs = server.discovery.discoverAPIs;
  const originalEnable = server.manager.enable;
  try {
    let enabledId = null;
    server.discovery.discoverAPIs = async () => ([{
      type: 'existing-mcp',
      name: '@modelcontextprotocol/server-github',
      package: '@modelcontextprotocol/server-github'
    }]);
    server.manager.enable = async (id) => {
      enabledId = id;
      return { id, name: 'GitHub' };
    };

    const result = await server.discoverOrCreateMCP({ query: 'github', autoCreate: true });

    if (enabledId !== 'github') {
      throw new Error(`Expected enable to be called with "github", received "${enabledId}"`);
    }

    if (!result.success) {
      throw new Error('Expected successful response when enabling existing MCP');
    }

    console.log(chalk.green(`✅ Auto-create enabled MCP: ${enabledId}`));
  } catch (error) {
    console.log(chalk.red('❌ Auto-create existing MCP failed:'), error.message);
  } finally {
    server.discovery.discoverAPIs = originalDiscoverAPIs;
    server.manager.enable = originalEnable;
  }

  console.log(chalk.cyan('\n🎯 All tests completed!\n'));
}

// Run tests
runTests().catch(console.error);
