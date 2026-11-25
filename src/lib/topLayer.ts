let popoverPolyfillPromise: Promise<void> | null = null;

export function ensurePopoverPolyfill(): Promise<void> {
  if (typeof HTMLElement === "undefined") {
    return Promise.resolve();
  }
  if (Object.hasOwn(HTMLElement.prototype, "popover")) {
    return Promise.resolve();
  }
  if (!popoverPolyfillPromise) {
    popoverPolyfillPromise = import("@oddbird/popover-polyfill")
      .then(() => undefined)
      .catch(() => undefined);
  }
  return popoverPolyfillPromise;
}

export function isClosedBySupported(): boolean {
  return (
    typeof HTMLDialogElement !== "undefined" &&
    "closedBy" in HTMLDialogElement.prototype
  );
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

let cachedCanTransitionDisplay: boolean | null = null;

/**
 * Runtime DOM probe for real `transition-behavior: allow-discrete` on `display`
 * (works around Firefox bug 1882408 where CSS.supports alone can false-positive).
 */
export function canTransitionDisplay(): boolean {
  if (cachedCanTransitionDisplay !== null) {
    return cachedCanTransitionDisplay;
  }
  if (
    typeof document === "undefined" ||
    typeof CSS === "undefined" ||
    typeof CSS.supports !== "function" ||
    !CSS.supports("transition-behavior", "allow-discrete")
  ) {
    cachedCanTransitionDisplay = false;
    return false;
  }

  const host = document.body ?? document.documentElement;
  if (!host) {
    return false;
  }

  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;inset:0;width:0;height:0;opacity:0;pointer-events:none;display:block;transition-property:display;transition-duration:10ms;transition-behavior:allow-discrete;";
  try {
    host.appendChild(probe);
    void getComputedStyle(probe).display;
    probe.style.display = "none";
    cachedCanTransitionDisplay = getComputedStyle(probe).display === "block";
  } catch {
    cachedCanTransitionDisplay = false;
  } finally {
    probe.remove();
  }
  return cachedCanTransitionDisplay;
}

export function supportsDiscreteTopLayerTransitions(): boolean {
  if (typeof CSS === "undefined" || typeof CSS.supports !== "function") {
    return false;
  }
  return CSS.supports("overlay", "auto") && canTransitionDisplay();
}

export function hasOpenModalDialog(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  try {
    return Boolean(document.querySelector("dialog[open]:modal:not([data-closing])"));
  } catch {
    return Boolean(document.querySelector("dialog[open]:not([data-closing])"));
  }
}

export function isPointOutsideDialog(
  dialog: HTMLDialogElement,
  clientX: number,
  clientY: number,
): boolean {
  const rect = dialog.getBoundingClientRect();
  return (
    clientX < rect.left ||
    clientX > rect.right ||
    clientY < rect.top ||
    clientY > rect.bottom
  );
}

export function isClickOutsideDialog(
  dialog: HTMLDialogElement,
  event: MouseEvent,
): boolean {
  if (event.detail === 0 && event.clientX === 0 && event.clientY === 0) {
    return false;
  }
  return isPointOutsideDialog(dialog, event.clientX, event.clientY);
}

function isPopoverOpen(el: HTMLElement): boolean {
  try {
    if (el.matches(":popover-open")) {
      return true;
    }
  } catch {
    // Fallback for polyfilled environments without native :popover-open selector
  }
  return el.classList.contains(":popover-open");
}

function runFallbackExit(
  el: HTMLElement,
  finish: () => void,
  timeoutMs = 260,
): void {
  if (el.hasAttribute("data-closing")) {
    return;
  }
  el.setAttribute("data-closing", "");
  let done = false;

  const complete = () => {
    if (done) return;
    done = true;
    el.removeEventListener("transitionend", onEnd);
    window.clearTimeout(timer);
    el.removeAttribute("data-closing");
    finish();
  };

  const onEnd = (event: TransitionEvent) => {
    if (event.target === el) {
      complete();
    }
  };

  el.addEventListener("transitionend", onEnd);
  const timer = window.setTimeout(complete, timeoutMs);
}

export function closeTopLayer(
  el: HTMLDialogElement | HTMLElement,
  returnValue?: string,
): void {
  if (typeof HTMLDialogElement !== "undefined" && el instanceof HTMLDialogElement) {
    if (!el.open) {
      return;
    }
    const doClose = () => {
      if (el.open) {
        if (returnValue !== undefined) {
          el.close(returnValue);
        } else {
          el.close();
        }
      }
    };
    if (prefersReducedMotion() || supportsDiscreteTopLayerTransitions()) {
      doClose();
    } else {
      runFallbackExit(el, doClose);
    }
    return;
  }

  if (!isPopoverOpen(el)) {
    return;
  }
  const doHide = () => {
    try {
      el.hidePopover();
    } catch {
      // Already closed or detached
    }
  };
  if (prefersReducedMotion() || supportsDiscreteTopLayerTransitions()) {
    doHide();
  } else {
    runFallbackExit(el, doHide);
  }
}

type DocumentWithAriaNotify = Document & {
  ariaNotify?: (message: string, options?: { priority?: "normal" | "high" }) => void;
};

export function announceLive(
  message: string,
  priority: "normal" | "high" = "normal",
  fallbackEl?: HTMLElement | null,
): void {
  if (typeof document === "undefined") {
    return;
  }
  const doc = document as DocumentWithAriaNotify;
  if (typeof doc.ariaNotify === "function") {
    try {
      doc.ariaNotify(message, { priority });
      return;
    } catch {
      // Fall through to live region
    }
  }
  if (!fallbackEl) {
    return;
  }
  fallbackEl.textContent = "";
  window.requestAnimationFrame(() => {
    fallbackEl.textContent = message;
  });
}
