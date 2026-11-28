import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import tailwindcss from "@tailwindcss/vite";
import solid from "@solidjs/vite-plugin";
import netlify from "@netlify/vite-plugin";

/** Stamp dist/sw.js with a deterministic build hash so every deploy triggers an SW update. */
function stampServiceWorker(): Plugin {
  let outDir = "dist";
  return {
    name: "stamp-service-worker",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    async writeBundle(_options, bundle) {
      const swPath = resolve(outDir, "sw.js");
      const source = await readFile(swPath, "utf8");
      const parts: string[] = [];
      for (const fileName of Object.keys(bundle).toSorted()) {
        parts.push(fileName);
        const chunk = bundle[fileName];
        if (chunk.type === "chunk") {
          parts.push(chunk.code);
        } else if (typeof chunk.source === "string") {
          parts.push(chunk.source);
        } else if (chunk.source instanceof Uint8Array) {
          parts.push(String(chunk.source.byteLength));
        }
      }
      const version = createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 12);
      await writeFile(swPath, source.replaceAll("__SW_VERSION__", version), "utf8");
    },
  };
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    solid(),
    netlify({
      edgeFunctions: { enabled: false },
      database: { enabled: false },
      server: { enabled: false },
    }),
    stampServiceWorker(),
  ],
  build: {
    target: "esnext",
  },
});
