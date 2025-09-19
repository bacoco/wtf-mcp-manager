#!/usr/bin/env node

/**
 * Test dynamic MCP generation
 */

import { DynamicMCPGenerator } from '../lib/dynamic/mcp-generator.js';
import { APIDiscoveryService } from '../lib/discovery/api-discovery.js';
import chalk from 'chalk';

async function testDynamicGeneration() {
  console.log(chalk.cyan('\n🧪 Testing Dynamic MCP Generation System\n'));

  const generator = new DynamicMCPGenerator();
  const discovery = new APIDiscoveryService();

  // Test 1: Initialize generator
  console.log(chalk.yellow('1. Initializing generator...'));
  try {
    await generator.init();
    console.log(chalk.green('✅ Generator initialized'));
  } catch (error) {
    console.log(chalk.red('❌ Generator init failed:'), error.message);
  }

  // Test 2: API Discovery
  console.log(chalk.yellow('\n2. Testing API discovery...'));
  try {
    const apis = await discovery.discoverAPIs('weather');
    console.log(chalk.green(`✅ Found ${apis.length} weather APIs`));
    if (apis.length > 0) {
      console.log(chalk.gray(`   Top result: ${apis[0].name}`));
    }
  } catch (error) {
    console.log(chalk.red('❌ API discovery failed:'), error.message);
  }

  // Test 3: Generate MCP from API spec
  console.log(chalk.yellow('\n3. Testing MCP generation...'));
  try {
    const testAPISpec = {
      name: 'test-weather-api',
      description: 'Test weather API',
      baseUrl: 'https://api.example.com',
      endpoints: [
        {
          path: '/weather',
          method: 'GET',
          description: 'Get current weather',
          parameters: {
            type: 'object',
            properties: {
              city: { type: 'string', description: 'City name' }
            },
            required: ['city']
          }
        },
        {
          path: '/forecast',
          method: 'GET',
          description: 'Get weather forecast',
          parameters: {
            type: 'object',
            properties: {
              city: { type: 'string', description: 'City name' },
              days: { type: 'integer', description: 'Number of days' }
            },
            required: ['city']
          }
        }
      ]
    };

    const config = await generator.generateFromAPI(testAPISpec, {
      id: 'test-weather-mcp'
    });

    console.log(chalk.green('✅ MCP generated successfully'));
    console.log(chalk.gray(`   MCP ID: ${config.id}`));
    console.log(chalk.gray(`   Language: ${config.language}`));
    console.log(chalk.gray(`   Server file: ${config.serverFile}`));
  } catch (error) {
    console.log(chalk.red('❌ MCP generation failed:'), error.message);
  }

  // Test 4: List active MCPs
  console.log(chalk.yellow('\n4. Testing active MCP listing...'));
  try {
    const activeMCPs = await generator.listActiveMCPs();
    console.log(chalk.green(`✅ ${activeMCPs.length} active MCPs`));
    activeMCPs.forEach(mcp => {
      console.log(chalk.gray(`   • ${mcp.name} (port ${mcp.port})`));
    });
  } catch (error) {
    console.log(chalk.red('❌ Active MCP listing failed:'), error.message);
  }

  // Test 5: Template system
  console.log(chalk.yellow('\n5. Testing template system...'));
  try {
    const templates = generator.templates;
    console.log(chalk.green(`✅ ${templates.size} templates loaded`));
    for (const [name, template] of templates) {
      console.log(chalk.gray(`   • ${name} (${template.language})`));
    }
  } catch (error) {
    console.log(chalk.red('❌ Template system failed:'), error.message);
  }

  // Test 6: API specification detection
  console.log(chalk.yellow('\n6. Testing API type detection...'));
  try {
    const apiTypes = [
      { openapi: '3.0.0', expected: 'rest-api' },
      { fastapi: true, expected: 'fastapi' },
      { graphql: true, expected: 'graphql' },
      { websocket: true, expected: 'websocket' },
      { unknown: true, expected: 'rest-api' }
    ];

    let passed = 0;
    for (const test of apiTypes) {
      const detected = generator.detectAPIType(test);
      if (detected === test.expected) {
        passed++;
      }
    }

    console.log(chalk.green(`✅ ${passed}/${apiTypes.length} API types detected correctly`));
  } catch (error) {
    console.log(chalk.red('❌ API type detection failed:'), error.message);
  }

  console.log(chalk.cyan('\n🎯 Dynamic MCP generation tests completed!\n'));
}

// Run tests
testDynamicGeneration().catch(console.error);