// Service worker registration, update prompt and persistent storage. A new
// build waits until the person taps "update", never mid-edit. The waiting
// worker can describe itself (release notes); apps pass a reader for that.

import { useEffect, useState } from "preact/hooks";

/** Set when the user taps update: the new worker taking over then reloads the page. */
let applying = false;

/** True when a new build is installed and waiting for the user to switch. */
export interface UpdateInfo<Notes> { loading: boolean; notes: Notes | null }

export interface UpdateOptions<Notes> {
  /** Reads the waiting worker's answer to a "release-notes" message; omit when the app has none. */
  readNotes?: (data: unknown) => Notes | null;
  /** Off in development (Vite's dev server has no service worker). */
  enabled?: boolean;
}

export function useUpdateAvailable<Notes = never>(options: UpdateOptions<Notes> = {}): [UpdateInfo<Notes> | null, () => void] {
  const { readNotes, enabled = true } = options;
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [info, setInfo] = useState<UpdateInfo<Notes>>({ loading: Boolean(readNotes), notes: null });
  useEffect(() => {
    if (!waiting || !readNotes) return;
    setInfo({ loading: true, notes: null });
    const channel = new MessageChannel();
    const timer = setTimeout(() => setInfo({ loading: false, notes: null }), 2000);
    channel.port1.onmessage = event => {
      clearTimeout(timer);
      setInfo({ loading: false, notes: readNotes(event.data) });
    };
    try { waiting.postMessage({ type: "release-notes" }, [channel.port2]); }
    catch { clearTimeout(timer); setInfo({ loading: false, notes: null }); }
    return () => { clearTimeout(timer); channel.port1.close(); channel.port2.close(); };
  }, [waiting]);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !enabled) return;
    let reloading = false;
    // The first install claims the page too: that is no update, so no reload.
    const hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading || !(hadController || applying)) return;
      reloading = true;
      location.reload();
    });
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          sw?.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller) setWaiting(sw);
          });
        });
        // Check for a new build when the app comes back to the foreground.
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") void reg.update().catch(() => {});
        });
      })
      .catch((e) => console.warn("service worker registration failed", e));
  }, []);

  return [
    waiting ? info : null,
    () => {
      applying = true;
      waiting?.postMessage("skip-waiting");
    },
  ];
}

/** Ask the browser not to evict our storage (iOS evicts after ~7 days unused otherwise). */
export async function requestPersistence(): Promise<string> {
  try {
    if (!navigator.storage?.persist) return "unsupported";
    if (await navigator.storage.persisted()) return "persisted";
    return (await navigator.storage.persist()) ? "persisted" : "not granted";
  } catch (e) {
    return `error: ${(e as Error).message}`;
  }
}
