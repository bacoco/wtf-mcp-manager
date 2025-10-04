#!/usr/bin/env node

/**
 * WTF-MCP-Manager - What The F*** MCP Manager
 * Smart MCP Manager for Claude
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { MCPManager } from '../lib/manager.js';
import { MCPRegistry } from '../lib/registry.js';
import { AutoDetector } from '../lib/detector.js';
import { collectMCPMetadata, ingestToVectorStore } from '../lib/router/vector-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(await fs.readFile(join(__dirname, '..', 'package.json'), 'utf8'));

const program = new Command();
const manager = new MCPManager();

function loadClaudeEnv() {
  const claudeEnvPath = join(process.cwd(), '.claude', '.env');
  if (existsSync(claudeEnvPath)) {
    dotenv.config({ path: claudeEnvPath });
  }
}

loadClaudeEnv();

// Banner
function showBanner() {
  console.log(chalk.cyan(`
╔════════════════════════════════════════════════════╗
║                                                    ║
║        🎯 WTF-MCP-Manager v${packageJson.version}               ║
║        What The F*** MCP Manager for Claude       ║
║                                                    ║
╚════════════════════════════════════════════════════╝
  `));
}

program
  .name('wtf-mcp-manager')
  .description('Smart MCP Manager for Claude - Enable/disable MCPs per project')
  .version(packageJson.version);

// Init command
program
  .command('init')
  .description('Initialize MCP configuration for current project')
  .option('-f, --force', 'Overwrite existing configuration')
  .option('-p, --profile <profile>', 'Initial profile name', 'default')
  .action(async (options) => {
    showBanner();
    
    const spinner = ora('Initializing WTF-MCP-Manager configuration...').start();
    
    try {
      await manager.init(options);
      spinner.succeed(chalk.green('✅ MCP configuration initialized!'));
      
      // Auto-detect
      const detector = new AutoDetector();
      const detected = await detector.scan();
      
      if (detected.length > 0) {
        console.log(chalk.yellow('\n🔍 WTF! I found these MCPs:'));
        detected.forEach(mcp => {
          console.log(chalk.gray(`   • ${mcp.name} - ${mcp.reason}`));
        });
        
        const { autoEnable } = await inquirer.prompt([{
          type: 'confirm',
          name: 'autoEnable',
          message: 'Want me to enable these bad boys?',
          default: true
        }]);
        
        if (autoEnable) {
          for (const mcp of detected) {
            await manager.enable(mcp.id);
          }
          console.log(chalk.green('✅ MCPs enabled! Let\'s go!'));
        }
      }
      
      console.log(chalk.cyan('\n📝 What to do next:'));
      console.log(chalk.gray('   1. Run `wtf-mcp-manager list` to see all MCPs'));
      console.log(chalk.gray('   2. Run `wtf-mcp-manager enable <mcp>` to add more'));
      console.log(chalk.gray('   3. Run `wtf-mcp-manager serve` for Meta-MCP magic'));
      
    } catch (error) {
      spinner.fail(chalk.red('WTF! Failed: ' + error.message));
      process.exit(1);
    }
  });

// List command
program
  .command('list')
  .alias('ls')
  .description('List all MCPs (What The F*** do I have?)')
  .option('-e, --enabled', 'Show only enabled MCPs')
  .option('-a, --available', 'Show only available MCPs')
  .action(async (options) => {
    const mcps = await manager.list(options);
    
    console.log(chalk.cyan('\n📦 WTF MCP Status:\n'));
    
    for (const mcp of mcps) {
      const status = mcp.enabled ? chalk.green('✅') : chalk.gray('❌');
      const name = mcp.enabled ? chalk.white(mcp.name) : chalk.gray(mcp.name);
      console.log(`${status} ${mcp.id.padEnd(20)} ${name}`);
      if (mcp.enabled && mcp.env) {
        const envVars = Object.keys(mcp.env);
        if (envVars.length > 0) {
          console.log(chalk.gray(`   ENV: ${envVars.join(', ')}`));
        }
      }
    }
    
    console.log(chalk.yellow('\n✅ = Enabled | ❌ = WTF not enabled yet\n'));
  });

// Enable command
program
  .command('enable <mcp>')
  .alias('add')
  .alias('wtf-add')
  .description('Enable an MCP (Add this bad boy!)')
  .option('-e, --env <vars...>', 'Environment variables (KEY=value)')
  .action(async (mcpId, options) => {
    const spinner = ora(`Enabling ${mcpId}... Let's fucking go!`).start();
    
    try {
      const envVars = {};
      if (options.env) {
        options.env.forEach(envVar => {
          const [key, value] = envVar.split('=');
          if (key && value) {
            envVars[key] = value;
          }
        });
      }
      
      const registry = new MCPRegistry();
      const mcpInfo = registry.get(mcpId);
      
      if (mcpInfo && mcpInfo.requiredEnv) {
        const missing = mcpInfo.requiredEnv.filter(key => !envVars[key] && !process.env[key]);
        
        if (missing.length > 0) {
          spinner.stop();
          console.log(chalk.yellow('\n📝 WTF! I need these env vars:'));
          
          const answers = await inquirer.prompt(
            missing.map(key => ({
              type: 'password',
              name: key,
              message: `Enter ${key}:`,
              mask: '*'
            }))
          );
          
          Object.assign(envVars, answers);
        }
      }
      
      await manager.enable(mcpId, envVars);
      spinner.succeed(chalk.green(`✅ ${mcpId} enabled! WTF that was easy!`));
      
    } catch (error) {
      spinner.fail(chalk.red('WTF! Failed: ' + error.message));
      process.exit(1);
    }
  });

// Disable command
program
  .command('disable <mcp>')
  .alias('remove')
  .alias('wtf-remove')
  .description('Disable an MCP (Get rid of this shit!)')
  .action(async (mcpId) => {
    const spinner = ora(`Disabling ${mcpId}... Bye bye!`).start();
    
    try {
      await manager.disable(mcpId);
      spinner.succeed(chalk.green(`✅ ${mcpId} disabled! It's gone!`));
    } catch (error) {
      spinner.fail(chalk.red('WTF! Failed: ' + error.message));
      process.exit(1);
    }
  });

// Auto-detect command
program
  .command('detect')
  .alias('auto')
  .alias('wtf')
  .description('WTF do I need? (Auto-detect MCPs)')
  .action(async () => {
    const spinner = ora('Scanning project... WTF is in here?').start();
    
    const detector = new AutoDetector();
    const detected = await detector.scan();
    
    spinner.stop();
    
    if (detected.length === 0) {
      console.log(chalk.yellow('No MCPs detected. WTF is this, an empty project?'));
      return;
    }
    
    console.log(chalk.cyan('\n🔍 WTF! I found:\n'));
    detected.forEach(mcp => {
      console.log(chalk.green(`✓ ${mcp.name}`));
      console.log(chalk.gray(`  Because: ${mcp.reason}`));
    });
    
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: 'Enable all these MCPs?',
      default: true
    }]);
    
    if (confirm) {
      for (const mcp of detected) {
        await manager.enable(mcp.id);
      }
      console.log(chalk.green('\n✅ All MCPs enabled! WTF, that was quick!'));
    }
  });

// Serve command (Meta-MCP)
program
  .command('serve')
  .alias('meta')
  .description('Start Meta-MCP server (The MCP to rule them all!)')
  .action(async () => {
    // Import and start the actual MCP server
    const { spawn } = await import('child_process');
    const serverPath = join(__dirname, '..', 'lib', 'mcp-server.js');

    // Start the MCP server
    const serverProcess = spawn('node', [serverPath], {
      stdio: ['inherit', 'inherit', 'inherit']
    });

    serverProcess.on('exit', (code) => {
      process.exit(code);
    });

    serverProcess.on('error', (error) => {
      console.error(chalk.red('WTF! Failed to start MCP server:'), error.message);
      process.exit(1);
    });
  });

// Global command - manage global Claude MCPs
program
  .command('global <action> [mcp]')
  .description('Manage global Claude MCPs (list, disable)')
  .action(async (action, mcpId) => {
    const { WTFMCPManagerServer } = await import('../lib/mcp-server.js');
    const server = new WTFMCPManagerServer();

    try {
      if (action === 'list') {
        const analysis = await server.analyzeMCPEnvironment();
        console.log(chalk.cyan('\n📦 Global MCPs in Claude:\n'));

        if (analysis.global.mcps.length === 0) {
          console.log(chalk.gray('No global MCPs configured'));
        } else {
          analysis.global.mcps.forEach(mcp => {
            console.log(`  • ${chalk.cyan(mcp)}`);
          });
        }

        console.log(chalk.gray(`\nConfig: ${analysis.global.configPath}`));
      } else if (action === 'disable' && mcpId) {
        const spinner = ora(`Disabling global MCP: ${mcpId}...`).start();

        try {
          const result = await server.disableGlobalMCP(mcpId);
          spinner.succeed(chalk.green(`✅ ${result.message}`));
          console.log(chalk.yellow(`\n⚠️  ${result.action}`));
          console.log(chalk.gray(`\nRemaining global MCPs: ${result.remainingMCPs.join(', ')}`));
        } catch (error) {
          spinner.fail(chalk.red(`Failed: ${error.message}`));
        }
      } else {
        console.log(chalk.yellow('Usage: wtf-mcp-manager global <list|disable> [mcp-name]'));
        console.log(chalk.gray('  list    - Show all global MCPs'));
        console.log(chalk.gray('  disable - Remove a global MCP'));
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

// Doctor command
program
  .command('doctor')
  .alias('wtf-wrong')
  .description('WTF is wrong? (Check configuration)')
  .action(async () => {
    console.log(chalk.cyan('\n🏥 Running diagnostics... WTF is going on?\n'));

    const issues = await manager.diagnose();

    if (issues.length === 0) {
      console.log(chalk.green('✅ Everything is fucking perfect!'));
    } else {
      console.log(chalk.yellow('⚠️  Found some shit to fix:\n'));
      issues.forEach(issue => {
        console.log(chalk.red(`  • ${issue.message}`));
        if (issue.fix) {
          console.log(chalk.gray(`    Fix: ${issue.fix}`));
        }
      });
    }
  });

program
  .command('ingest')
  .description('Aggregate MCP metadata and push it into the configured vector store')
  .option('--dry-run', 'Collect metadata and show a preview without writing to the vector store', false)
  .action(async (options) => {
    showBanner();
    const spinner = ora('Collecting MCP metadata...').start();
    let ingestSpinner;

    try {
      const records = await collectMCPMetadata();
      spinner.succeed(chalk.green(`Collected ${records.length} MCP metadata records.`));

      if (options.dryRun) {
        console.log(chalk.cyan('\n🧪 Dry run preview (first 3 records):\n'));
        records.slice(0, 3).forEach(record => {
          console.log(chalk.yellow(`• ${record.name}`));
          console.log(chalk.gray(`  Source: ${record.source}`));
          if (record.description) {
            console.log(chalk.gray(`  Description: ${record.description}`));
          }
          console.log('');
        });
        return;
      }

      ingestSpinner = ora('Writing embeddings to the vector store...').start();
      const result = await ingestToVectorStore();
      ingestSpinner.succeed(chalk.green(`Ingested ${result.count} records into ${result.provider} (${result.collection}).`));
    } catch (error) {
      if (ingestSpinner) {
        ingestSpinner.fail(chalk.red(`Failed to write to vector store: ${error.message}`));
      } else {
        spinner.fail(chalk.red(`Failed to ingest metadata: ${error.message}`));
      }
      process.exit(1);
    }
  });

// Removed chat command - use Claude integration instead

// Interactive mode (default)
program
  .command('interactive')
  .alias('i')
  .description('Interactive WTF mode')
  .action(async () => {
    showBanner();
    
    while (true) {
      const { action } = await inquirer.prompt([{
        type: 'list',
        name: 'action',
        message: 'WTF do you want to do?',
        choices: [
          { name: '📋 List MCPs', value: 'list' },
          { name: '➕ Enable MCP', value: 'enable' },
          { name: '➖ Disable MCP', value: 'disable' },
          { name: '🔍 WTF do I need? (auto-detect)', value: 'detect' },
          { name: '🏥 WTF is wrong? (doctor)', value: 'doctor' },
          { name: '❌ Get me out of here!', value: 'exit' }
        ]
      }]);
      
      if (action === 'exit') {
        console.log(chalk.cyan('\n👋 Later! Happy coding with Claude!\n'));
        break;
      }
      
      switch (action) {
        case 'list':
          await program.parseAsync(['node', 'wtf-mcp-manager', 'list']);
          break;
        case 'detect':
          await program.parseAsync(['node', 'wtf-mcp-manager', 'detect']);
          break;
        case 'doctor':
          await program.parseAsync(['node', 'wtf-mcp-manager', 'doctor']);
          break;
        case 'enable':
          const { mcpToEnable } = await inquirer.prompt([{
            type: 'input',
            name: 'mcpToEnable',
            message: 'Which MCP to enable?'
          }]);
          if (mcpToEnable) {
            await program.parseAsync(['node', 'wtf-mcp-manager', 'enable', mcpToEnable]);
          }
          break;
        case 'disable':
          const { mcpToDisable } = await inquirer.prompt([{
            type: 'input',
            name: 'mcpToDisable',
            message: 'Which MCP to disable?'
          }]);
          if (mcpToDisable) {
            await program.parseAsync(['node', 'wtf-mcp-manager', 'disable', mcpToDisable]);
          }
          break;
      }
      
      console.log(''); // Empty line
    }
  });

// Parse arguments
program.parse(process.argv);

// If no command, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
  console.log(chalk.yellow('\n💡 Tip: Run `wtf-mcp-manager init` to get started!\n'));
}
