import { parseMarkdown } from "comark";
import type { ParserOptions } from "comark";
import breaks from "comark/plugins/breaks";
import linkify from "comark/plugins/linkify";
import security from "comark/plugins/security";
import taskList from "comark/plugins/task-list";

const ALLOWED_NOTE_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "del",
  "s",
  "code",
  "pre",
  "a",
  "ul",
  "ol",
  "li",
  "blockquote",
  "hr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "input",
  "span",
];

export const MARKDOWN_NOTE_OPTIONS: ParserOptions = {
  registerDefaultPlugins: false,
  headingIds: false,
  autoClose: true,
  plugins: [
    breaks(),
    linkify(),
    taskList(),
    security({
      allowedTags: ALLOWED_NOTE_TAGS,
      allowedProtocols: ["http", "https", "mailto"],
    }),
  ],
};

export function parseMarkdownNote(source: string) {
  return parseMarkdown(source, MARKDOWN_NOTE_OPTIONS);
}
