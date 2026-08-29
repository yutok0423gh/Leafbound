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

registerLeafboundServiceWorker();

