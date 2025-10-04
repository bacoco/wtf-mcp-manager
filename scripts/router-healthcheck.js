#!/usr/bin/env node

import 'dotenv/config';
import fetch from 'node-fetch';

const vectorDbUrl = process.env.VECTOR_DB_URL || 'http://qdrant:6333';

async function checkVectorDb() {
  const healthUrl = new URL('/healthz', vectorDbUrl).toString();
  const response = await fetch(healthUrl);

  if (!response.ok) {
    throw new Error(`Vector DB health endpoint returned ${response.status}`);
  }

  const payload = await response.json().catch(() => ({}));
  if (payload.status && payload.status !== 'ok') {
    throw new Error(`Vector DB responded with status "${payload.status}"`);
  }

  console.log(`✅ Vector DB reachable at ${healthUrl}`);
}

async function main() {
  try {
    await checkVectorDb();
    console.log('✅ Router health check passed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Router health check failed:', error.message);
    process.exit(1);
  }
}

main();
