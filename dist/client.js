// Compiled from src/client.ts by scripts/build.mjs. Do not edit.
class SignInNeeded extends Error {
  constructor() {
    super("Your login has expired.");
    this.name = "SignInNeeded";
  }
}
class ServerError extends Error {
  status;
  constructor(status) {
    super("The server couldn't finish this. Try again in a moment.");
    this.name = "ServerError";
    this.status = status;
  }
}
class Offline extends Error {
  constructor() {
    super("No connection. Try again when you are online.");
    this.name = "Offline";
  }
}
const SIGN_IN_EVENT = "bnt:sign-in";
function signInNeeded() {
  dispatchEvent(new Event(SIGN_IN_EVENT));
  return new SignInNeeded();
}
async function accessFetch(input, init = {}) {
  let res;
  try {
    res = await fetch(input, { credentials: "same-origin", ...init });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw navigator.onLine ? signInNeeded() : new Offline();
  }
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("application/json") && (res.redirected || type.includes("text/html"))) {
    if (res.status >= 500 && !res.redirected) throw new ServerError(res.status);
    throw signInNeeded();
  }
  return res;
}
async function readJson(res) {
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) {
    if (res.status >= 500 && !res.redirected) throw new ServerError(res.status);
    if (res.redirected || type.includes("text/html")) throw signInNeeded();
    throw new Error(`Unexpected answer (${res.status}).`);
  }
  return await res.json();
}
const SIGN_IN_PARAM = "signin";
function signIn() {
  location.replace(`/?${SIGN_IN_PARAM}=${Date.now()}${location.hash}`);
}
function forgetSignInMarker() {
  if (new URLSearchParams(location.search).has(SIGN_IN_PARAM)) history.replaceState(null, "", `/${location.hash}`);
}
function onSignInNeeded(listener) {
  addEventListener(SIGN_IN_EVENT, listener);
  return () => removeEventListener(SIGN_IN_EVENT, listener);
}
export {
  Offline,
  SIGN_IN_EVENT,
  SIGN_IN_PARAM,
  ServerError,
  SignInNeeded,
  accessFetch,
  forgetSignInMarker,
  onSignInNeeded,
  readJson,
  signIn,
  signInNeeded
};
