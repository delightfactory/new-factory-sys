import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkMcpDeployment, requiredMcpFiles } from '../../scripts/check-mcp-deployment.mjs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
function deploymentTree(t) {
  const root = mkdtempSync(join(tmpdir(), 'factory-deployment-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const path of [...requiredMcpFiles, 'package.json', 'vercel.json']) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    copyFileSync(join(repositoryRoot, path), join(root, path));
  }
  return root;
}
function changeConfiguration(root, change) {
  const path = join(root, 'vercel.json');
  const configuration = JSON.parse(readFileSync(path, 'utf8'));
  change(configuration);
  writeFileSync(path, JSON.stringify(configuration));
}

test('application deployment with the full MCP tree passes without secrets or a database', t => {
  assert.doesNotThrow(() => checkMcpDeployment(deploymentTree(t)));
});
test('application-only deployment missing the MCP handler is stopped', t => {
  const root = deploymentTree(t);
  rmSync(join(root, 'api/mcp.js'));
  assert.throws(() => checkMcpDeployment(root), { code: 'ENOENT' });
});
test('SPA fallback capturing MCP requests is stopped before publishing', t => {
  const root = deploymentTree(t);
  changeConfiguration(root, configuration => configuration.rewrites.unshift({ source: '/(.*)', destination: '/' }));
  assert.throws(() => checkMcpDeployment(root), /SPA rewrite captures MCP function/);
});
test('frontend install omitting isolated MCP dependencies is stopped', t => {
  const root = deploymentTree(t);
  changeConfiguration(root, configuration => configuration.installCommand = 'npm ci');
  assert.throws(() => checkMcpDeployment(root), /isolated, locked MCP runtime dependencies/);
});
test('function deployment omitting the trusted CA bundle is stopped', t => {
  const root = deploymentTree(t);
  changeConfiguration(root, configuration => configuration.functions['api/mcp.js'].includeFiles = 'public/**');
  assert.throws(() => checkMcpDeployment(root), /bundled CA/);
});
