# Changelog

## 0.2.2

New, no changes needed in apps:
- `identify(request, env)` in `bnt-kit/auth` returns the verified `{ email, issuer, subject }`.
  `subject` is the provider's stable account id (null when the token has none).
  Apps that need more than the email use this instead of reading the login token.
- `authLeaksOf(source)` in `bnt-kit/testing/purity` finds app code that reaches
  past the kit into the login provider (Access headers, cookies, paths, token
  libraries). Add it to each app's architecture test.
- The localhost dev bypass now returns the email lowercased, like real tokens.

## 0.2.1

New, no changes for existing apps: `bnt-kit/testing/mcp` (`mcpTestClient`) calls
an app's MCP tools over JSON-RPC in tests. It takes the app's fetch handler, so
the kit adds no runtime dependency. README: setting up an MCP connector behind
Access (Managed OAuth).

History was rewritten before this version so the kit names no app that uses it,
and every earlier commit id changed: v0.2.0 is now 55d7c8a, v0.1.1 069910c. Pin
apps to the new ids. CI fails when a name from the PRIVATE_NAMES secret appears
in a file or commit message (`npm run check:names` does the same locally).

## 0.2.0

Breaking: `bnt-kit/client` no longer needs Preact, so apps without it
can use it. `useSignInNeeded` moved to `bnt-kit/preact`; plain apps
use `onSignInNeeded(listener)` from `bnt-kit/client`.

Upgrade: `import { useSignInNeeded } from "bnt-kit/preact"`.

## 0.1.1

No changes for apps. The Access login check has its own tests in the kit
(audience, issuer, expiry, forged and unsigned tokens, missing email, the dev
bypass only on localhost). CI tags each new version after a green check on
main (from this version on).

## 0.1.0 (untagged: commit fb451140ac42b7b8147cae90c1fd7b3e9df8b6b5)

First version, taken from the first apps: Access JWT check, D1 migrations
(apply, status, apply-on-first-use), board client with "Sign in again",
update hook, service worker building blocks, test helpers, migration bundler
and the deploy check gate. Cloudflare error pages (status 500+, e.g. a Worker out
of CPU time) raise `ServerError`, not "sign in again".
