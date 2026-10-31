// Preact hooks over bnt-kit/client.

import { useEffect, useState } from "preact/hooks";
import { onSignInNeeded } from "./client.js";

/** True once any request found the login expired; show a "Sign in again" button. */
export function useSignInNeeded(): boolean {
  const [needed, setNeeded] = useState(false);
  useEffect(() => onSignInNeeded(() => setNeeded(true)), []);
  return needed;
}
