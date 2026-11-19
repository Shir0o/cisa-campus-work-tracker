// Cloudflare Worker entry: OAuth 2.1 authorization server + MCP resource server.
//
// The consent screen is a shared access-password gate. The password lives in a
// Worker secret (`wrangler secret put MCP_ACCESS_PASSWORD`) and is never stored
// anywhere else; the Worker compares SHA-256 digests instead of the raw strings.
//
// Headless MCP clients (Antigravity, Claude Code) may alternatively present a
// static `Authorization: Bearer <MCP_AUTH_TOKEN>` token when the `MCP_AUTH_TOKEN`
// Worker secret is configured.
import OAuthProvider, { type OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { handleMcp } from './mcp.ts';
import { handleConsent } from './consent.ts';
import { PUBLIC_URL } from './config.ts';

export interface Env {
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: OAuthHelpers;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_DATABASE_ID: string;
  /** Fixed OAuth subject; the whole team shares one connector identity. */
  MCP_MEMBER_ID: string;
  /** Service-account JSON, set with `wrangler secret put`. */
  FIREBASE_SERVICE_ACCOUNT: string;
  /** Consent-screen password, set with `wrangler secret put`. */
  MCP_ACCESS_PASSWORD: string;
  /** Optional static Bearer token for headless CLI / IDE MCP clients. */
  MCP_AUTH_TOKEN?: string;
}

const MCP_RESOURCE = `${PUBLIC_URL}/mcp`;

async function constantTimeMatches(provided: string, expected: string | undefined): Promise<boolean> {
  if (!expected || !provided) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const defaultHandler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/authorize') return handleConsent(request, env, ctx);
    if (pathname === '/healthz') return new Response('ok', { headers: { 'content-type': 'text/plain' } });
    if (pathname === '/') return landing();
    return new Response('Not found', { status: 404 });
  },
};

const apiHandler = {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
    _props?: unknown
  ): Promise<Response> {
    return handleMcp(request, env);
  },
};

export default new OAuthProvider<Env>({
  apiRoute: '/mcp',
  apiHandler,
  defaultHandler,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/token',
  clientRegistrationEndpoint: '/register',
  resourceMetadata: {
    resource: MCP_RESOURCE,
    resource_name: 'CISA Campus Work Tracker',
  },
  scopesSupported: ['work-tracker'],
  accessTokenTTL: 60 * 60,
  refreshTokenTTL: 30 * 24 * 60 * 60,
  // Registered clients can be revoked by deleting their KV entry; the default
  // TTL also stops abandoned registrations accumulating forever.
  clientRegistrationTTL: 90 * 24 * 60 * 60,
  resolveExternalToken: async ({ token, env }) => {
    if (!(await constantTimeMatches(token, env.MCP_AUTH_TOKEN))) return null;
    const memberId = env.MCP_MEMBER_ID || 'cisa-team';
    return {
      props: { member: memberId, source: 'bearer-token' },
      audience: MCP_RESOURCE,
    };
  },
});

function landing(): Response {
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CISA Campus Work Tracker · MCP</title>
<style>
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:#0f1115; color:#e8eaf0;
         font:15px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width:34rem; padding:2.5rem; }
  h1 { font-size:1.35rem; letter-spacing:-0.01em; margin:0 0 .75rem; }
  p { color:#9aa2b1; margin:0 0 .75rem; }
  code { background:#1a1d24; padding:.1rem .35rem; border-radius:4px; font-size:.85em; }
</style>
</head>
<body><main>
  <h1>CISA Campus Work Tracker · MCP server</h1>
  <p>This endpoint exposes the campus work tracker to Claude over the Model Context Protocol.</p>
  <p>Connect it from Claude with the URL <code>/mcp</code>. You will be asked for the team access
     password, and every write is recorded in <code>mcp_audit_logs</code>.</p>
</main></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
