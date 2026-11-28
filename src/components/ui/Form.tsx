import { omit, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import { AlertIcon } from "../Icons";

export function Field(props: { children?: JSX.Element; class?: JSX.ClassValue }) {
  return <div class={["flex flex-col gap-1.5 min-w-0", props.class]}>{props.children}</div>;
}

export function FieldLabel(props: {
  for?: string;
  optional?: string;
  children?: JSX.Element;
}) {
  return (
    <label for={props.for} class="text-sm font-semibold text-ink-secondary">
      {props.children}
      <Show when={props.optional}>
        {(opt) => <span class="font-normal text-ink-muted"> {opt()}</span>}
      </Show>
    </label>
  );
}

export interface FieldHintProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  tone?: "default" | "success";
}

export function FieldHint(props: FieldHintProps) {
  const rest = omit(props, "tone", "class");
  return (
    <span
      class={[
        "text-sm",
        props.tone === "success" ? "text-ok-foreground font-medium" : "text-ink-muted",
        props.class,
      ]}
      {...rest}
    />
  );
}

const CONTROL_BASE =
  "w-full px-3.5 py-2.5 rounded-sm border border-line-input bg-card text-ink text-body placeholder:text-ink-placeholder transition duration-150 ease-atelier focus-visible:outline-none focus-visible:border-accent focus-visible:shadow-focus pointer-coarse:text-base";

export function Input(props: JSX.InputHTMLAttributes<HTMLInputElement>) {
  const rest = omit(props, "class");
  return <input class={[CONTROL_BASE, props.class]} {...rest} />;
}

export function Textarea(props: JSX.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const rest = omit(props, "class");
  return (
    <textarea
      class={[CONTROL_BASE, "resize-y min-h-19 leading-snug", props.class]}
      {...rest}
    />
  );
}

export function FormAlert(props: { children?: JSX.Element; class?: JSX.ClassValue }) {
  return (
    <div
      role="alert"
      class={[
        "flex items-start gap-2 px-3.5 py-2.5 rounded-xs bg-danger-soft border border-danger-border text-danger-soft-foreground text-sm",
        props.class,
      ]}
    >
      <AlertIcon size={15} class="shrink-0 mt-0.5" />
      <span>{props.children}</span>
    </div>
  );
}
