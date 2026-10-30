# Changelog

## 0.1.0 — commit e56102ecf03fbd9ce6bd8300c194c0c6c36437c6

First version, taken from the first apps: Access JWT check, D1 migrations
(apply, status, apply-on-first-use), board client with "Sign in again",
update hook, service worker building blocks, test helpers, migration bundler
and the deploy check gate. Cloudflare error pages (status 500+, e.g. a Worker out
of CPU time) raise `ServerError`, not "sign in again".
