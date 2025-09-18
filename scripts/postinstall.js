#!/usr/bin/env node

/**
 * Post-install script for WTF-MCP
 * Shows a nice message after installation
 */

import chalk from 'chalk';

console.log(chalk.cyan(`
╔════════════════════════════════════════════════════╗
║                                                    ║
║        🎯 WTF-MCP installed successfully!          ║
║                                                    ║
╚════════════════════════════════════════════════════╝
`));

console.log(chalk.yellow('Quick start:'));
console.log(chalk.gray('  1. Go to your project: cd /your/project'));
console.log(chalk.gray('  2. Initialize: npx wtf-mcp init'));
console.log(chalk.gray('  3. Auto-detect: npx wtf-mcp detect'));
console.log();
console.log(chalk.green('Ready to rock! 🚀'));
console.log();
