# CISA Campus Work Tracker MCP server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the
CISA Campus Work Tracker's Firestore database to Claude (Desktop / Code / web / mobile)
and Google Antigravity.

Three entrypoints share one tool layer (`src/tools.ts`):

- **stdio** — `src/stdio.ts` (`npm run start`) for Claude Desktop, Claude Code and Antigravity.
- **Streamable HTTP** — `src/http-server.ts` (`npm run start:http`) for a container
  deployment that claude.ai and the Claude mobile app use as a **Custom Connector**.
- **Cloudflare Worker** — `worker/` (`npm run deploy:worker`) for a serverless
  Custom Connector with OAuth 2.1 and no container to run.

The project uses a **named Firestore database** (`prod`), not `(default)`. The server
reads the project and database ids from `../firebase-applet-config.json`
(`sac-campus-hub` / `prod`); both can be overridden with environment variables.

## What it can read and write

| Collection | Purpose |
| --- | --- |
| `contacts/{id}` | People: name, contact details, stage, tags, kind flags, activity stamps |
| `contacts/{id}/interactions/{id}` | The conversation log for a person |
| `tasks/{id}` | Shared to-dos (`title`, `dueDate`, `priority`, `status`, `contactId`, …) |
| `events/{id}` | Gatherings and Rhythm occasions (`name`, `date`, `order`, `rhythmId`, `attendance`, …) |
| `rhythms/{id}` | A recurring gathering's name, location and standing roster |
| `prayers/{id}` | Prayer burdens and answers (`contactId`, `burden`, `status`, `teamPrayer`, …) |
| `stages/{id}` | The directory stage vocabulary |
| `board_notes/{id}` | The Board's coordination notes and learnings |
| `mcp_audit_logs/{id}` | Every write made through this server (server-only) |

`mcp_audit_logs` has no `firestore.rules` match, so the app can neither read nor write
it. Each entry records the actor, tool, action, target and a short change summary.

## Tools

| Tool | Access | Description |
| --- | --- | --- |
| `list_contacts` | read | Free-text, stage and tag filters; sorted page of people |
| `get_contact` | read | One person, optionally with interactions and prayers |
| `create_contact` | write | Add a person in the app's record shape; audits |
| `update_contact` | write | Patch only the supplied fields; audits |
| `log_interaction` | write | Append an interaction and stamp `lastSeen` / `reachedAt`; audits |
| `list_tasks` | read | Status, priority, assignee and person filters; soonest first |
| `create_task` | write | Create a to-do, resolving the person's display name; audits |
| `update_task` | write | Complete, reschedule or reassign a to-do; audits |
| `list_gatherings` | read | Gatherings in a date range, cancelled excluded by default |
| `get_gathering` | read | One gathering with attendance and its resolved Rhythm |
| `list_prayers` | read | Burdens/answers by person, status, team visibility or text |
| `list_stages` | read | Stage labels in display order |
| `list_coordination_notes` | read | The Board's records and learnings, with archived/deleted hidden |

Interaction types match the app: `chat`, `email`, `call`, `meeting`. Absent
`teamPrayer` means the team carries a prayer, exactly as the app reads it.
`create_contact` fills `visibleTo` from `createdById`; without an owner tie the
person is visible only to full-timers, matching the app's contact-visibility rules.

## Credentials

The server uses the Firebase Admin SDK, which **bypasses `firestore.rules`**. That is
required (an MCP client has no signed-in Firebase user) and is why the tool set is
deliberately narrow and every write is audited.

1. Firebase console → Project settings → Service accounts → **Generate new private key**
   for project `sac-campus-hub`. A `roles/datastore.user` service account is enough.
