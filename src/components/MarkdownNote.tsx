import type { JSX } from "@solidjs/web";
import { Markdown } from "comark-solid";
import { Loading } from "solid-js";
import type { ParentProps } from "solid-js";
import { MARKDOWN_NOTE_OPTIONS } from "../lib/markdown";

interface NoteLinkProps extends ParentProps {
  href?: string;
  title?: string;
}

function NoteLink(props: NoteLinkProps) {
  if (!props.href) {
    return <span>{props.children}</span>;
  }
  return (
    <a
      href={props.href}
      title={props.title}
      target="_blank"
      rel="noopener noreferrer"
    >
      {props.children}
    </a>
  );
}

const NOTE_COMPONENTS = {
  a: NoteLink,
};

export interface MarkdownNoteProps {
  value: string;
  class?: JSX.ClassValue;
  streaming?: boolean;
}

export function MarkdownNote(props: MarkdownNoteProps) {
  return (
    <Loading fallback={<div class={["markdown-note", props.class]}>{props.value}</div>}>
      <Markdown
        value={props.value}
        options={MARKDOWN_NOTE_OPTIONS}
        components={NOTE_COMPONENTS}
        streaming={props.streaming}
        class={["markdown-note", props.class]}
      />
    </Loading>
  );
}
