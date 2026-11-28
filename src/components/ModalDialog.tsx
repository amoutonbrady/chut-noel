import { createEffect, createUniqueId, onSettled, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import { CloseIcon } from "./Icons";
import { IconButton } from "./ui/Button";

export interface ModalDialogProps {
  open: boolean;
  title: string;
  subtitle?: string;
  size?: "sm" | "md";
  /** False while a request is in flight: Escape, backdrop and × are ignored. */
  dismissible?: boolean;
  onClose: () => void;
  children?: JSX.Element;
}

const supportsClosedBy = (): boolean =>
  typeof HTMLDialogElement !== "undefined" &&
  "closedBy" in HTMLDialogElement.prototype;

const isOutsideDialog = (
  dialog: HTMLDialogElement,
  x: number,
  y: number,
): boolean => {
  const r = dialog.getBoundingClientRect();
  return x < r.left || x > r.right || y < r.top || y > r.bottom;
};

export function ModalDialog(props: ModalDialogProps) {
  const titleId = createUniqueId();
  let dialogRef: HTMLDialogElement | undefined;
  let downOutside = false;

  createEffect(
    () => props.open,
    (isOpen) => {
      const el = dialogRef;
      if (!el || !el.isConnected) return;
      if (isOpen) {
        if (!el.open) el.showModal();
      } else if (el.open) {
        el.close();
      }
    },
  );

  onSettled(() => {
    const el = dialogRef;
    if (el && props.open && !el.open) el.showModal();
    return () => {
      if (dialogRef?.open) dialogRef.close();
    };
  });

  const dismissible = () => props.dismissible !== false;

  const closeDialog = () => {
    if (dismissible() && dialogRef?.open) dialogRef.close();
  };

  return (
    <dialog
      ref={(el) => {
        dialogRef = el;
      }}
      class={[
        "modal-dialog m-auto p-0 max-h-modal border border-line-subtle rounded-lg bg-card text-ink shadow-overlay overflow-hidden open:flex open:flex-col contrast-more:border-line-strong forced-colors:border-canvas-text",
        props.size === "sm" ? "w-modal-sm" : "w-modal-md",
      ]}
      aria-labelledby={titleId}
      aria-busy={dismissible() ? undefined : "true"}
      {...({ closedby: dismissible() ? "any" : "none" } as Record<string, unknown>)}
      onCancel={(e) => {
        // Browsers without closedby still fire cancel on Escape
        if (!dismissible()) e.preventDefault();
      }}
      onClose={() => {
        downOutside = false;
        if (dialogRef) dialogRef.returnValue = "";
        props.onClose();
      }}
      onPointerDown={(e) => {
        // Safari fallback for closedby="any" light-dismiss
        downOutside =
          !supportsClosedBy() &&
          dismissible() &&
          e.button === 0 &&
          Boolean(dialogRef && isOutsideDialog(dialogRef, e.clientX, e.clientY));
      }}
      onPointerUp={(e) => {
        if (
          !supportsClosedBy() &&
          downOutside &&
          dialogRef &&
          isOutsideDialog(dialogRef, e.clientX, e.clientY)
        ) {
          downOutside = false;
          closeDialog();
          return;
        }
        downOutside = false;
      }}
      onPointerCancel={() => {
        downOutside = false;
      }}
    >
      <header class="flex items-start justify-between gap-3 pt-5.5 px-5.5">
        <div class="min-w-0">
          <h2
            id={titleId}
            class="m-0 font-display text-heading font-semibold tracking-tight leading-snug"
          >
            {props.title}
          </h2>
          <Show when={props.subtitle}>
            {(sub) => (
              <p class="mt-1 mb-0 text-sm text-ink-muted truncate">{sub()}</p>
            )}
          </Show>
        </div>
        <IconButton
          class="-mt-1 -mr-1.5"
          aria-label="Fermer"
          disabled={!dismissible()}
          onClick={closeDialog}
        >
          <CloseIcon size={16} />
        </IconButton>
      </header>
      <div class="pt-4.5 px-5.5 pb-5.5 overflow-y-auto overscroll-contain">
        {props.children}
      </div>
    </dialog>
  );
}
