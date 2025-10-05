#!/usr/bin/env node

/**
 * Post-install script for WTF-MCP-Manager
 * Shows a nice message after installation
 */

import chalk from 'chalk';

console.log(chalk.cyan(`
╔════════════════════════════════════════════════════╗
║                                                    ║
║        🎯 WTF-MCP-Manager installed successfully!  ║
║                                                    ║
╚════════════════════════════════════════════════════╝
`));

console.log(chalk.yellow('Quick start:'));
console.log(chalk.gray('  1. Add to Claude config: ~/.config/claude/claude_desktop_config.json'));
console.log(chalk.gray('  2. Initialize project: npx -y wtf-mcp-manager init'));
console.log(chalk.gray('  3. Talk to Claude: "What MCPs should I use?"'));
console.log();
console.log(chalk.green('Ready to rock! 🚀'));
console.log();