2. Keep the JSON **outside this repository** (it is a full-access credential).
3. Point the server at it with one of:
   - `FIREBASE_SERVICE_ACCOUNT` — inline JSON **or** an absolute path to the file.
   - `GOOGLE_APPLICATION_CREDENTIALS` — an absolute path to the file.
   - Application Default Credentials (e.g. a Cloud Run service identity).

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `FIREBASE_SERVICE_ACCOUNT` | One credential source | Inline service-account JSON or an absolute path. Takes precedence over ADC. |
| `GOOGLE_APPLICATION_CREDENTIALS` | One credential source | Absolute path to the service-account JSON. |
| `FIREBASE_PROJECT_ID` | No | Defaults to `sac-campus-hub` (`firebase-applet-config.json`). |
| `FIREBASE_DATABASE_ID` | No | Defaults to `prod` (`firebase-applet-config.json`). Use `(default)` for a default database. |
| `MCP_ACTOR` | No | Name recorded in `mcp_audit_logs` for stdio/HTTP. Default `claude-stdio` / `claude-web`. |
| `PORT` | HTTP only | Listening port. Default `8080`. |
| `MCP_AUTH_TOKEN` | HTTP in production | Bearer token required on `/mcp`. Without it the server warns (and refuses to start when `NODE_ENV=production`). |
| `MCP_BACKEND` | No | `memory` runs against an empty in-memory store. Tests/offline protocol checks only; rejected in production. |

## Install and run

```bash
npm --prefix mcp install   # mcp/ is its own package; the root install is untouched
npm run mcp                # tsx mcp/src/stdio.ts
npm run mcp:http           # tsx mcp/src/http-server.ts
```

The stdio process speaks JSON-RPC on **stdout**; diagnostics are written to **stderr**.
You do not normally run it by hand — your MCP client spawns it.

## Claude Code

The repository ships `.mcp.json`:

```json
{
  "mcpServers": {
    "cisa-work-tracker": {
      "command": "./mcp/node_modules/.bin/tsx",
      "args": ["mcp/src/stdio.ts"],
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "${GOOGLE_APPLICATION_CREDENTIALS}",
        "FIREBASE_PROJECT_ID": "sac-campus-hub",
        "FIREBASE_DATABASE_ID": "prod"
      }
    }
  }
}
```

Run `npm --prefix mcp install`, export `GOOGLE_APPLICATION_CREDENTIALS`, start Claude
Code in the repository root and approve the server when prompted. Verify with
`claude mcp list` or `/mcp` inside a session.

To add it from a terminal instead (user scope):

```bash
claude mcp add cisa-work-tracker \
  --env GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json \
  --env FIREBASE_PROJECT_ID=sac-campus-hub \
  --env FIREBASE_DATABASE_ID=prod \
  -- /absolute/path/to/repo/mcp/node_modules/.bin/tsx /absolute/path/to/repo/mcp/src/stdio.ts
```

## Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or
`%APPDATA%\Claude\claude_desktop_config.json` (Windows). Absolute paths are required;
fully quit and reopen Claude afterwards.

```json
{
  "mcpServers": {
    "cisa-work-tracker": {
      "command": "/absolute/path/to/repo/mcp/node_modules/.bin/tsx",
      "args": ["/absolute/path/to/repo/mcp/src/stdio.ts"],
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "/absolute/path/to/service-account.json",
        "FIREBASE_PROJECT_ID": "sac-campus-hub",
        "FIREBASE_DATABASE_ID": "prod",
        "MCP_ACTOR": "claude-desktop"
      }
    }
  }
}
```

Using the project's local `tsx` binary avoids depending on the `PATH` Claude Desktop
sees. If you prefer npm, use `"command": "npm"` with
`"args": ["--prefix", "/absolute/path/to/repo", "run", "mcp"]`.

## Antigravity

Antigravity reads `mcp_config.json` from:

- **Global** (App, IDE, CLI): `~/.gemini/config/mcp_config.json`
- **Workspace**: `<workspace>/.agents/mcp_config.json`

