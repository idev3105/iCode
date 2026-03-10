import { defineConfig } from "vite";
import path from "path";
import { builtinModules } from "module";

// All Node.js built-in modules + their node: prefixed versions
const nodeExternals = [
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
  ...builtinModules.map((m) => `${m}/promises`),
];

export default defineConfig(({ mode }) => {
  const production = mode === "production";
  return {
    build: {
      outDir: path.resolve(__dirname, "dist"),
      emptyOutDir: false,
      lib: {
        entry: path.resolve(__dirname, "src/extension.ts"),
        formats: ["cjs"],
        fileName: () => "extension.js",
      },
      rollupOptions: {
        external: ["vscode", ...nodeExternals],
        output: {
          // Ensure require() is used for imports in CJS
          interop: "auto",
        },
      },
      sourcemap: !production,
      minify: production,
    },
    // Prevent Vite from trying to resolve Node builtins for browser
    resolve: {
      conditions: ["node"],
    },
  };
});
