#!/usr/bin/env node

import { execSync } from 'child_process';

const composeCmd = process.env.COMPOSE_CMD || 'docker compose';

function run(command) {
  execSync(command, { stdio: 'inherit', shell: true });
}

try {
  run(`${composeCmd} up -d --build`);
  run(`${composeCmd} exec -T router node scripts/router-healthcheck.js`);
  console.log('\n🚀 Smoke test succeeded. Router container is up and connected to the vector DB.');
} catch (error) {
  console.error('\n❌ Smoke test failed. See logs above for details.');
  process.exitCode = 1;
} finally {
  try {
    run(`${composeCmd} down`);
  } catch (cleanupError) {
    console.error('⚠️  Failed to clean up docker compose stack:', cleanupError.message);
  }
}
