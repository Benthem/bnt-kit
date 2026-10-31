// Compiled from src/preact.ts by scripts/build.mjs. Do not edit.
import { useEffect, useState } from "preact/hooks";
import { onSignInNeeded } from "./client.js";
function useSignInNeeded() {
  const [needed, setNeeded] = useState(false);
  useEffect(() => onSignInNeeded(() => setNeeded(true)), []);
  return needed;
}
export {
  useSignInNeeded
};
