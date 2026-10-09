-- REVIEW DRAFT ONLY. No clients, credentials, provider grants or access rows.
-- Uses actual Supabase Auth OAuth catalog types; inspect hosted schema before
-- installing. All configuration tables remain EMPTY (issuance closed).
CREATE SCHEMA factory_mcp_auth;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='factory_mcp_resource') THEN
  CREATE ROLE factory_mcp_resource NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
 END IF;
END $$;
-- No membership is granted, including to PostgREST's authenticator.
REVOKE ALL ON SCHEMA factory_mcp_auth FROM PUBLIC,anon,authenticated,factory_mcp_gateway;
CREATE TABLE factory_mcp_auth.static_clients (
 client_id uuid PRIMARY KEY REFERENCES auth.oauth_clients(id) ON DELETE CASCADE,
 fingerprint bytea NOT NULL,
 resource text NOT NULL CHECK(resource ~ '^https://[^/?#]+/api/mcp$'),
 redirect_uri text NOT NULL CHECK(redirect_uri ~ '^https://[^?#]+$'),
 expires_at timestamptz NOT NULL, revoked_at timestamptz
);
CREATE TABLE factory_mcp_auth.user_admissions (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, client_id uuid NOT NULL,
 resource text NOT NULL, authorization_id text NOT NULL,
 -- Historical consent provenance, not a live-session FK: provider session
 -- cleanup must remain possible. Current OAuth sessions are checked per call.
 native_session_id uuid NOT NULL,
 fingerprint bytea NOT NULL, scope text NOT NULL,
 expires_at timestamptz NOT NULL, admitted_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,client_id,resource)
);
ALTER TABLE factory_mcp_auth.static_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE factory_mcp_auth.user_admissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA factory_mcp_auth FROM PUBLIC,anon,authenticated,factory_mcp_gateway,supabase_auth_admin;

CREATE FUNCTION factory_mcp_auth.scopes_allowed(p_scope text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT coalesce(length(p_scope) BETWEEN 1 AND 128 AND 'openid'=ANY(string_to_array(p_scope,' '))
  AND string_to_array(p_scope,' ') <@ ARRAY['openid','email','offline_access']::text[],false)
$$;
CREATE FUNCTION factory_mcp_auth.client_fingerprint(c auth.oauth_clients) RETURNS bytea
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT sha256(convert_to(jsonb_build_array(c.id,c.registration_type,
  ARRAY(SELECT x FROM unnest(string_to_array(c.redirect_uris,',')) x ORDER BY x),
  ARRAY(SELECT x FROM unnest(string_to_array(c.grant_types,',')) x ORDER BY x),
  c.client_type,c.token_endpoint_auth_method,coalesce(c.client_secret_hash,''))::text,'UTF8'))
$$;
CREATE FUNCTION factory_mcp_auth.client_allowed(p_client uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM auth.oauth_clients c JOIN factory_mcp_auth.static_clients a ON a.client_id=c.id
  WHERE c.id=p_client AND c.deleted_at IS NULL AND c.registration_type::text='manual'
   AND c.client_type::text='public' AND c.token_endpoint_auth_method='none'
   AND coalesce(c.client_secret_hash,'')='' AND a.revoked_at IS NULL AND a.expires_at>statement_timestamp()
   AND string_to_array(c.redirect_uris,',')=ARRAY[a.redirect_uri]
   AND 'authorization_code'=ANY(string_to_array(c.grant_types,','))
   AND string_to_array(c.grant_types,',') <@ ARRAY['authorization_code','refresh_token']::text[]
   AND a.fingerprint=factory_mcp_auth.client_fingerprint(c))
$$;
CREATE FUNCTION factory_mcp_auth.native_actor() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c jsonb:=auth.jwt(); actor uuid:=auth.uid();
BEGIN
 IF actor IS NULL OR c->>'role' IS DISTINCT FROM 'authenticated' OR c->>'aud' IS DISTINCT FROM 'authenticated'
  OR (c->'client_id' IS NOT NULL AND c->'client_id'<>'null'::jsonb)
  OR NOT EXISTS(SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id=p.id WHERE p.id=actor AND p.is_active AND NOT coalesce(u.is_anonymous,false))
  OR NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id=(c->>'session_id')::uuid AND s.user_id=actor
    AND s.oauth_client_id IS NULL AND (s.not_after IS NULL OR s.not_after>statement_timestamp()))
 THEN RAISE EXCEPTION 'MCP_FIRST_PARTY_REQUIRED'; END IF;
 RETURN actor;
EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'MCP_FIRST_PARTY_REQUIRED';
END $$;
CREATE FUNCTION public.factory_mcp_consent_request(request_id text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=factory_mcp_auth.native_actor(); r auth.oauth_authorizations;
 policy factory_mcp_auth.static_clients; access factory_private.mcp_access;
BEGIN
 IF request_id IS NULL OR request_id !~ '^[A-Za-z0-9_-]{1,128}$' THEN RAISE EXCEPTION 'MCP_CONSENT_FORBIDDEN'; END IF;
 SELECT * INTO r FROM auth.oauth_authorizations WHERE authorization_id=request_id AND user_id=actor
  AND expires_at>statement_timestamp() AND status::text IN ('pending','approved');
 IF NOT FOUND OR NOT factory_mcp_auth.client_allowed(r.client_id) THEN RAISE EXCEPTION 'MCP_CONSENT_FORBIDDEN'; END IF;
 SELECT * INTO policy FROM factory_mcp_auth.static_clients WHERE client_id=r.client_id;
 IF r.resource IS DISTINCT FROM policy.resource OR r.redirect_uri IS DISTINCT FROM policy.redirect_uri
  OR r.response_type::text IS DISTINCT FROM 'code' OR lower(r.code_challenge_method::text) IS DISTINCT FROM 's256'
  OR r.code_challenge IS NULL OR r.code_challenge !~ '^[A-Za-z0-9_-]{43}$'
  OR NOT factory_mcp_auth.scopes_allowed(r.scope) THEN RAISE EXCEPTION 'MCP_CONSENT_FORBIDDEN'; END IF;
 -- User action can only admit a pre-approved time-limited business permission.
 -- It cannot create, extend or upgrade that access permission.
 SELECT * INTO access FROM factory_private.mcp_access WHERE user_id=actor AND client_id=r.client_id::text
  AND resource=policy.resource AND revoked_at IS NULL AND expires_at>statement_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'MCP_ACCESS_APPROVAL_REQUIRED'; END IF;
 RETURN jsonb_build_object('authorization_id',request_id,'user_id',actor,'client_id',r.client_id,
  'redirect_uri',r.redirect_uri,'scope',r.scope,'resource',policy.resource,'role',(SELECT role FROM public.profiles WHERE id=actor),
  'can_write',access.can_write,'expires_at',least(access.expires_at,policy.expires_at),
  'fingerprint',encode(policy.fingerprint,'hex'));
END $$;
CREATE FUNCTION public.factory_mcp_consent_admit(request_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r jsonb; actor uuid; client uuid;
BEGIN
 r:=public.factory_mcp_consent_request(request_id); actor:=(r->>'user_id')::uuid; client:=(r->>'client_id')::uuid;
 PERFORM 1 FROM public.profiles WHERE id=actor FOR SHARE;
 PERFORM 1 FROM auth.users WHERE id=actor FOR SHARE;
 PERFORM 1 FROM auth.oauth_clients WHERE id=client FOR SHARE;
 PERFORM 1 FROM auth.oauth_authorizations WHERE authorization_id=request_id AND user_id=actor FOR SHARE;
 PERFORM 1 FROM factory_mcp_auth.static_clients WHERE client_id=client FOR SHARE;
 PERFORM 1 FROM factory_private.mcp_access WHERE user_id=actor AND client_id=client::text AND resource=r->>'resource' FOR SHARE;
 PERFORM 1 FROM auth.sessions WHERE id=(auth.jwt()->>'session_id')::uuid FOR SHARE;
 r:=public.factory_mcp_consent_request(request_id);
 INSERT INTO factory_mcp_auth.user_admissions(user_id,client_id,resource,authorization_id,native_session_id,fingerprint,scope,expires_at)
  VALUES(actor,client,r->>'resource',request_id,(auth.jwt()->>'session_id')::uuid,decode(r->>'fingerprint','hex'),r->>'scope',(r->>'expires_at')::timestamptz)
  ON CONFLICT(user_id,client_id,resource) DO UPDATE SET authorization_id=excluded.authorization_id,
   native_session_id=excluded.native_session_id,fingerprint=excluded.fingerprint,scope=excluded.scope,
   expires_at=excluded.expires_at,admitted_at=now();
 RETURN r;
END $$;
CREATE FUNCTION factory_mcp_auth.oauth_access(p_actor uuid,p_session uuid,p_client uuid,p_scope text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('resource',a.resource,'expires_at',least(a.expires_at,b.expires_at,p.expires_at))
 FROM factory_mcp_auth.user_admissions a JOIN factory_mcp_auth.static_clients p ON p.client_id=a.client_id
 JOIN factory_private.mcp_access b ON b.user_id=a.user_id AND b.client_id=a.client_id::text AND b.resource=a.resource
 JOIN auth.sessions s ON s.id=p_session AND s.user_id=a.user_id AND s.oauth_client_id=a.client_id
 JOIN public.profiles u ON u.id=a.user_id AND u.is_active JOIN auth.users au ON au.id=u.id AND NOT coalesce(au.is_anonymous,false)
 JOIN auth.oauth_consents g ON g.user_id=a.user_id AND g.client_id=a.client_id AND g.revoked_at IS NULL
 WHERE a.user_id=p_actor AND a.client_id=p_client AND a.resource=p.resource AND b.revoked_at IS NULL
  AND least(a.expires_at,b.expires_at,p.expires_at)>statement_timestamp()
  AND factory_mcp_auth.client_allowed(p_client) AND a.fingerprint=p.fingerprint
  AND (s.not_after IS NULL OR s.not_after>statement_timestamp()) AND s.scopes=p_scope
  AND factory_mcp_auth.scopes_allowed(p_scope) AND factory_mcp_auth.scopes_allowed(g.scopes)
  AND string_to_array(p_scope,' ') <@ string_to_array(g.scopes,' ')
  AND string_to_array(p_scope,' ') <@ string_to_array(a.scope,' ')
$$;
CREATE FUNCTION factory_mcp_auth.access_token_hook(event jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c jsonb:=event->'claims'; s auth.sessions; access jsonb; oauth boolean;
BEGIN
 IF jsonb_typeof(c) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'MCP_HOOK_INVALID'; END IF;
 SELECT * INTO s FROM auth.sessions WHERE id=(c->>'session_id')::uuid;
 oauth:=s.oauth_client_id IS NOT NULL OR (c->'client_id' IS NOT NULL AND c->'client_id'<>'null'::jsonb)
  OR (event->'client_id' IS NOT NULL AND event->'client_id'<>'null'::jsonb)
  OR starts_with(coalesce(event->>'authentication_method',''),'oauth_provider') OR c->>'role'='factory_mcp_resource';
 IF NOT oauth THEN RETURN jsonb_build_object('claims',c); END IF;
 IF c->>'sub' IS DISTINCT FROM event->>'user_id' OR c->>'role' IS DISTINCT FROM 'authenticated'
  OR jsonb_typeof(c->'client_id') IS DISTINCT FROM 'string' OR s.id IS NULL
  OR (event->'client_id' IS NOT NULL AND event->'client_id'<>'null'::jsonb AND event->'client_id' IS DISTINCT FROM c->'client_id')
 THEN RAISE EXCEPTION 'MCP_HOOK_FORBIDDEN'; END IF;
 access:=factory_mcp_auth.oauth_access((c->>'sub')::uuid,(c->>'session_id')::uuid,(c->>'client_id')::uuid,c->>'scope');
 IF access IS NULL THEN RAISE EXCEPTION 'MCP_HOOK_FORBIDDEN'; END IF;
 c:=jsonb_set(c,'{aud}',access->'resource');
 c:=jsonb_set(c,'{role}','"factory_mcp_resource"'::jsonb);
 -- A persistent permission may use PostgreSQL infinity, but tokens always
 -- retain the provider's finite expiry. Revocation is checked on every call
 -- and refresh; a permanent permission never creates a permanent token.
 IF (access->>'expires_at')::timestamptz <> 'infinity'::timestamptz THEN
  c:=jsonb_set(c,'{exp}',to_jsonb(least((c->>'exp')::bigint,floor(extract(epoch FROM (access->>'expires_at')::timestamptz))::bigint)));
 END IF;
 RETURN jsonb_build_object('claims',c);
EXCEPTION WHEN OTHERS THEN
 RETURN jsonb_build_object('error',jsonb_build_object('http_code',403,'message','MCP_OAUTH_FORBIDDEN'));
END $$;
CREATE OR REPLACE FUNCTION factory_private.authorize_mcp()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c jsonb:=auth.jwt(); actor uuid:=auth.uid(); access jsonb; permission factory_private.mcp_access; actor_role text;
BEGIN
 actor_role:=factory_private.require_role(ARRAY['admin','manager','accountant','production_officer','inventory_officer','viewer']);
 -- These locks make provider revocation and role changes serialize with the
 -- business transaction. Credentials and provider records remain private.
 PERFORM 1 FROM auth.sessions WHERE id=(c->>'session_id')::uuid AND user_id=actor FOR SHARE;
 PERFORM 1 FROM auth.oauth_clients WHERE id=(c->>'client_id')::uuid FOR SHARE;
 PERFORM 1 FROM auth.oauth_consents WHERE user_id=actor AND client_id=(c->>'client_id')::uuid FOR SHARE;
 PERFORM 1 FROM factory_mcp_auth.static_clients WHERE client_id=(c->>'client_id')::uuid FOR SHARE;
 PERFORM 1 FROM factory_mcp_auth.user_admissions WHERE user_id=actor AND client_id=(c->>'client_id')::uuid FOR SHARE;
 SELECT * INTO permission FROM factory_private.mcp_access WHERE user_id=actor AND client_id=c->>'client_id'
  AND resource=c->>'aud' AND revoked_at IS NULL AND expires_at>statement_timestamp() FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'MCP_ACCESS_FORBIDDEN'; END IF;
 access:=factory_mcp_auth.oauth_access(actor,(c->>'session_id')::uuid,(c->>'client_id')::uuid,c->>'scope');
 IF access IS NULL OR access->>'resource' IS DISTINCT FROM c->>'aud' THEN RAISE EXCEPTION 'MCP_ACCESS_FORBIDDEN'; END IF;
 RETURN jsonb_build_object('user_id',actor,'role',actor_role,'can_write',permission.can_write);
EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'MCP_ACCESS_FORBIDDEN';
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA factory_mcp_auth FROM PUBLIC,anon,authenticated,factory_mcp_gateway;
GRANT USAGE ON SCHEMA factory_mcp_auth TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION factory_mcp_auth.access_token_hook(jsonb) TO supabase_auth_admin;
REVOKE ALL ON FUNCTION public.factory_mcp_consent_request(text),public.factory_mcp_consent_admit(text) FROM PUBLIC,anon,factory_mcp_gateway;
GRANT EXECUTE ON FUNCTION public.factory_mcp_consent_request(text),public.factory_mcp_consent_admit(text) TO authenticated;
-- Integration prerequisites, not executed here:
-- factory_mcp_resource must be NOLOGIN NOINHERIT with NO privileges/memberships.
-- Never GRANT it to authenticator/anon/authenticated or any database login.
-- Runtime JWT verifier accepts role factory_mcp_resource. Gateway SQL checks the
-- live oauth_access result on EVERY operation; validate same resource/scope,
-- active provider consent/session/client fingerprint/access expiry under locks.
-- Existing native JWTs keep aud/role unchanged. Direct REST, Storage, Realtime
-- and all exposed SECURITY DEFINER RPCs must reject ANY OAuth/client marker;
-- a resource JWT must never inherit authenticated Data API authority.
