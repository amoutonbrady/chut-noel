import { createContext, createSignal, onSettled, Show } from "solid-js";
import type { ParentComponent } from "solid-js";
import { AlertIcon, CheckIcon, CloseIcon } from "./Icons";
import { IconButton } from "./ui/Button";

export type ToastTone = "info" | "success" | "error";

export interface ToastState {
  id: number;
  message: string;
  tone: ToastTone;
}

export interface ToastApi {
  show: (message: string, tone?: ToastTone) => void;
  clear: () => void;
}

export const ToastContext = createContext<ToastApi>();

const TONE_ICON_CLASS: Record<ToastTone, string> = {
  success: "text-ok-foreground",
  info: "text-accent",
  error: "text-danger",
};

export const ToastProvider: ParentComponent = (props) => {
  const [toast, setToast] = createSignal<ToastState | null>(null);
  const [leaving, setLeaving] = createSignal(false);
  let seq = 0;
  let timer: number | undefined;
  let exitTimer: number | undefined;

  const clearTimer = () => {
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timer = undefined;
    }
  };

  // Play the short exit animation before unmounting
  const clear = () => {
    clearTimer();
    window.clearTimeout(exitTimer);
    setLeaving(true);
    exitTimer = window.setTimeout(() => {
      setToast(null);
      setLeaving(false);
    }, 150);
  };

  const startTimer = () => {
    clearTimer();
    timer = window.setTimeout(clear, 3800);
  };

  const show = (message: string, tone: ToastTone = "success") => {
    const trimmed = message.trim();
    if (!trimmed) return;
    seq += 1;
    window.clearTimeout(exitTimer);
    setLeaving(false);
    setToast({ id: seq, message: trimmed, tone });
    startTimer();
  };

  onSettled(() => () => {
    clearTimer();
    window.clearTimeout(exitTimer);
  });

  return (
    <ToastContext value={{ show, clear }}>
      {props.children}
      <div
        class="fixed left-1/2 bottom-safe -translate-x-1/2 z-50 pointer-events-none w-max max-w-toast"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <Show when={toast()}>
          {(current) => (
            <div
              class={[
                "toast-pill pointer-events-auto flex items-center gap-2.5 py-2 pr-2 pl-4 rounded-md bg-card text-ink border shadow-overlay text-sm font-medium contrast-more:border-line-strong forced-colors:border-canvas-text",
                current().tone === "error" ? "border-danger-border" : "border-line-subtle",
                { "is-leaving": leaving() },
              ]}
              onPointerEnter={clearTimer}
              onPointerLeave={startTimer}
            >
              <span
                class={["inline-flex items-center shrink-0", TONE_ICON_CLASS[current().tone]]}
                aria-hidden="true"
              >
                {current().tone === "error" ? (
                  <AlertIcon size={15} />
                ) : (
                  <CheckIcon size={15} />
                )}
              </span>
              <span>{current().message}</span>
              <IconButton
                size="sm"
                aria-label="Fermer la notification"
                onClick={clear}
              >
                <CloseIcon size={14} />
              </IconButton>
            </div>
          )}
        </Show>
      </div>
    </ToastContext>
  );
};
