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

  // Test 8: Auto-create enabling existing MCP
  console.log(chalk.yellow('\n8. Testing auto-create for existing MCP...'));
  try {
    const autoServer = new WTFMCPManagerServer();
    const fakeAPI = {
      type: 'existing-mcp',
      name: 'Supabase',
      package: '@supabase/mcp-server-supabase'
    };

    let enabledId = null;

    autoServer.discovery.discoverAPIs = async () => [fakeAPI];
    autoServer.manager.enable = async (mcpId) => {
      enabledId = mcpId;
      return { id: mcpId };
    };
    autoServer.registry.get = (mcpId) => {
      if (mcpId === 'supabase') {
        return { name: 'Supabase', command: 'npx', args: [] };
      }
      return null;
    };

    const result = await autoServer.discoverOrCreateMCP({
      query: 'supabase',
      autoCreate: true
    });

    if (result.success && enabledId === 'supabase') {
      console.log(chalk.green('✅ Auto-create successfully enabled existing MCP with canonical ID.'));
    } else {
      console.log(chalk.red('❌ Auto-create did not enable the expected MCP ID.'), result);
    }
  } catch (error) {
    console.log(chalk.red('❌ Auto-create existing MCP test failed:'), error.message);
  }

  console.log(chalk.cyan('\n🎯 All tests completed!\n'));
}

// Run tests
runTests().catch(console.error);
