// Compiled from src/auth.ts by scripts/build.mjs. Do not edit.
import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";
class AuthError extends Error {
}
const jwksCache = /* @__PURE__ */ new Map();
function jwks(teamDomain) {
  let set = jwksCache.get(teamDomain);
  if (!set) {
    set = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
    jwksCache.set(teamDomain, set);
  }
  return set;
}
function setupHint(token) {
  if (!token) return "";
  try {
    const { aud, iss } = decodeJwt(token);
    return `. This request came through Access with aud=${JSON.stringify(aud)} iss=${JSON.stringify(iss)}`;
  } catch {
    return "";
  }
}
async function authenticate(request, env) {
  const host = new URL(request.url).hostname;
  if (env.DEV_USER_EMAIL && (host === "localhost" || host === "127.0.0.1")) {
    return env.DEV_USER_EMAIL;
  }
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    throw new AuthError(`Access is not configured (ACCESS_TEAM_DOMAIN / ACCESS_AUD)${setupHint(token)}`);
  }
  if (!token) throw new AuthError("Missing Cf-Access-Jwt-Assertion; request did not come through Access");
  let email;
  try {
    const { payload } = await jwtVerify(token, jwks(env.ACCESS_TEAM_DOMAIN), {
      issuer: `https://${env.ACCESS_TEAM_DOMAIN}`,
      audience: env.ACCESS_AUD
    });
    email = payload.email;
  } catch (e) {
    throw new AuthError(`Invalid Access token: ${e.message}`);
  }
  if (typeof email !== "string") throw new AuthError("Access token has no email");
  return email.toLowerCase();
}
export {
  AuthError,
  authenticate
};