```json
{
  "mcpServers": {
    "cisa-work-tracker": {
      "command": "/absolute/path/to/repo/mcp/node_modules/.bin/tsx",
      "args": ["/absolute/path/to/repo/mcp/src/stdio.ts"],
      "cwd": "/absolute/path/to/repo",
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "/absolute/path/to/service-account.json",
        "FIREBASE_PROJECT_ID": "sac-campus-hub",
        "FIREBASE_DATABASE_ID": "prod",
        "MCP_ACTOR": "antigravity"
      }
    }
  }
}
```

You can also use **Customizations → Installed → MCP Servers**; it edits the same file.
Antigravity lazy-loads tool schemas by default. To preload a frequently used tool, add
`"tools": { "list_contacts": { "eager": true } }` to the server entry.

## Streamable HTTP (Claude Custom Connector on Cloud Run)

`npm run mcp:http` serves the same tools over MCP **Streamable HTTP**:

| Route | Purpose |
| --- | --- |
| `POST /mcp` | JSON-RPC (initialize + tool calls) |
| `GET /mcp` | SSE stream for an existing session |
| `DELETE /mcp` | End a session |
| `GET /healthz` | Liveness probe (`200 ok`) |

When `MCP_AUTH_TOKEN` is set, every `/mcp` request must send
`Authorization: Bearer <MCP_AUTH_TOKEN>`; `/healthz` stays open. Without the variable
the server logs a loud warning — and **refuses to start** with `NODE_ENV=production`.

### Local check

```bash
export MCP_AUTH_TOKEN="$(openssl rand -hex 32)"
export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
PORT=8080 npm run mcp:http

curl -sS http://localhost:8080/healthz        # -> ok
```

Claude connectors must reach the server over **HTTPS**, so `localhost` is not usable
directly. Use a tunnel (`cloudflared tunnel --url http://localhost:8080`,
`ngrok http 8080`) while testing; the connector URL is then `https://<tunnel-host>/mcp`.

### Docker / Cloud Run

`Dockerfile.mcp` at the repository root builds the server from the `mcp/` package:

```bash
PROJECT_ID=your-project
IMAGE="gcr.io/$PROJECT_ID/cisa-work-tracker-mcp"

gcloud auth configure-docker
docker build -f Dockerfile.mcp -t "$IMAGE" .
docker push "$IMAGE"
```

Store both secrets in Secret Manager (never bake them into the image):

```bash
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create MCP_AUTH_TOKEN --data-file=-
gcloud secrets create FIREBASE_SERVICE_ACCOUNT --data-file=service-account.json
```

Deploy:

```bash
gcloud run deploy cisa-work-tracker-mcp \
  --image "$IMAGE" \
  --region us-central1 \
  --port 8080 \
  --allow-unauthenticated \
  --session-affinity \
  --max-instances 1 \
  --set-env-vars NODE_ENV=production,FIREBASE_PROJECT_ID=sac-campus-hub,FIREBASE_DATABASE_ID=prod \
  --set-secrets MCP_AUTH_TOKEN=MCP_AUTH_TOKEN:latest,FIREBASE_SERVICE_ACCOUNT=FIREBASE_SERVICE_ACCOUNT:latest
```

Notes:

- `--allow-unauthenticated` is required because Claude cannot present a Google IAM
  identity. TLS plus the Bearer token is the access boundary; keep the token secret.
- Sessions live in process memory, so `--max-instances 1` (or session affinity) keeps a
  session's requests on the same instance.
- Cloud Run injects `PORT`; the server listens on `0.0.0.0:$PORT`.

### Add the connector

1. **claude.ai → Settings → Connectors → Add custom connector**.
2. Name it `CISA Work Tracker`, set the URL to `https://<your-host>/mcp`.
3. Paste `MCP_AUTH_TOKEN` as the **Bearer token** (or leave it empty if you front the
   service with a gateway that injects the header).
4. Enable the connector in a chat. The mobile app picks it up from the same account.

Verify the deployment:

```bash
SERVICE_URL=$(gcloud run services describe cisa-work-tracker-mcp --region us-central1 --format='value(status.url)')
curl -sS "$SERVICE_URL/healthz"     # -> ok
curl -sS -o /dev/null -w '%{http_code}\n' "$SERVICE_URL/mcp"   # -> 401
```

