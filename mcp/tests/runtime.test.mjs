import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readConfig } from '../runtime.mjs';

const certificate = new URL('../certs/supabase-root-2021.crt', import.meta.url);
const environment = {
  FACTORY_MCP_RESOURCE: 'https://factory.example/api/mcp',
  FACTORY_MCP_ISSUER: 'https://auth.example/auth/v1',
  FACTORY_APP_ORIGIN: 'https://factory.example',
  FACTORY_MCP_CLIENT_IDS: 'test-client',
  FACTORY_MCP_DATABASE_HOST: 'aws-1-eu-west-2.pooler.supabase.com',
  FACTORY_MCP_DATABASE_USER: 'factory_mcp_gateway.cgqunqczuvwfvuzlsvyy',
  FACTORY_MCP_DATABASE_URL: 'postgresql://factory_mcp_gateway.cgqunqczuvwfvuzlsvyy:synthetic%40password@aws-1-eu-west-2.pooler.supabase.com:6543/postgres',
};

test('runtime loads bundled CA and keeps verified TLS and writes closed', () => {
  const { database, config } = readConfig(environment);
  assert.equal(database.ssl.ca, readFileSync(certificate, 'utf8'));
  assert.equal(database.ssl.rejectUnauthorized, true);
  assert.equal(database.port, 6543);
  assert.equal(database.password, 'synthetic@password');
  assert.equal(config.writesEnabled, false);
  const root = new X509Certificate(database.ssl.ca);
  assert.equal(root.ca, true);
  assert.ok(root.checkIssued(root));
  assert.ok(root.verify(root.publicKey));
  assert.equal(createHash('sha256').update(readFileSync(certificate)).digest('hex'),
    '700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7');
});

test('existing explicit CA override works and a missing file fails closed', () => {
  assert.equal(readConfig({ ...environment, FACTORY_MCP_DATABASE_CA_FILE: fileURLToPath(certificate) }).database.ssl.ca,
    readFileSync(certificate, 'utf8'));
  assert.throws(() => readConfig({ ...environment, FACTORY_MCP_DATABASE_CA_FILE: fileURLToPath(new URL('./missing-ca.crt', import.meta.url)) }),
    { code: 'ENOENT' });
});

test('URL TLS overrides and an unapproved database identity remain rejected', () => {
  for (const suffix of ['?sslmode=no-verify', '?sslmode=require', '#tls']) {
    assert.throws(() => readConfig({ ...environment, FACTORY_MCP_DATABASE_URL: environment.FACTORY_MCP_DATABASE_URL + suffix }),
      /MCP_DATABASE_CONFIGURATION_INVALID/);
  }
  assert.throws(() => readConfig({ ...environment, FACTORY_MCP_DATABASE_USER: 'postgres' }), /MCP_DATABASE_CONFIGURATION_INVALID/);
});
