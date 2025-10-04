#!/usr/bin/env node

import 'dotenv/config';
import { readFile } from 'fs/promises';

const DEFAULT_VECTOR_DB_URL = 'http://vector-db:6333';
const VECTOR_DB_HEALTH_PATH = 'healthz';

async function resolveApiKey() {
  if (process.env.VECTOR_DB_API_KEY) {
    return process.env.VECTOR_DB_API_KEY;
  }

  const secretFile = process.env.VECTOR_DB_API_KEY_FILE;
  if (!secretFile) {
    return undefined;
  }

  try {
    const fileContents = await readFile(secretFile, 'utf8');
    const value = fileContents.trim();
    if (value) {
      process.env.VECTOR_DB_API_KEY = value;
      return value;
    }
  } catch (error) {
    console.warn(`⚠️  Unable to read vector DB API key from ${secretFile}: ${error.message}`);
  }
  return undefined;
}

function buildHealthUrl(baseUrl) {
  const normalized = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalized}${VECTOR_DB_HEALTH_PATH}`;
}

async function checkVectorDbConnection() {
  const baseUrl = process.env.VECTOR_DB_URL || DEFAULT_VECTOR_DB_URL;
  const healthUrl = buildHealthUrl(baseUrl);
  const apiKey = await resolveApiKey();

  const headers = {};
  if (apiKey) {
    headers['api-key'] = apiKey;
  }

  const response = await fetch(healthUrl, { headers });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Vector DB health check failed (${response.status}): ${text}`);
  }

  const payload = await response.json().catch(() => ({}));
  console.log('✅ Vector database reachable at', baseUrl, payload);
}

checkVectorDbConnection()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Router failed to connect to vector database:', error.message);
    process.exit(1);
  });
