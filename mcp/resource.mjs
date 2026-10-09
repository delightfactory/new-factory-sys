export function readResourceConfig(env) {
  const resource = new URL(env.FACTORY_MCP_RESOURCE);
  const issuer = new URL(env.FACTORY_MCP_ISSUER);
  const app = new URL(env.FACTORY_APP_ORIGIN);
  if (resource.protocol !== 'https:' || issuer.protocol !== 'https:' || app.protocol !== 'https:' ||
      resource.pathname !== '/api/mcp' || resource.search || resource.hash || resource.username || resource.password ||
      issuer.search || issuer.hash || issuer.username || issuer.password || app.username || app.password)
    throw new Error('MCP_CONFIGURATION_REQUIRED');
  return { resource: resource.href, issuer: issuer.href.replace(/\/$/, ''), appOrigin: app.origin,
    clientIds: (env.FACTORY_MCP_CLIENT_IDS ?? '').split(',').map(x => x.trim()).filter(Boolean),
    writesEnabled: env.FACTORY_MCP_WRITES_ENABLED === 'true' };
}

export function resourceMetadata(config) {
  return { resource: config.resource, authorization_servers: [config.issuer],
    bearer_methods_supported: ['header'], scopes_supported: ['openid', 'offline_access'], resource_documentation: config.appOrigin };
}
