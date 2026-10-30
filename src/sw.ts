// Building blocks for a bnt.hm app's service worker (compiled separately with
// lib "webworker"). The app shell is precached per build; navigations go to
// the network first so Access can still redirect to its login; data and
// Access paths are never cached; a new build waits for a tap.

/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

/** Paths the service worker must never answer: API data and Access itself. */
export const NEVER_CACHED = ["/api/", "/cdn-cgi/"];

/** The shell cache of one build: "<prefix>-<build>". */
export const shellCache = (prefix: string, build: string) => `${prefix}-${build}`;

/** Precache the shell of this build. */
export function precacheShell(cache: string, urls: readonly string[]): Promise<void> {
  return caches.open(cache).then((c) => c.addAll(["/", ...urls]));
}

/** Remove shell caches of older builds, then take over open pages. */
export async function dropOldShells(prefix: string, keep: string): Promise<void> {
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k.startsWith(`${prefix}-`) && k !== keep).map((k) => caches.delete(k)));
  await self.clients.claim();
}

/** Answers "skip-waiting" (the person tapped update). */
export function onSkipWaiting(data: unknown): boolean {
  if (data !== "skip-waiting") return false;
  void self.skipWaiting();
  return true;
}

/**
 * "Sign in again" page loads (bnt-kit/client signIn) and Access paths go
 * straight to the network: the service worker must not answer them.
 */
export function leaveAlone(request: Request): boolean {
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== location.origin) return true;
  if (request.mode === "navigate" && url.searchParams.has("signin")) return true;
  return NEVER_CACHED.some((p) => url.pathname.startsWith(p));
}

/** Network first for page loads, so Access can redirect; the cached shell when offline. */
export function navigation(request: Request, cache: string): Promise<Response> {
  return fetch(request).catch(async () => (await caches.match("/", { cacheName: cache })) ?? Response.error());
}

/** Shell files: from this build's cache, else the network. */
export function fromShell(request: Request, cache: string): Promise<Response> {
  return caches.match(request, { cacheName: cache }).then((hit) => hit ?? fetch(request));
}
