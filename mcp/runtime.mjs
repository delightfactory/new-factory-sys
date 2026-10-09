import pg from 'pg';
import { readFileSync } from 'node:fs';
import { readResourceConfig } from './resource.mjs';

export function readConfig(env) {
  const config = readResourceConfig(env);
  if (!config.clientIds.length) throw new Error('MCP_CONFIGURATION_REQUIRED');
  const database = new URL(env.FACTORY_MCP_DATABASE_URL);
  const expectedUser = env.FACTORY_MCP_DATABASE_USER;
  if (!['postgres:', 'postgresql:'].includes(database.protocol) ||
      database.hostname !== env.FACTORY_MCP_DATABASE_HOST ||
      !/^factory_mcp_gateway(?:\.[a-z0-9]+)?$/.test(expectedUser ?? '') ||
      decodeURIComponent(database.username) !== expectedUser || !database.password ||
      database.search || database.hash || database.pathname !== '/postgres')
    throw new Error('MCP_DATABASE_CONFIGURATION_INVALID');
  return {
    config,
    database: {
      host: database.hostname, port: Number(database.port || 5432),
      user: expectedUser, password: decodeURIComponent(database.password), database: 'postgres',
      ssl: { rejectUnauthorized: true,
        ...(env.FACTORY_MCP_DATABASE_CA_FILE ? { ca: readFileSync(env.FACTORY_MCP_DATABASE_CA_FILE, 'utf8') } : {}) },
      max: 1, connectionTimeoutMillis: 5000, idleTimeoutMillis: 5000,
      application_name: 'factory-remote-mcp',
    },
  };
}

export function createDatabasePool(settings) {
  const pool = new pg.Pool(settings);
  pool.on('error', () => {}); // Connection errors can contain credentials.
  return pool;
}
