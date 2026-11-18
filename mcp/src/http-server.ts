/**
 * CISA Campus Work Tracker MCP server over Streamable HTTP.
 *
 * Same tools as the stdio entrypoint, exposed so claude.ai and the Claude
 * mobile app can use the server as a remote Custom Connector. Run locally with
 * `npm run start:http`, or deploy with `Dockerfile.mcp` (Cloud Run or any
 * container host that terminates TLS).
 *
 * Environment:
 * - `PORT` — listening port (default 8080).
 * - `MCP_AUTH_TOKEN` — Bearer token required on `/mcp`. Required when
 *   `NODE_ENV=production`; otherwise the server starts with a loud warning.
 */
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import process from 'node:process';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createBackend, logToStderr } from './firestore.ts';
import { createMcpServer } from './tools.ts';

const PORT = Number(process.env.PORT ?? 8080);
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN?.trim();
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const MAX_BODY_BYTES = 1024 * 1024;

if (!AUTH_TOKEN) {
  if (IS_PRODUCTION) {
    logToStderr(
      '[cisa-work-tracker-mcp-http] FATAL: MCP_AUTH_TOKEN is not set. Refusing to expose /mcp ' +
        'unauthenticated in production. Set MCP_AUTH_TOKEN to a long random secret.'
    );
    process.exit(1);
  }
  logToStderr(
    '[cisa-work-tracker-mcp-http] WARNING: MCP_AUTH_TOKEN is not set — /mcp is OPEN to anyone ' +
      'who can reach this port. Set MCP_AUTH_TOKEN before exposing the server over the internet.'
  );
}

const backend = await createBackend();
const actor = process.env.MCP_ACTOR?.trim() || 'claude-web';

/** Live Streamable HTTP sessions, keyed by the `mcp-session-id` header. */
const sessions = new Map<string, StreamableHTTPServerTransport>();

class HttpError extends Error {
  readonly status: number;
  readonly code: number;

  constructor(status: number, code: number, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function tokenMatches(provided: string): boolean {
  if (!AUTH_TOKEN) return true;
  const left = Buffer.from(provided);
  const right = Buffer.from(AUTH_TOKEN);
  return left.length === right.length && timingSafeEqual(left, right);
}

function sessionIdOf(req: IncomingMessage): string | undefined {
  const value = req.headers['mcp-session-id'];
  return Array.isArray(value) ? value[0] : value;
}

function jsonRpcError(res: ServerResponse, status: number, code: number, message: string): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }));
}

function unauthorized(res: ServerResponse): void {
  res.writeHead(401, {
    'content-type': 'application/json',
    'www-authenticate': 'Bearer realm="cisa-work-tracker-mcp"',
  });
  res.end(
    JSON.stringify({
      error: 'unauthorized',
      message: 'Send Authorization: Bearer <MCP_AUTH_TOKEN>.',
    })
  );
}

function authorized(req: IncomingMessage): boolean {
  if (!AUTH_TOKEN) return true;
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');
  return Boolean(token) && scheme.toLowerCase() === 'bearer' && tokenMatches(token);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new HttpError(413, -32600, 'Request body too large.');
    }
    chunks.push(buffer);
  }

  if (size === 0) return undefined;
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, -32700, 'Parse error: request body is not valid JSON.');
  }
}

async function openSession(): Promise<StreamableHTTPServerTransport> {
  const server = createMcpServer(backend, actor);
  const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessionclosed: (sessionId) => {
      sessions.delete(sessionId);
      void server.close();
    },
  });
  transport.onclose = () => {
    const sessionId = transport.sessionId;
    if (sessionId) sessions.delete(sessionId);
  };
  await server.connect(transport);
  return transport;
}

async function handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!authorized(req)) {
    unauthorized(res);
    return;
  }

  const sessionId = sessionIdOf(req);

  if (req.method === 'POST') {
    const body = await readJsonBody(req);
    if (sessionId) {
      const existing = sessions.get(sessionId);
      if (!existing) {
        jsonRpcError(
          res,
          404,
          -32001,
          'Session not found or expired. Send a new initialize request.'
        );
        return;
      }
      await existing.handleRequest(req, res, body);
      return;
    }

    // No session id: this is an initialize request, so start a new session.
    const transport = await openSession();
    await transport.handleRequest(req, res, body);
    if (transport.sessionId) sessions.set(transport.sessionId, transport);
    return;
  }

  if (req.method === 'GET' || req.method === 'DELETE') {
    const transport = sessionId ? sessions.get(sessionId) : undefined;
    if (!transport) {
      jsonRpcError(res, 400, -32000, 'Bad Request: no valid mcp-session-id header.');
      return;
    }
    await transport.handleRequest(req, res);
    return;
  }

  res.writeHead(405, { allow: 'GET, POST, DELETE', 'content-type': 'text/plain' });
  res.end('Method not allowed');
}

const httpServer = createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');

    if (pathname === '/healthz' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
      return;
    }
    if (pathname === '/mcp') {
      await handleMcp(req, res);
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  } catch (error) {
    if (error instanceof HttpError) {
      jsonRpcError(res, error.status, error.code, error.message);
      return;
    }
    logToStderr(
      `[cisa-work-tracker-mcp-http] request failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    if (!res.headersSent) jsonRpcError(res, 500, -32603, 'Internal server error.');
  }
});

httpServer.listen(PORT, '0.0.0.0', () => {
  logToStderr(
    `[cisa-work-tracker-mcp-http] listening on 0.0.0.0:${PORT} (POST/GET/DELETE /mcp, ` +
      `GET /healthz; auth: ${AUTH_TOKEN ? 'bearer token' : 'DISABLED'}; ` +
      `database: ${backend.databaseId})`
  );
});

const shutdown = () => {
  const closing = [...sessions.values()].map((transport) =>
    transport.close().catch(() => undefined)
  );
  sessions.clear();
  void Promise.all(closing).finally(() => {
    httpServer.close(() => process.exit(0));
    // Do not wait forever for keep-alive connections.
    setTimeout(() => process.exit(0), 5000).unref();
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
