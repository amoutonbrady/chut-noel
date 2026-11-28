import { describe, expect, it } from "vitest";
import { parseMarkdownNote } from "../src/lib/markdown";

describe("parseMarkdownNote", () => {
  it("parses inline formatting, links, and lists", async () => {
    const doc = await parseMarkdownNote(
      "Taille **M**, *noir mat* — [guide](https://example.com/guide)\n\n- Option 1\n- Option 2",
    );

    expect(doc.nodes).toEqual([
      [
        "p",
        {},
        "Taille ",
        ["strong", {}, "M"],
        ", ",
        ["em", {}, "noir mat"],
        " — ",
        ["a", { href: "https://example.com/guide" }, "guide"],
      ],
      ["ul", {}, ["li", {}, "Option 1"], ["li", {}, "Option 2"]],
    ]);
  });

  it("preserves single line breaks and auto-links bare URLs", async () => {
    const doc = await parseMarkdownNote("Ligne 1\nhttps://example.com");

    expect(doc.nodes).toEqual([
      [
        "p",
        {},
        "Ligne 1",
        ["br", {}],
        ["a", { href: "https://example.com" }, "https://example.com"],
      ],
    ]);
  });

  it("blocks unsafe link protocols and treats raw HTML as plain text", async () => {
    const doc = await parseMarkdownNote(
      "[clic](javascript:alert(1)) [fichier](file:///etc/passwd) <script>alert(1)</script>",
    );

    const serialized = JSON.stringify(doc.nodes);
    expect(serialized).not.toContain('"href":"javascript:');
    expect(serialized).not.toContain('"href":"file:');
    expect(serialized).not.toContain('["script"');
  });
});
