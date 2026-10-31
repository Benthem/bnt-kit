// Cloudflare Access sits in front of the whole hostname, and its policy decides
// who gets in. We still verify the Access JWT ourselves on every request:
// trusting the email header is only safe if nothing can reach the Worker
// around Access. Fails closed when not configured.

import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTPayload } from "jose";

export interface AuthEnv {
  ACCESS_TEAM_DOMAIN: string; // e.g. "your-team.cloudflareaccess.com"
  ACCESS_AUD: string; // Application Audience (AUD) tag of the Access app
  DEV_USER_EMAIL?: string; // local dev only, set in .dev.vars
}

export class AuthError extends Error {}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwks(teamDomain: string) {
  let set = jwksCache.get(teamDomain);
  if (!set) {
    set = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
    jwksCache.set(teamDomain, set);
  }
  return set;
}

/**
 * During setup, show the (unverified) AUD of the token Access sent, since the
 * dashboard does not always show it. The AUD is not a secret: every logged-in
 * browser holds it.
 */
function setupHint(token: string | null): string {
  if (!token) return "";
  try {
    const { aud, iss } = decodeJwt(token);
    return `. This request came through Access with aud=${JSON.stringify(aud)} iss=${JSON.stringify(iss)}`;
  } catch {
    return "";
  }
}

/** Who is calling, as verified from the login token. */
export interface Identity {
  /** Lowercased. */
  email: string;
  /** The token's issuer; "local" for the localhost dev bypass. */
  issuer: string;
  /**
   * A stable account id from the issuer, unlike the email, which can change.
   * Null when the token has none. The dev bypass uses the email.
   */
  subject: string | null;
}

/**
 * Returns the verified caller or throws AuthError. Apps get identity only from
 * here, never from the provider's headers or cookies, so the login provider
 * can change in the kit alone (see `authLeaksOf` in bnt-kit/testing/purity).
 */
export async function identify(request: Request, env: AuthEnv): Promise<Identity> {
  const host = new URL(request.url).hostname;
  if (env.DEV_USER_EMAIL && (host === "localhost" || host === "127.0.0.1")) {
    return { email: env.DEV_USER_EMAIL.toLowerCase(), issuer: "local", subject: env.DEV_USER_EMAIL.toLowerCase() };
  }

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    throw new AuthError(`Access is not configured (ACCESS_TEAM_DOMAIN / ACCESS_AUD)${setupHint(token)}`);
  }
  if (!token) throw new AuthError("Missing Cf-Access-Jwt-Assertion; request did not come through Access");

  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, jwks(env.ACCESS_TEAM_DOMAIN), {
      issuer: `https://${env.ACCESS_TEAM_DOMAIN}`,
      audience: env.ACCESS_AUD,
    }));
  } catch (e) {
    throw new AuthError(`Invalid Access token: ${(e as Error).message}`);
  }

  if (typeof payload.email !== "string") throw new AuthError("Access token has no email");
  return {
    email: payload.email.toLowerCase(),
    issuer: String(payload.iss),
    subject: typeof payload.sub === "string" && payload.sub ? payload.sub : null,
  };
}

/** Returns the caller's email or throws AuthError. */
export async function authenticate(request: Request, env: AuthEnv): Promise<string> {
  return (await identify(request, env)).email;
}
