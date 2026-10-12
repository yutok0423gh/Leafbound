export const pwaState = {
  supported: "serviceWorker" in navigator,
  registration: null,
  updateAvailable: false,
  error: null
};

function dispatchStatus() {
  window.dispatchEvent(new CustomEvent("leafbound:pwa-status", { detail: { ...pwaState } }));
}

export async function registerLeafboundServiceWorker() {
  if (!pwaState.supported || !/^https?:$/.test(window.location.protocol)) return null;
  try {
    const serviceWorkerUrl = new URL("../service-worker.js", import.meta.url);
    const registration = await navigator.serviceWorker.register(serviceWorkerUrl, { updateViaCache: "none" });
    pwaState.registration = registration;
    pwaState.updateAvailable = Boolean(registration.waiting && navigator.serviceWorker.controller);
    dispatchStatus();

    registration.addEventListener("updatefound", () => {
      const installing = registration.installing;
      installing?.addEventListener("statechange", () => {
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          pwaState.updateAvailable = true;
          dispatchStatus();
        }
      });
    });
    // Finish upgrading the worker before the application imports its module
    // graph. Otherwise the previous worker can serve obsolete reading logic.
    await registration.update().catch(() => undefined);
    const pending = registration.installing || registration.waiting;
    if (pending) {
      await new Promise((resolve) => {
        const check = () => {
          if (["activated", "redundant"].includes(pending.state)) {
            pending.removeEventListener("statechange", check);
            resolve();
          }
        };
        pending.addEventListener("statechange", check);
        pending.postMessage({ type: "SKIP_WAITING" });
        check();
      });
    }
    return registration;
  } catch (error) {
    pwaState.error = error;
    dispatchStatus();
    return null;
  }
}

export function activateWaitingServiceWorker() {
  const waiting = pwaState.registration?.waiting;
  if (!waiting) return false;
  waiting.postMessage({ type: "SKIP_WAITING" });
  return true;
}

export const pwaReady = registerLeafboundServiceWorker();

