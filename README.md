# bnt-kit

The shared platform for bnt.hm apps (Trippie, Centen, Woningkaart): how an app
runs on Cloudflare Workers behind Cloudflare Access. Domain logic and each
app's look stay in the apps.

Install an exact commit (or a tag), never a branch, so an app only changes kit
when its own commit says so:

```json
"bnt-kit": "github:Benthem/bnt-kit#<commit sha>"
```

CHANGELOG.md lists the commit of each version.

The kit ships compiled JavaScript (`dist/`, committed, built by
`npm run build`) with its TypeScript source as the types, so it runs in Workers,
Vite, Vitest and plain Node alike. Source uses only erasable TypeScript. Apps
using `bnt-kit/pwa` or `bnt-kit/preact` need `resolve: { dedupe: ["preact"] }` in
their Vite config so the kit's hooks use the app's Preact.

| Import | What |
|---|---|
| `bnt-kit/auth` | `authenticate(request, env)`: verifies the Access JWT (issuer + AUD) on every request; local dev bypass via `DEV_USER_EMAIL` on localhost only; shows the AUD Access sent while setting up. |
| `bnt-kit/d1-migrations` | `statements`, `migrationStatus`, `applyMigrations`, `ensureSchema`: apply bundled `migrations/*.sql` from the Worker, logged in Wrangler's `d1_migrations` table, one atomic batch per file. |
| `bnt-kit/client` | No framework. `accessFetch`, `readJson`: turn Access's expired-login answers into `SignInNeeded`, Cloudflare error pages into `ServerError` and a dead network into `Offline`; `onSignInNeeded(listener)` + `signIn()` for a "Sign in again" button. |
| `bnt-kit/preact` | `useSignInNeeded()`: the same as a Preact hook. |
| `bnt-kit/pwa` (Preact) | `useUpdateAvailable()`: registers `/sw.js`; a new build waits for a tap; optional release notes from the waiting worker. `requestPersistence()`. |
| `bnt-kit/sw` | Service worker building blocks: precached shell per build, network-first page loads, never caching `/api/` and `/cdn-cgi/`, leaving "Sign in again" page loads alone. |
| `bnt-kit/testing/d1` | `openD1({ configPath, migrationsDir })`: a fresh local D1 with migrations applied. |
| `bnt-kit/testing/purity` | `importsOf`, `impuritiesOf`: for architecture tests that keep pure code pure. |
| `bnt-kit/testing/mcp` | `mcpTestClient(handler)`: `call`, `listTools`, `tool(name, args)` against the app's MCP fetch handler over JSON-RPC, as Claude calls it. No MCP dependency in the kit. |
| `bnt-bundle-migrations <dir> <out.ts> [--check]` | Bundles migrations for the Worker; `--check` fails when stale. |
| `bnt-worker-build` | Wrangler `build.command`: runs `npm run check` before deploys and version uploads, `npm run build` for types/dev. |

## An MCP connector

An app's MCP endpoint sits behind the same Access app as its board; no extra
auth code. Trippie is the reference.

1. Access app for the hostname: turn on **Managed OAuth** and allow the
   redirect URIs `https://claude.ai/api/mcp/auth_callback` and
   `https://claude.com/api/mcp/auth_callback` (ChatGPT needs its own).
2. In the Worker, `authenticate(request, env)` first, then
   `createMcpHandler(() => createServer(deps), { route: "/mcp" })` from
   `agents/mcp/server`, with the caller's email in `deps` for attribution.
3. Each person adds `https://<host>/mcp` as a custom connector in their own
   Claude account (Settings → Connectors).
4. Test the tools with `mcpTestClient` from `bnt-kit/testing/mcp`. Tool
   descriptions are prompts for Claude: test what they promise.

## Changing the kit

1. Change, add a test, `npm run build`, `npm run check` (fails when `dist/` is stale).
2. Add a CHANGELOG entry and bump `version`; push to `main`. CI tags the
   version (`vX.Y.Z`) after a green check; nobody tags by hand.
3. In each app, point `package.json` at the new commit, `npm install`, `npm run check`.

Breaking changes bump the minor version while below 1.0. Apps move one at a
time; an app can stay on an older tag.
