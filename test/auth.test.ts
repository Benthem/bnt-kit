import { afterEach, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT, UnsecuredJWT } from "jose";
import { AuthError, authenticate, identify } from "../src/auth";

const env = { ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com", ACCESS_AUD: "aud" };

describe("auth fails closed", () => {
  it("rejects requests without an Access JWT", async () => {
    await expect(authenticate(new Request("https://app.bnt.hm/mcp"), env)).rejects.toThrow(AuthError);
  });
  it("rejects when Access is not configured", async () => {
    const req = new Request("https://app.bnt.hm/mcp", { headers: { "Cf-Access-Jwt-Assertion": "x" } });
    await expect(authenticate(req, { ACCESS_TEAM_DOMAIN: "", ACCESS_AUD: "" })).rejects.toThrow(/not configured/);
  });
  it("ignores DEV_USER_EMAIL off localhost", async () => {
    const req = new Request("https://app.bnt.hm/mcp");
    await expect(authenticate(req, { ...env, DEV_USER_EMAIL: "dev@example.com" })).rejects.toThrow(AuthError);
  });
  it("uses DEV_USER_EMAIL on localhost only", async () => {
    expect(await authenticate(new Request("http://localhost:8787/api/data"), { ...env, DEV_USER_EMAIL: "dev@example.com" })).toBe("dev@example.com");
  });
  it("identify on localhost: issuer local, the dev email as subject", async () => {
    expect(await identify(new Request("http://localhost:8787/"), { ...env, DEV_USER_EMAIL: "Dev@Example.com" }))
      .toEqual({ email: "dev@example.com", issuer: "local", subject: "dev@example.com" });
  });
  it("uses DEV_USER_EMAIL on 127.0.0.1 too, but not on hosts that only look local", async () => {
    const dev = { ...env, DEV_USER_EMAIL: "dev@example.com" };
    expect(await authenticate(new Request("http://127.0.0.1:8787/"), dev)).toBe("dev@example.com");
    await expect(authenticate(new Request("https://localhost.evil.example/"), dev)).rejects.toThrow(AuthError);
  });
  it("rejects an unsigned token even when it names the right team and audience", async () => {
    const token = new UnsecuredJWT({ email: "a@example.com" }).setAudience("aud").setIssuer("https://team.cloudflareaccess.com").setExpirationTime("5m").encode();
    const req = new Request("https://app.bnt.hm/", { headers: { "Cf-Access-Jwt-Assertion": token } });
    await expect(authenticate(req, env)).rejects.toThrow(/Invalid Access token/);
  });
  it("shows the token's aud while ACCESS_AUD is unset", async () => {
    const token = new UnsecuredJWT({ email: "a@example.com" }).setAudience("abc123").setIssuer("https://team.cloudflareaccess.com").encode();
    const req = new Request("https://app.bnt.hm/version", { headers: { "Cf-Access-Jwt-Assertion": token } });
    await expect(authenticate(req, { ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com", ACCESS_AUD: "" })).rejects.toThrow(/aud="abc123"/);
  });
});

describe("Access tokens", () => {
  // A team domain per test: the verifier caches each team's key set.
  let teams = 0;
  afterEach(() => vi.unstubAllGlobals());

  /** An Access team whose certs endpoint serves one signing key, and a token minter for it. */
  async function team() {
    const domain = `team${++teams}.cloudflareaccess.com`;
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = { ...(await exportJWK(publicKey)), kid: "access-key", alg: "RS256", use: "sig" };
    const requested: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      requested.push(String(input instanceof Request ? input.url : input));
      return new Response(JSON.stringify({ keys: [jwk] }), { headers: { "content-type": "application/json" } });
    });
    const sign = (claims: Record<string, unknown> = { email: "Person@Example.com" }, opts: { issuer?: string; audience?: string; expires?: string; key?: CryptoKey } = {}) =>
      new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: "access-key" }).setIssuedAt()
        .setIssuer(opts.issuer ?? `https://${domain}`).setAudience(opts.audience ?? "aud").setExpirationTime(opts.expires ?? "5m")
        .sign(opts.key ?? privateKey);
    const call = (token: string) => authenticate(new Request("https://app.bnt.hm/api/data", { headers: { "Cf-Access-Jwt-Assertion": token } }),
      { ACCESS_TEAM_DOMAIN: domain, ACCESS_AUD: "aud" });
    return { domain, sign, call, requested };
  }

  it("accepts a valid token from the team's own keys and returns the lowercased email", async () => {
    const t = await team();
    expect(await t.call(await t.sign())).toBe("person@example.com");
    expect(t.requested).toEqual([`https://${t.domain}/cdn-cgi/access/certs`]);
  });

  it.each([
    ["another application's audience", { audience: "other-app" }],
    ["another team's issuer", { issuer: "https://elsewhere.cloudflareaccess.com" }],
    ["an expired token", { expires: "-1m" }],
  ] as const)("rejects %s", async (_label, opts) => {
    const t = await team();
    await expect(t.call(await t.sign(undefined, opts))).rejects.toThrow(/Invalid Access token/);
  });

  it("rejects a token signed by a key the team did not publish", async () => {
    const t = await team();
    const { privateKey: forged } = await generateKeyPair("RS256");
    await expect(t.call(await t.sign(undefined, { key: forged }))).rejects.toThrow(/Invalid Access token/);
  });

  it("identify returns the verified email, issuer and subject", async () => {
    const t = await team();
    const token = await t.sign({ email: "Person@Example.com", sub: "user-123" });
    const who = await identify(new Request("https://app.bnt.hm/api/data", { headers: { "Cf-Access-Jwt-Assertion": token } }), { ACCESS_TEAM_DOMAIN: t.domain, ACCESS_AUD: "aud" });
    expect(who).toEqual({ email: "person@example.com", issuer: `https://${t.domain}`, subject: "user-123" });
  });

  it("identify gives a null subject when the token has none", async () => {
    const t = await team();
    const who = await identify(new Request("https://app.bnt.hm/", { headers: { "Cf-Access-Jwt-Assertion": await t.sign() } }), { ACCESS_TEAM_DOMAIN: t.domain, ACCESS_AUD: "aud" });
    expect(who.subject).toBeNull();
  });

  it("rejects a verified token without an email", async () => {
    const t = await team();
    await expect(t.call(await t.sign({ sub: "service-token" }))).rejects.toThrow(/no email/);
  });
});
