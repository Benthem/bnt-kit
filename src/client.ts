// The board side of talking to a Worker behind Cloudflare Access. When the
// Access session has expired, Access answers every request with a redirect to
// its login page on another domain: fetch either fails outright (the browser
// will not hand a cross-origin page to the app) or comes back as HTML. Both
// mean "sign in again", not "no connection" or "bad answer".

import { useEffect, useState } from "preact/hooks";

/** Thrown when Access wants a new login. */
export class SignInNeeded extends Error {
  constructor() { super("Your login has expired."); this.name = "SignInNeeded"; }
}

/**
 * Thrown when Cloudflare answers with its own error page (status 500 and up),
 * e.g. when the Worker ran out of CPU time: not a login problem.
 */
export class ServerError extends Error {
  readonly status: number;
  constructor(status: number) { super("The server couldn't finish this. Try again in a moment."); this.name = "ServerError"; this.status = status; }
}

/** Thrown when the network is down. */
export class Offline extends Error {
  constructor() { super("No connection. Try again when you are online."); this.name = "Offline"; }
}

/** Fired on window whenever a request finds the login expired. */
export const SIGN_IN_EVENT = "bnt:sign-in";

/**
 * Reports an expired login (shows the app's "Sign in again") and returns the
 * error to throw. For code that reads responses itself.
 */
export function signInNeeded(): SignInNeeded {
  dispatchEvent(new Event(SIGN_IN_EVENT));
  return new SignInNeeded();
}

/**
 * fetch that turns Access's expired-login answers into SignInNeeded and a
 * dead network into Offline. Other responses are returned as they are.
 */
export async function accessFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(input, { credentials: "same-origin", ...init });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    // Online but unreachable: the redirect to the login page was refused.
    throw navigator.onLine ? signInNeeded() : new Offline();
  }
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("application/json") && (res.redirected || type.includes("text/html"))) {
    // Cloudflare's own error pages are HTML too; only Access's login is a sign-in.
    if (res.status >= 500 && !res.redirected) throw new ServerError(res.status);
    throw signInNeeded();
  }
  return res;
}

/** True when the response body is JSON; Access's login page never is. */
export async function readJson<T = unknown>(res: Response): Promise<T> {
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) {
    if (res.status >= 500 && !res.redirected) throw new ServerError(res.status);
    if (res.redirected || type.includes("text/html")) throw signInNeeded();
    throw new Error(`Unexpected answer (${res.status}).`);
  }
  return (await res.json()) as T;
}

/** The query parameter that marks a sign-in page load; the service worker leaves those alone. */
export const SIGN_IN_PARAM = "signin";

/**
 * A plain page load past the service worker, so Access can run its login and
 * come back to where the person was.
 */
export function signIn(): void {
  location.replace(`/?${SIGN_IN_PARAM}=${Date.now()}${location.hash}`);
}

/** Call once at startup: removes the sign-in marker from the address. */
export function forgetSignInMarker(): void {
  if (new URLSearchParams(location.search).has(SIGN_IN_PARAM)) history.replaceState(null, "", `/${location.hash}`);
}

/** True once any request found the login expired; show a "Sign in again" button. */
export function useSignInNeeded(): boolean {
  const [needed, setNeeded] = useState(false);
  useEffect(() => {
    const on = () => setNeeded(true);
    addEventListener(SIGN_IN_EVENT, on);
    return () => removeEventListener(SIGN_IN_EVENT, on);
  }, []);
  return needed;
}
