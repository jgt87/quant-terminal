import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      "/api": { target: "http://localhost:4180", changeOrigin: true },
    },
  },
  preview: { port: 5180 },
  // panels.html: the right-side panels on their own (verification page; the app mounts them via PanelHost).
  build: { outDir: "dist", sourcemap: true, target: "es2022", rolldownOptions: { input: { main: fileURLToPath(new URL("index.html", import.meta.url)), panels: fileURLToPath(new URL("panels.html", import.meta.url)) } } },
  worker: { format: "es" },
});
