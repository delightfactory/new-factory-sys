import { createRemoteJWKSet, jwtVerify } from 'jose';

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function createVerifier({ issuer, resource, clientIds, jwks }) {
  const keys = jwks ?? createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  return async token => {
    const { payload } = await jwtVerify(token, keys, {
      issuer, audience: resource, algorithms: ['ES256', 'RS256'],
        requiredClaims: ['sub', 'exp', 'iat', 'session_id', 'client_id', 'scope'],
    });
    // MCP tokens must not carry the application's Data API role. A dedicated
    // resource-only claim is translated to native claims only inside the gateway.
    if (payload.aud !== resource || payload.role !== 'factory_mcp_resource' ||
        !uuid.test(payload.sub) || !uuid.test(payload.session_id) ||
          !clientIds.includes(payload.client_id) || typeof payload.scope !== 'string' ||
          !payload.scope.split(' ').includes('openid') ||
          !payload.scope.split(' ').every(scope => ['openid','email','offline_access'].includes(scope))) throw new Error('MCP_AUTH_REQUIRED');
    return { subject: payload.sub, sessionId: payload.session_id,
        clientId: payload.client_id, scope: payload.scope, resource };
  };
}

// No incoming token, SQL string, table name or database credential is sent to a tool.
// This adapter only dispatches these five parameterized, reviewed functions.
const calls = {
  schema: ['select public.factory_mcp_schema($1::jsonb) result', a => [JSON.stringify(a.payload)]],
  analyze: ['select public.factory_mcp_analyze($1::jsonb) result', a => [JSON.stringify(a.payload)]],
  context: ['select public.factory_mcp_context() result', () => []],
  query: ['select public.factory_mcp_query($1,$2::jsonb) result', a => [a.kind, JSON.stringify(a.payload)]],
  write: ['select public.factory_mcp_write($1,$2::jsonb,$3::uuid) result', a => [a.action, JSON.stringify(a.payload), a.requestId]],
};

export function createDatabaseRpc({ pool, principal }) {
  return async (name, args = {}) => {
    if (!Object.hasOwn(calls, name)) throw new Error('MCP_TOOL_UNKNOWN');
    const connection = await pool.connect();
    let committing = false;
    try {
      const analytical = name === 'analyze' || name === 'schema';
      await connection.query(analytical ? 'begin isolation level repeatable read read only' : name === 'query' ? 'begin isolation level repeatable read' : 'begin');
      const identity = await connection.query(`select current_user name, rolsuper, rolbypassrls,
        rolinherit, rolcreaterole, rolcreatedb, rolreplication from pg_roles where rolname=current_user`);
      const role = identity.rows[0];
      if (role?.name !== 'factory_mcp_gateway' || role.rolsuper || role.rolbypassrls ||
          role.rolinherit || role.rolcreaterole || role.rolcreatedb || role.rolreplication)
        throw new Error('MCP_DATABASE_ROLE_INVALID');
      const privileges = await connection.query(`select exists(
        select 1 from pg_roles r where r.rolname <> current_user and pg_has_role(current_user,r.oid,'MEMBER')
      ) as membership, exists(select 1 from pg_class where relowner=(select oid from pg_roles where rolname=current_user))
        or exists(select 1 from pg_proc where proowner=(select oid from pg_roles where rolname=current_user))
        or exists(select 1 from pg_namespace where nspowner=(select oid from pg_roles where rolname=current_user)) as owns_objects`);
      if (privileges.rows[0].membership || privileges.rows[0].owns_objects)
        throw new Error('MCP_DATABASE_ROLE_INVALID');
      await connection.query("set local statement_timeout = '15s'");
      await connection.query("select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)", [
        principal.subject, JSON.stringify({ sub: principal.subject, role: 'authenticated',
            session_id: principal.sessionId, client_id: principal.clientId, scope: principal.scope, aud: principal.resource }),
      ]);
      await connection.query(analytical ? "select public.factory_mcp_schema('{}'::jsonb)" : 'select public.factory_mcp_context()');
      const [sql, values] = calls[name];
      const response = await connection.query(sql, values(args));
      // Revocation/role changes are checked again before committing.
      await connection.query(analytical ? "select public.factory_mcp_schema('{}'::jsonb)" : 'select public.factory_mcp_context()');
      committing = true;
      await connection.query('commit');
      return response.rows[0].result;
    } catch (error) {
      await connection.query('rollback').catch(() => {});
      const code = committing ? 'MCP_RESPONSE_UNCERTAIN' :
        /^MCP_[A-Z_]{3,64}$/.test(error.message) ? error.message : 'MCP_DATABASE_ERROR';
      throw new Error(code);
    } finally { connection.release(); }
  };
}
