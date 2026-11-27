import { createContext, createSignal, onSettled, Show } from "solid-js";
import type { ParentComponent } from "solid-js";
import { AlertIcon, CheckIcon, CloseIcon } from "./Icons";

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
      <div class="toast-region" role="status" aria-live="polite" aria-atomic="true">
        <Show when={toast()}>
          {(current) => (
            <div
              class={[
                "toast-pill",
                `toast-pill--${current().tone}`,
                { "is-leaving": leaving() },
              ]}
              onPointerEnter={clearTimer}
              onPointerLeave={startTimer}
            >
              <span class="toast-icon" aria-hidden="true">
                {current().tone === "error" ? (
                  <AlertIcon size={15} />
                ) : (
                  <CheckIcon size={15} />
                )}
              </span>
              <span class="toast-text">{current().message}</span>
              <button
                type="button"
                class="toast-dismiss"
                aria-label="Fermer la notification"
                onClick={clear}
              >
                <CloseIcon size={14} />
              </button>
            </div>
          )}
        </Show>
      </div>
    </ToastContext>
  );
};
