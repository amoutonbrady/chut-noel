import { omit, Show } from "solid-js";
import type { JSX } from "@solidjs/web";

export function Panel(props: JSX.HTMLAttributes<HTMLElement>) {
  const rest = omit(props, "class");
  return (
    <section
      class={[
        "bg-card rounded-lg shadow-card p-5.5 sm:p-7 contrast-more:border contrast-more:border-line-strong forced-colors:border forced-colors:border-canvas-text",
        props.class,
      ]}
      {...rest}
    />
  );
}

export interface EmptyStateProps {
  icon: JSX.Element;
  title: string;
  description: string;
  tone?: "default" | "error";
  headingLevel?: "h1" | "h2" | "h3";
  role?: "alert";
  reveal?: boolean;
  action?: JSX.Element;
}

export function EmptyState(props: EmptyStateProps) {
  const titleClass =
    "m-0 font-display text-heading font-semibold tracking-tight text-balance text-ink";

  return (
    <section
      role={props.role}
      class={[
        "max-w-empty mx-auto my-8 px-7 py-9 bg-card rounded-lg shadow-card flex flex-col items-center text-center gap-2.5 contrast-more:border contrast-more:border-line-strong forced-colors:border forced-colors:border-canvas-text",
        { "reveal-soft": Boolean(props.reveal) },
      ]}
    >
      <span
        aria-hidden="true"
        class={[
          "size-12 rounded-icon inline-flex items-center justify-center mb-1",
          props.tone === "error"
            ? "bg-danger-soft text-danger-soft-foreground"
            : "bg-accent-soft text-accent-soft-foreground",
        ]}
      >
        {props.icon}
      </span>

      {props.headingLevel === "h1" ? (
        <h1 class={titleClass}>{props.title}</h1>
      ) : props.headingLevel === "h3" ? (
        <h3 class={titleClass}>{props.title}</h3>
      ) : (
        <h2 class={titleClass}>{props.title}</h2>
      )}

      <p class="m-0 text-body text-ink-muted max-w-empty-desc text-pretty">
        {props.description}
      </p>

      <Show when={props.action}>
        {(slot) => <div class="mt-2">{slot()}</div>}
      </Show>
    </section>
  );
}
