import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accessFetch, Offline, readJson, SIGN_IN_EVENT, SignInNeeded } from "../src/client";

let events: string[] = [];
beforeEach(() => {
  events = [];
  vi.stubGlobal("dispatchEvent", (e: Event) => { events.push(e.type); return true; });
  vi.stubGlobal("navigator", { onLine: true });
});
afterEach(() => vi.unstubAllGlobals());

const respond = (body: string, type: string, redirected = false) => {
  const res = new Response(body, { headers: { "content-type": type } });
  Object.defineProperty(res, "redirected", { value: redirected });
  return res;
};

describe("accessFetch", () => {
  it("passes JSON through", async () => {
    vi.stubGlobal("fetch", async () => respond("{\"ok\":1}", "application/json"));
    expect(await readJson(await accessFetch("/api/x"))).toEqual({ ok: 1 });
    expect(events).toEqual([]);
  });

  it("treats the login page as an expired login", async () => {
    vi.stubGlobal("fetch", async () => respond("<html>login</html>", "text/html", true));
    await expect(accessFetch("/api/x")).rejects.toBeInstanceOf(SignInNeeded);
    expect(events).toEqual([SIGN_IN_EVENT]);
  });

  it("treats a refused cross-origin redirect as an expired login when online", async () => {
    vi.stubGlobal("fetch", async () => { throw new TypeError("Failed to fetch"); });
    await expect(accessFetch("/api/x")).rejects.toBeInstanceOf(SignInNeeded);
  });

  it("says offline when the network is down", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    vi.stubGlobal("fetch", async () => { throw new TypeError("Failed to fetch"); });
    await expect(accessFetch("/api/x")).rejects.toBeInstanceOf(Offline);
    expect(events).toEqual([]);
  });
});
