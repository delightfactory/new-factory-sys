import assert from 'node:assert/strict';
import { createHash, X509Certificate } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const deploymentBuildCommand = 'node scripts/check-mcp-deployment.mjs && npm run build';
export const requiredMcpFiles = [
  'api/mcp.js', 'api/oauth-resource.js', 'mcp/server.mjs', 'mcp/auth.mjs',
  'mcp/runtime.mjs', 'mcp/resource.mjs', 'mcp/tools.mjs', 'mcp/catalog.mjs',
  'mcp/analytics.mjs', 'mcp/package.json', 'mcp/package-lock.json',
  'mcp/certs/supabase-root-2021.crt', 'src/pages/auth/FactoryOAuthConsent.tsx',
  'src/lib/mcp-access-expiry.ts', 'src/App.tsx',
];
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const certificateHash = '700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7';
const jsonFile = (root, path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));

function checkCertificate(root) {
  const bytes = readFileSync(resolve(root, 'mcp/certs/supabase-root-2021.crt'));
  const certificate = new X509Certificate(bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), certificateHash, 'MCP CA changed; review TLS trust before deployment');
  assert.ok(certificate.ca && certificate.verify(certificate.publicKey), 'MCP CA must remain self-signed');
  assert.ok(Date.parse(certificate.validTo) > Date.now(), 'MCP CA expired');
}

function checkDependencies(root, configuration) {
  const manifest = jsonFile(root, 'mcp/package.json');
  const lock = jsonFile(root, 'mcp/package-lock.json');
  for (const [name, version] of Object.entries(manifest.dependencies)) {
    assert.equal(lock.packages[''].dependencies[name], version, `MCP dependency lock drift: ${name}`);
  }
  assert.equal(configuration.installCommand, 'npm ci && npm --prefix mcp ci --omit=dev --ignore-scripts',
    'Install must retain the isolated, locked MCP runtime dependencies');
}

function checkRoutes(root, configuration) {
  const destination = path => configuration.rewrites.find(rule =>
    new RegExp(`^${rule.source}$`).test(path))?.destination ?? path;
  for (const path of ['/api/mcp', '/api/oauth-resource']) {
    assert.equal(destination(path), path, `SPA rewrite captures MCP function: ${path}`);
  }
  for (const path of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/api/mcp']) {
    assert.equal(destination(path), '/api/oauth-resource', `MCP discovery route lost: ${path}`);
  }
  assert.equal(destination('/mcp/consent'), '/', 'OAuth consent must reach the application');
  assert.ok(readFileSync(resolve(root, 'src/App.tsx'), 'utf8').includes('path="mcp/consent"'), 'OAuth consent route removed');
}

export function checkMcpDeployment(root) {
  for (const path of requiredMcpFiles) assert.ok(statSync(resolve(root, path)).isFile(), `Missing MCP deployment file: ${path}`);
  const configuration = jsonFile(root, 'vercel.json');
  const manifest = jsonFile(root, 'package.json');
  assert.equal(configuration.buildCommand, deploymentBuildCommand, 'Vercel build must run the MCP preflight');
  assert.ok(manifest.scripts.build.startsWith('node scripts/check-mcp-deployment.mjs && '), 'Application build bypasses MCP preflight');
  assert.equal(configuration.functions['api/mcp.js'].includeFiles, 'mcp/certs/supabase-root-2021.crt', 'MCP function lost its bundled CA');
  checkCertificate(root);
  checkDependencies(root, configuration);
  checkRoutes(root, configuration);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkMcpDeployment(repositoryRoot);
  console.log('MCP deployment preflight passed: handlers, dependencies, discovery, consent and bundled TLS CA');
}
