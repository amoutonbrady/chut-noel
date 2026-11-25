import { createEffect, createUniqueId, onSettled, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import {
  closeTopLayer,
  isClosedBySupported,
  isPointOutsideDialog,
} from "../lib/topLayer";

export interface ModalDialogProps {
  open: boolean;
  title: string;
  subtitle?: string;
  size?: "sm" | "md" | "lg";
  closeLabel?: string;
  onClose: () => void;
  children?: JSX.Element;
}

export function ModalDialog(props: ModalDialogProps) {
  const titleId = createUniqueId();
  let dialogRef: HTMLDialogElement | undefined;
  let pointerDownOutside = false;

  createEffect(
    () => props.open,
    (isOpen) => {
      const el = dialogRef;
      if (!el || !el.isConnected) {
        return;
      }
      if (isOpen) {
        if (!el.open) {
          el.showModal();
        }
      } else if (el.open) {
        closeTopLayer(el);
      }
    },
  );

  onSettled(() => {
    const el = dialogRef;
    if (el && props.open && !el.open) {
      el.showModal();
    }
    return () => {
      if (dialogRef?.open) {
        dialogRef.close();
      }
    };
  });

  const handleCloseRequest = () => {
    if (dialogRef) {
      closeTopLayer(dialogRef);
    }
  };

  return (
    <dialog
      ref={(el) => {
        dialogRef = el;
      }}
      class="modal-dialog"
      style={props.size === "sm" ? { width: "min(440px, calc(100vw - 1.5rem))" } : undefined}
      aria-labelledby={titleId}
      {...({ closedby: "any" } as Record<string, unknown>)}
      onCancel={(e) => {
        e.preventDefault();
        handleCloseRequest();
      }}
      onClose={() => {
        pointerDownOutside = false;
        if (dialogRef) {
          dialogRef.returnValue = "";
        }
        props.onClose();
      }}
      onPointerDown={(e) => {
        if (!isClosedBySupported() && dialogRef && e.button === 0) {
          pointerDownOutside = isPointOutsideDialog(
            dialogRef,
            e.clientX,
            e.clientY,
          );
        } else {
          pointerDownOutside = false;
        }
      }}
      onPointerUp={(e) => {
        if (
          !isClosedBySupported() &&
          pointerDownOutside &&
          dialogRef &&
          isPointOutsideDialog(dialogRef, e.clientX, e.clientY)
        ) {
          pointerDownOutside = false;
          handleCloseRequest();
          return;
        }
        pointerDownOutside = false;
      }}
      onPointerCancel={() => {
        pointerDownOutside = false;
      }}
    >
      <header class="modal-header">
        <div>
          <h1 id={titleId} class="modal-title">
            {props.title}
          </h1>
          <Show when={props.subtitle}>
            {(sub) => <p class="text-muted">{sub()}</p>}
          </Show>
        </div>
        <button
          type="button"
          class="modal-close"
          aria-label={props.closeLabel ?? "Fermer la fenêtre"}
          onClick={handleCloseRequest}
        >
          <span aria-hidden="true">✕</span>
        </button>
      </header>
      <div class="modal-body">{props.children}</div>
    </dialog>
  );
}
