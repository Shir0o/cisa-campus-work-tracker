// MCP over Streamable HTTP, stateless: one server + transport per request.
// Workers have no long-lived process, and every tool call is independent, so
// there is nothing to keep between requests.
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createMcpServer } from '../src/tools.ts';
import { RestStore, type ServiceAccount } from '../src/rest-store.ts';
import type { Env } from './index.ts';

export async function handleMcp(request: Request, env: Env): Promise<Response> {
  // Stateless servers have no stream to offer on GET. Answering it with an
  // SSE stream that closes at once makes clients reconnect every second,
  // which burned through the Workers daily request limit. 405 tells them
  // not to open one (MCP spec, Streamable HTTP).
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } });
  }
  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT) as ServiceAccount;
  const projectId = env.FIREBASE_PROJECT_ID || serviceAccount.project_id;
  const store = new RestStore({
    projectId,
    databaseId: env.FIREBASE_DATABASE_ID,
    serviceAccount: { ...serviceAccount, project_id: serviceAccount.project_id || projectId },
  });
  const server = createMcpServer(store, env.MCP_MEMBER_ID || 'cisa-team');

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);

  try {
    return await transport.handleRequest(request);
  } finally {
    // Nothing survives the response, but closing releases the transport's maps.
    void server.close();
  }
}
