import { createSignal } from "solid-js";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface NavigatorWithInstall extends Navigator {
  install?: (options?: { manifest?: string; manifestId?: string }) => Promise<void>;
  standalone?: boolean;
}

export type InstallOutcome = "installed" | "aborted" | "error" | "unavailable";

const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

const [updateAvailable, setUpdateAvailable] = createSignal(false);
const [updating, setUpdating] = createSignal(false);
const [canInstall, setCanInstall] = createSignal(false);
const [installing, setInstalling] = createSignal(false);

let initialized = false;
let waitingWorker: ServiceWorker | null = null;
let deferredPrompt: BeforeInstallPromptEvent | null = null;

function isStandaloneMode(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as NavigatorWithInstall).standalone === true
  );
}

function supportsWebInstall(): boolean {
  return typeof (Navigator.prototype as NavigatorWithInstall).install === "function";
}

function markUpdateReady(worker: ServiceWorker | null) {
  if (!worker) return;
  waitingWorker = worker;
  setUpdateAvailable(true);
}

export function initPwa(): () => void {
  if (initialized || typeof window === "undefined") {
    return () => {};
  }
  initialized = true;

  const cleanups: Array<() => void> = [];

  // 1. Install capability detection (Web Install API preferred, beforeinstallprompt fallback)
  const webInstallSupported = supportsWebInstall();
  if (webInstallSupported && !isStandaloneMode()) {
    setCanInstall(true);
  }

  const onBeforeInstallPrompt = (event: Event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    if (!webInstallSupported && !isStandaloneMode()) {
      setCanInstall(true);
    }
  };

  const onAppInstalled = () => {
    deferredPrompt = null;
    setCanInstall(false);
  };

  const standaloneQuery = window.matchMedia("(display-mode: standalone)");
  const onDisplayModeChange = (event: MediaQueryListEvent) => {
    if (event.matches) {
      deferredPrompt = null;
      setCanInstall(false);
    }
  };

  window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  window.addEventListener("appinstalled", onAppInstalled);
  standaloneQuery.addEventListener("change", onDisplayModeChange);
  cleanups.push(() => {
    window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.removeEventListener("appinstalled", onAppInstalled);
    standaloneQuery.removeEventListener("change", onDisplayModeChange);
  });

  // 2. Service worker registration & update detection (production builds only)
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;
    let lastCheck = Date.now();

    const onControllerChange = () => {
      // Only reload when replacing an active controller (never on first-ever install)
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    cleanups.push(() => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    });

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });

        if (registration.waiting && navigator.serviceWorker.controller) {
          markUpdateReady(registration.waiting);
        }

        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              markUpdateReady(worker);
            }
          });
        });

        const checkForUpdate = (force = false) => {
          const now = Date.now();
          if (!force && now - lastCheck < UPDATE_CHECK_INTERVAL_MS) return;
          lastCheck = now;
          void registration.update().catch(() => {
            // Offline or transient network error — will retry on next visibility/online event
          });
        };

        const onVisibilityChange = () => {
          if (document.visibilityState === "visible") {
            checkForUpdate();
          }
        };
        const onOnline = () => checkForUpdate(true);

        document.addEventListener("visibilitychange", onVisibilityChange);
        window.addEventListener("online", onOnline);
        cleanups.push(() => {
          document.removeEventListener("visibilitychange", onVisibilityChange);
          window.removeEventListener("online", onOnline);
        });
      } catch (error) {
        console.error("Service worker registration failed:", error);
      }
    };

    if (document.readyState === "complete") {
      void register();
    } else {
      const onLoad = () => void register();
      window.addEventListener("load", onLoad, { once: true });
      cleanups.push(() => window.removeEventListener("load", onLoad));
    }
  }

  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
    initialized = false;
  };
}

export async function triggerInstall(): Promise<InstallOutcome> {
  if (installing()) return "unavailable";
  setInstalling(true);

  try {
    const nav = window.navigator as NavigatorWithInstall;
    if (supportsWebInstall() && typeof nav.install === "function") {
      // Call directly during user activation (click handler)
      await nav.install();
      setCanInstall(false);
      return "installed";
    }

    if (deferredPrompt) {
      // Discard the single-use event before awaiting userChoice
      const promptEvent = deferredPrompt;
      deferredPrompt = null;
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (!deferredPrompt) {
        setCanInstall(false);
      }
      return outcome === "accepted" ? "installed" : "aborted";
    }

    setCanInstall(false);
    return "unavailable";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return "aborted";
    }
    console.error("PWA installation failed:", error);
    return "error";
  } finally {
    setInstalling(false);
  }
}

export function applyPwaUpdate() {
  if (!waitingWorker || updating()) return;
  setUpdating(true);
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- ServiceWorker.postMessage takes no targetOrigin
  waitingWorker.postMessage({ type: "SKIP_WAITING" });
}

export function dismissPwaUpdate() {
  setUpdateAvailable(false);
}

export const pwaState = {
  canInstall,
  installing,
  updateAvailable,
  updating,
};
