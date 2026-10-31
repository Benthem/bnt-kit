# Changelog

## 0.2.1

New, no changes for existing apps: `bnt-kit/testing/mcp` (`mcpTestClient`) calls
an app's MCP tools over JSON-RPC in tests, lifted from Trippie's MCP test. It
takes the app's fetch handler, so the kit adds no runtime dependency. README:
setting up an MCP connector behind Access (Managed OAuth).

## 0.2.0

Breaking: `bnt-kit/client` no longer needs Preact, so apps without it (the
woningkaart) can use it. `useSignInNeeded` moved to `bnt-kit/preact`; plain apps
use `onSignInNeeded(listener)` from `bnt-kit/client`.

Upgrade: `import { useSignInNeeded } from "bnt-kit/preact"`.

## 0.1.1

No changes for apps. The Access login check has its own tests in the kit
(audience, issuer, expiry, forged and unsigned tokens, missing email, the dev
bypass only on localhost). CI tags each new version after a green check on
main (from this version on).

## 0.1.0 (untagged: commit e56102ecf03fbd9ce6bd8300c194c0c6c36437c6)

First version, taken from Trippie and Centen: Access JWT check, D1 migrations
(apply, status, apply-on-first-use), board client with "Sign in again",
update hook, service worker building blocks, test helpers, migration bundler
and the deploy check gate. Cloudflare error pages (status 500+, e.g. a Worker out
of CPU time) raise `ServerError`, not "sign in again".
