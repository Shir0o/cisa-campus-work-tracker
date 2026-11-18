// Stdio handshake smoke test: spawn the real stdio entrypoint, list its tools,
// then call two read-only tools against the in-memory backend. No Firebase
// credentials and no network. Run with `npm run smoke`.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const directory = fileURLToPath(new URL('.', import.meta.url));
const tsx = fileURLToPath(new URL('./node_modules/.bin/tsx', import.meta.url));

const env = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
);

const transport = new StdioClientTransport({
  command: tsx,
  args: ['src/stdio.ts'],
  cwd: directory,
  env: {
    ...env,
    MCP_BACKEND: 'memory',
    MCP_ACTOR: 'smoke',
    FIREBASE_PROJECT_ID: 'sac-campus-hub',
    FIREBASE_DATABASE_ID: 'prod',
  },
  stderr: 'inherit',
});

const client = new Client({ name: 'cisa-smoke', version: '0.0.1' });

try {
  await client.connect(transport);

  const { tools } = await client.listTools();
  console.log(tools.map((tool) => tool.name).join('\n'));

  const expected = [
    'list_contacts',
    'get_contact',
    'create_contact',
    'update_contact',
    'log_interaction',
    'list_tasks',
    'create_task',
    'update_task',
    'list_gatherings',
    'get_gathering',
    'list_prayers',
    'list_stages',
    'list_coordination_notes',
  ];
  const missing = expected.filter((name) => !tools.some((tool) => tool.name === name));
  if (missing.length > 0) throw new Error(`Missing tools: ${missing.join(', ')}`);

  const stages = await client.callTool({ name: 'list_stages', arguments: {} });
  const stagesText = (stages.content as { type: string; text?: string }[])[0]?.text ?? '';
  console.log(`\nlist_stages → ${stagesText.replace(/\s+/g, ' ')}`);
  if (!stagesText.includes('"count"')) throw new Error('list_stages returned no JSON payload');

  const contacts = await client.callTool({ name: 'list_contacts', arguments: {} });
  const contactsText = (contacts.content as { type: string; text?: string }[])[0]?.text ?? '';
  console.log(`list_contacts → ${contactsText.replace(/\s+/g, ' ')}`);
  if (contacts.isError) throw new Error(`list_contacts failed: ${contactsText}`);

  console.log(`\n[cisa-work-tracker-mcp] smoke passed: ${tools.length} tools over stdio`);
} finally {
  await client.close();
}
