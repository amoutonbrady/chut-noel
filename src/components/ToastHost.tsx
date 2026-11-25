import {
  createContext,
  createMemo,
  createSignal,
  createUniqueId,
  For,
  onSettled,
  Show,
} from "solid-js";
import type { ParentComponent } from "solid-js";
import {
  announceLive,
  closeTopLayer,
  ensurePopoverPolyfill,
  hasOpenModalDialog,
} from "../lib/topLayer";

export type ToastTone = "info" | "success" | "warning" | "error" | "festive";

export interface ToastInput {
  message: string;
  tone?: ToastTone;
  durationMs?: number;
}

export interface ToastRecord {
  id: string;
  message: string;
  tone: ToastTone;
  durationMs: number;
}

export interface ToastApi {
  push: (input: string | ToastInput) => void;
  dismiss: (id: string) => void;
}

export const ToastContext = createContext<ToastApi>();

const TONE_ICONS: Record<ToastTone, string> = {
  info: "✨",
  success: "🎁",
  warning: "🔔",
  error: "⚠️",
  festive: "🎄",
};

interface ToastItemProps {
  toast: ToastRecord;
  index: number;
  onRemove: (id: string) => void;
}

function ToastItem(props: ToastItemProps) {
  const popoverId = `toast-${createUniqueId()}`;
  const startsWithEmoji = createMemo(() =>
    /^\p{Extended_Pictographic}/u.test(props.toast.message.trim()),
  );
  let elRef: HTMLDivElement | undefined;
  let timerId: number | undefined;
  let remainingMs = 4200;
  let startedAt = 0;
  let paused = false;

  const clearTimer = () => {
    if (timerId !== undefined) {
      window.clearTimeout(timerId);
      timerId = undefined;
    }
  };

  const dismiss = () => {
    clearTimer();
    const el = elRef;
    if (!el) {
      props.onRemove(props.toast.id);
      return;
    }
    try {
      closeTopLayer(el);
    } catch {
      props.onRemove(props.toast.id);
    }
    window.setTimeout(() => {
      if (elRef && !elRef.matches(":popover-open")) {
        props.onRemove(props.toast.id);
      }
    }, 340);
  };

  const startTimer = () => {
    if (paused || remainingMs <= 0) {
      return;
    }
    clearTimer();
    startedAt = Date.now();
    timerId = window.setTimeout(dismiss, remainingMs);
  };

  const pauseTimer = () => {
    if (paused) return;
    paused = true;
    if (timerId !== undefined) {
      const elapsed = Date.now() - startedAt;
      remainingMs = Math.max(800, remainingMs - elapsed);
      clearTimer();
    }
  };

  const resumeTimer = () => {
    if (!paused) return;
    paused = false;
    startTimer();
  };

  onSettled(() => {
    let active = true;
    remainingMs = props.toast.durationMs;
    void ensurePopoverPolyfill().then(() => {
      if (!active || !elRef || !elRef.isConnected) return;
      if (hasOpenModalDialog()) {
        props.onRemove(props.toast.id);
        return;
      }
      try {
        elRef.showPopover();
      } catch {
        // Already open or unsupported
      }
      startTimer();
    });

    return () => {
      active = false;
      clearTimer();
      if (elRef) {
        try {
          elRef.hidePopover();
        } catch {
          // Ignore when detached
        }
      }
    };
  });

  return (
    <div
      id={popoverId}
      ref={(el) => {
        elRef = el;
      }}
      popover="manual"
      class={[
        "toast-item",
        {
          "toast-item--success": props.toast.tone === "success",
          "toast-item--error":
            props.toast.tone === "error" || props.toast.tone === "warning",
          "toast-item--festive":
            props.toast.tone === "festive" || props.toast.tone === "info",
        },
      ]}
      style={{ bottom: `${1 + props.index * 4.25}rem` }}
      onToggle={(e) => {
        if (e.newState === "closed") {
          clearTimer();
          props.onRemove(props.toast.id);
        }
      }}
      onFocusIn={pauseTimer}
      onFocusOut={(e) => {
        const next = e.relatedTarget as Node | null;
        if (!elRef?.contains(next)) {
          resumeTimer();
        }
      }}
      onPointerEnter={pauseTimer}
      onPointerLeave={() => {
        if (!elRef?.contains(document.activeElement)) {
          resumeTimer();
        }
      }}
    >
      <span class="toast-content">
        <Show when={!startsWithEmoji()}>
          <span aria-hidden="true">{TONE_ICONS[props.toast.tone]} </span>
        </Show>
        {props.toast.message}
      </span>
      <button
        type="button"
        class="toast-close"
        popovertarget={popoverId}
        popovertargetaction="hide"
        aria-label="Fermer la notification"
      >
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  );
}

export const ToastProvider: ParentComponent = (props) => {
  const [toasts, setToasts] = createSignal<ToastRecord[]>([]);
  let liveRegionRef: HTMLDivElement | undefined;
  let counter = 0;

  onSettled(() => {
    void ensurePopoverPolyfill();
  });

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  };

  const push = (input: string | ToastInput) => {
    const normalized: ToastInput =
      typeof input === "string" ? { message: input } : input;
    const message = normalized.message.trim();
    if (!message) return;

    // Defer one frame so any modal closing in the same event handler finishes flushing
    window.requestAnimationFrame(() => {
      if (hasOpenModalDialog()) {
        announceLive(message, "normal", liveRegionRef);
        return;
      }

      counter += 1;
      const record: ToastRecord = {
        id: `t-${Date.now()}-${counter}`,
        message,
        tone: normalized.tone ?? "festive",
        durationMs: normalized.durationMs ?? 4200,
      };

      setToasts((prev) => [...prev.slice(-2), record]);
      announceLive(message, "normal", liveRegionRef);
    });
  };

  const dismiss = (id: string) => {
    removeToast(id);
  };

  return (
    <ToastContext value={{ push, dismiss }}>
      {props.children}
      <div class="toast-region" role="region" aria-label="Notifications">
        <div
          ref={(el) => {
            liveRegionRef = el;
          }}
          class="visually-hidden"
          aria-live="polite"
          aria-atomic="true"
        />
        <For each={toasts()}>
          {(toast, index) => (
            <ToastItem toast={toast} index={index()} onRemove={removeToast} />
          )}
        </For>
      </div>
    </ToastContext>
  );
};
