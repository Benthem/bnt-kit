// Cloudflare Access sits in front of the whole hostname, and its policy decides
// who gets in. We still verify the Access JWT ourselves on every request:
// trusting the email header is only safe if nothing can reach the Worker
// around Access. Fails closed when not configured.

import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";

export interface AuthEnv {
  ACCESS_TEAM_DOMAIN: string; // e.g. "benthem.cloudflareaccess.com"
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

/** Returns the caller's email or throws AuthError. */
export async function authenticate(request: Request, env: AuthEnv): Promise<string> {
  const host = new URL(request.url).hostname;
  if (env.DEV_USER_EMAIL && (host === "localhost" || host === "127.0.0.1")) {
    return env.DEV_USER_EMAIL;
  }

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    throw new AuthError(`Access is not configured (ACCESS_TEAM_DOMAIN / ACCESS_AUD)${setupHint(token)}`);
  }
  if (!token) throw new AuthError("Missing Cf-Access-Jwt-Assertion; request did not come through Access");

  let email: unknown;
  try {
    const { payload } = await jwtVerify(token, jwks(env.ACCESS_TEAM_DOMAIN), {
      issuer: `https://${env.ACCESS_TEAM_DOMAIN}`,
      audience: env.ACCESS_AUD,
    });
    email = payload.email;
  } catch (e) {
    throw new AuthError(`Invalid Access token: ${(e as Error).message}`);
  }

  if (typeof email !== "string") throw new AuthError("Access token has no email");
  return email.toLowerCase();
}
