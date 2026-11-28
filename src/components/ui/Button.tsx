import { omit } from "solid-js";
import type { JSX } from "@solidjs/web";

export type ButtonVariant =
  | "primary"
  | "group"
  | "secondary"
  | "bookmarklet"
  | "copied"
  | "ghost"
  | "ghost-danger"
  | "subtle"
  | "danger";

export type ButtonSize = "md" | "sm";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 border border-transparent font-semibold leading-snug no-underline whitespace-nowrap cursor-pointer select-none transition duration-150 ease-atelier disabled:opacity-48 disabled:cursor-not-allowed aria-busy:cursor-progress motion-safe:not-disabled:active:scale-97 pointer-coarse:min-h-11 forced-colors:border-canvas-text";

const BUTTON_SIZES: Record<ButtonSize, string> = {
  md: "min-h-10 px-4 py-2 rounded-sm text-body",
  sm: "min-h-9 px-3.5 py-1.5 rounded-btn text-sm",
};

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-foreground border-btn-primary-border shadow-btn-primary not-disabled:hover:bg-accent-hover not-disabled:hover:shadow-btn-primary-hover",
  group:
    "bg-group text-group-foreground border-btn-group-border shadow-btn-group not-disabled:hover:bg-group-hover not-disabled:hover:shadow-btn-group-hover",
  secondary:
    "bg-card text-ink shadow-control-sheen not-disabled:hover:bg-hover",
  bookmarklet:
    "bg-card text-ink border-bookmarklet-border shadow-control-sheen cursor-grab active:cursor-grabbing not-disabled:hover:bg-hover",
  copied:
    "bg-ok text-ok-foreground border-ok-border shadow-none",
  ghost:
    "bg-transparent text-ink-muted not-disabled:hover:bg-hover not-disabled:hover:text-ink",
  "ghost-danger":
    "bg-transparent text-ink-muted not-disabled:hover:bg-danger-soft not-disabled:hover:text-danger-soft-foreground",
  subtle:
    "bg-subtle-btn text-ink-secondary border-line-subtle not-disabled:hover:bg-hover not-disabled:hover:border-line not-disabled:hover:text-ink",
  danger:
    "bg-danger text-danger-foreground border-btn-danger-border shadow-btn-danger not-disabled:hover:bg-danger-hover",
};

export interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button(props: ButtonProps) {
  const rest = omit(props, "variant", "size", "class", "type");
  return (
    <button
      type={props.type ?? "button"}
      class={[
        BUTTON_BASE,
        BUTTON_SIZES[props.size ?? "md"],
        BUTTON_VARIANTS[props.variant ?? "primary"],
        props.class,
      ]}
      {...rest}
    />
  );
}

export interface ButtonLinkProps extends JSX.AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function ButtonLink(props: ButtonLinkProps) {
  const rest = omit(props, "variant", "size", "class", "children");
  return (
    <a
      class={[
        BUTTON_BASE,
        BUTTON_SIZES[props.size ?? "md"],
        BUTTON_VARIANTS[props.variant ?? "ghost"],
        props.class,
      ]}
      {...rest}
    >
      {props.children}
    </a>
  );
}

export interface IconButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "md" | "sm";
}

const ICON_BUTTON_SIZES = {
  md: "size-9 rounded-btn pointer-coarse:size-11",
  sm: "size-7 rounded-full pointer-coarse:size-9",
};

export function IconButton(props: IconButtonProps) {
  const rest = omit(props, "size", "class", "type");
  return (
    <button
      type={props.type ?? "button"}
      class={[
        "shrink-0 p-0 border border-transparent bg-transparent text-ink-muted inline-flex items-center justify-center cursor-pointer transition duration-150 ease-atelier not-disabled:hover:bg-hover not-disabled:hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed motion-safe:not-disabled:active:scale-97",
        ICON_BUTTON_SIZES[props.size ?? "md"],
        props.class,
      ]}
      {...rest}
    />
  );
}
