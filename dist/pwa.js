// Compiled from src/pwa.ts by scripts/build.mjs. Do not edit.
import { useEffect, useState } from "preact/hooks";
let applying = false;
function useUpdateAvailable(options = {}) {
  const { readNotes, enabled = true } = options;
  const [waiting, setWaiting] = useState(null);
  const [info, setInfo] = useState({ loading: Boolean(readNotes), notes: null });
  useEffect(() => {
    if (!waiting || !readNotes) return;
    setInfo({ loading: true, notes: null });
    const channel = new MessageChannel();
    const timer = setTimeout(() => setInfo({ loading: false, notes: null }), 2e3);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      setInfo({ loading: false, notes: readNotes(event.data) });
    };
    try {
      waiting.postMessage({ type: "release-notes" }, [channel.port2]);
    } catch {
      clearTimeout(timer);
      setInfo({ loading: false, notes: null });
    }
    return () => {
      clearTimeout(timer);
      channel.port1.close();
      channel.port2.close();
    };
  }, [waiting]);
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !enabled) return;
    let reloading = false;
    const hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading || !(hadController || applying)) return;
      reloading = true;
      location.reload();
    });
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        sw?.addEventListener("statechange", () => {
          if (sw.state === "installed" && navigator.serviceWorker.controller) setWaiting(sw);
        });
      });
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void reg.update().catch(() => {
        });
      });
    }).catch((e) => console.warn("service worker registration failed", e));
  }, []);
  return [
    waiting ? info : null,
    () => {
      applying = true;
      waiting?.postMessage("skip-waiting");
    }
  ];
}
async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) return "unsupported";
    if (await navigator.storage.persisted()) return "persisted";
    return await navigator.storage.persist() ? "persisted" : "not granted";
  } catch (e) {
    return `error: ${e.message}`;
  }
}
export {
  requestPersistence,
  useUpdateAvailable
};
