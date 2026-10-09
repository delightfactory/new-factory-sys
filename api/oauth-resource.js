import { readResourceConfig, resourceMetadata } from '../mcp/resource.mjs';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).setHeader('Allow', 'GET').end();
  try { return res.status(200).json(resourceMetadata(readResourceConfig(process.env))); }
  catch { return res.status(503).json({ error: 'MCP_CONFIGURATION_REQUIRED' }); }
}
