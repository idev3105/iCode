import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  root: path.resolve(__dirname, "src/panel/webview"),
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      host: "localhost",
    },
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: false,
    rollupOptions: {
      input: path.resolve(__dirname, "src/panel/webview/main.tsx"),
      output: {
        entryFileNames: "webview.js",
        assetFileNames: "webview[extname]",
        format: "iife",
      },
    },
    cssCodeSplit: false,
    sourcemap: mode !== "production" ? "inline" : false,
    minify: mode === "production",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/panel/webview"),
      "@kanban": path.resolve(__dirname, "src/kanban"),
    },
  },
}));
