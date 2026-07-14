import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Relative base + HashRouter → the build runs on any static host
  // (GitHub Pages, Vercel, file preview) without rewrite rules.
  base: "./",
});
