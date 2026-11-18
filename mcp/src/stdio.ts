/**
 * stdio transport — for Claude Desktop, Claude Code and Antigravity.
 *
 * Nothing is printed to stdout except the MCP protocol; diagnostics go to
 * stderr. The client spawns this process and speaks JSON-RPC over its stdio.
 */
import process from 'node:process';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createBackend, logToStderr } from './firestore.ts';
import { createMcpServer, TOOLS } from './tools.ts';

const actor = process.env.MCP_ACTOR?.trim() || 'claude-stdio';

const backend = await createBackend();
const server = createMcpServer(backend, actor);

const transport = new StdioServerTransport();
await server.connect(transport);

const shutdown = () => {
  void server.close().finally(() => process.exit(0));
};

process.stdin.on('end', shutdown);
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

logToStderr(
  `[cisa-work-tracker-mcp] ready on stdio ` +
    `(project ${backend.projectId}, database ${backend.databaseId}, mode ${backend.mode}, actor ${actor}; ` +
    `tools: ${TOOLS.map((tool) => tool.name).join(', ')})`
);
