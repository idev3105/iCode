import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
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
    sourcemap: process.env.NODE_ENV !== "production",
    minify: process.env.NODE_ENV === "production",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/panel/webview"),
    },
  },
});
