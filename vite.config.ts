import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Relative base + HashRouter → the build runs on any static host
  // (GitHub Pages, Vercel, file preview) without rewrite rules.
  base: "./",
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) return "vendor";
          if (/[\\/]data[\\/].*\.json$/.test(id)) return "gamedata";
        },
      },
    },
  },
});
