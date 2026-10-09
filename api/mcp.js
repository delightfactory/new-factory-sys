import { createApp } from '../mcp/server.mjs';
import { readConfig, createDatabasePool } from '../mcp/runtime.mjs';

let app;
export default function handler(req, res) {
  try {
    if (!app) {
      const { config, database } = readConfig(process.env);
      app = createApp(config, { pool: createDatabasePool(database) });
    }
    return app(req, res);
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'MCP_CONFIGURATION_REQUIRED' });
  }
}