## Cloudflare Worker (serverless Custom Connector)

`worker/` serves the same tools over MCP Streamable HTTP, fronted by OAuth 2.1
(dynamic client registration, PKCE S256, refresh tokens) from
`@cloudflare/workers-oauth-provider`. The consent screen asks for a shared access
password stored as the `MCP_ACCESS_PASSWORD` secret; the Worker compares SHA-256
digests, so the password never lands in KV, logs or code.

The Worker cannot run `firebase-admin`, so it uses `src/rest-store.ts`: the Firestore
REST API, authenticated with a service-account JWT signed through WebCrypto, pointed
at the named database. Same tools, same validation, same audit trail. Writes use real
Firestore transactions where the tools need them (`:beginTransaction` / `:commit`).

### Configuration

`wrangler.toml` holds the non-secret settings:

| Setting | Value |
| --- | --- |
| `name` | `cisa-work-tracker-mcp` |
| `FIREBASE_PROJECT_ID` | `sac-campus-hub` |
| `FIREBASE_DATABASE_ID` | `prod` |
| `MCP_MEMBER_ID` | OAuth subject for the shared connector identity (`cisa-team`) |

Secrets are set with `wrangler secret put` and never appear in the file:

| Secret | Purpose |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT` | Service-account JSON on one line (`roles/datastore.user` is enough). |
| `MCP_ACCESS_PASSWORD` | Password shown on the consent screen. |

### Deploy

```bash
cd mcp
npx wrangler login
npx wrangler kv namespace create OAUTH_KV   # paste the id into wrangler.toml
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT
npx wrangler secret put MCP_ACCESS_PASSWORD
# edit worker/config.ts → PUBLIC_URL to the deployed origin
npx wrangler deploy
```

Or from the repository root: `npm run mcp:dev:worker` and `npm run mcp:deploy:worker`.

`PUBLIC_URL` must match the deployed origin exactly: it is the RFC 9728 resource
identifier, and the provider refuses to serve discovery metadata or a
`resource_metadata` challenge when the request origin disagrees.

For local development, create `mcp/.dev.vars` (git-ignored) with the same two secrets
and run `npm run mcp:dev:worker`.

Then in Claude: **Settings → Connectors → Add custom connector**, URL
`https://<origin>/mcp`. Claude registers itself, opens the consent page, and you enter
the access password once.

### What the OAuth flow looks like

1. Client fetches `/.well-known/oauth-protected-resource/mcp` → issuer.
2. Registers at `/register` (DCR), starts `/authorize` with PKCE.
3. Consent page posts the access password; the Worker verifies its SHA-256 digest.
4. `/token` exchanges the code for a 1-hour access token + 30-day refresh token.
5. `/mcp` accepts the bearer token; `env.OAUTH_PROVIDER` validates it before the handler runs.

## Development

```bash
npm --prefix mcp install
npm --prefix mcp run typecheck     # stdio + Worker type checks
npm --prefix mcp test              # vitest: tool layer + REST transport
npm --prefix mcp run smoke         # real stdio handshake, in-memory backend
```

Tests import `src/memory.ts` (an in-memory `FirestoreBackend`), so they need no
Firebase and no network. The smoke test spawns `src/stdio.ts` with
`MCP_BACKEND=memory`, lists the tools and calls two read-only ones.

The root `vitest.config.ts` excludes `mcp/**`; run its tests with the `mcp:*` scripts
so the web app's coverage totals and jsdom environment are unaffected.

## Example prompts

- "Show me everyone in the New stage who hasn't been contacted in two weeks."
- "Log a coffee chat with Ada Lovelace: we read Romans 8 and she asked about baptism."
- "What are the pending to-dos for the team this week?"
- "Summarise the learnings we wrote after the last outreach."
- "Who is on the roster for Wednesday Bible Study, and who was absent last week?"
- "Add a to-do to follow up with Ben about the retreat, due Friday."
