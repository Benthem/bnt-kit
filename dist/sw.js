// Compiled from src/sw.ts by scripts/build.mjs. Do not edit.
const NEVER_CACHED = ["/api/", "/cdn-cgi/"];
const shellCache = (prefix, build) => `${prefix}-${build}`;
function precacheShell(cache, urls) {
  return caches.open(cache).then((c) => c.addAll(["/", ...urls]));
}
async function dropOldShells(prefix, keep) {
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k.startsWith(`${prefix}-`) && k !== keep).map((k) => caches.delete(k)));
  await self.clients.claim();
}
function onSkipWaiting(data) {
  if (data !== "skip-waiting") return false;
  void self.skipWaiting();
  return true;
}
function leaveAlone(request) {
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== location.origin) return true;
  if (request.mode === "navigate" && url.searchParams.has("signin")) return true;
  return NEVER_CACHED.some((p) => url.pathname.startsWith(p));
}
function navigation(request, cache) {
  return fetch(request).catch(async () => await caches.match("/", { cacheName: cache }) ?? Response.error());
}
function fromShell(request, cache) {
  return caches.match(request, { cacheName: cache }).then((hit) => hit ?? fetch(request));
}
export {
  NEVER_CACHED,
  dropOldShells,
  fromShell,
  leaveAlone,
  navigation,
  onSkipWaiting,
  precacheShell,
  shellCache
};
