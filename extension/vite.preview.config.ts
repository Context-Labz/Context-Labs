// Plain Vite (no CRXJS) so the panel renders in a normal browser for design
// review. NOTE: `root` points at the sidepanel folder, which also changes where
// Vite looks for postcss.config.js — without the explicit `css.postcss` below,
// Tailwind silently doesn't run and the preview renders unstyled.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  root: "src/sidepanel",
  plugins: [react()],
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  css: { postcss: __dirname },
  server: { port: 5199 },
});
