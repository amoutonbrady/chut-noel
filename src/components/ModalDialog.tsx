import { createEffect, createUniqueId, onSettled, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import { CloseIcon } from "./Icons";

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
      class={["modal-dialog", { "modal-dialog--sm": props.size === "sm" }]}
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
      <header class="modal-header">
        <div class="modal-heading">
          <h2 id={titleId} class="modal-title">
            {props.title}
          </h2>
          <Show when={props.subtitle}>
            {(sub) => <p class="modal-subtitle">{sub()}</p>}
          </Show>
        </div>
        <button
          type="button"
          class="icon-btn"
          aria-label="Fermer"
          disabled={!dismissible()}
          onClick={closeDialog}
        >
          <CloseIcon size={16} />
        </button>
      </header>
      <div class="modal-body">{props.children}</div>
    </dialog>
  );
}
