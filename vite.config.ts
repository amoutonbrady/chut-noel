import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import solid from "@solidjs/vite-plugin";
import netlify from "@netlify/vite-plugin";

export default defineConfig({
  plugins: [
    tailwindcss(),
    solid(),
    netlify({
      edgeFunctions: { enabled: false },
      database: { enabled: false },
      server: { enabled: false },
    }),
  ],
  build: {
    target: "esnext",
  },
});
