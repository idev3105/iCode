import { defineConfig, type Plugin } from "vite";
import path from "path";
import fs from "fs";
import { builtinModules } from "module";

function copyCodiconsPlugin(): Plugin {
  return {
    name: 'copy-codicons',
    closeBundle() {
      const src = path.resolve(__dirname, 'node_modules/@vscode/codicons/dist');
      const dest = path.resolve(__dirname, 'dist');
      fs.mkdirSync(dest, { recursive: true });
      fs.copyFileSync(path.join(src, 'codicon.css'), path.join(dest, 'codicon.css'));
      fs.copyFileSync(path.join(src, 'codicon.ttf'), path.join(dest, 'codicon.ttf'));
    },
  };
}

// All Node.js built-in modules + their node: prefixed versions
const nodeExternals = [
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
  ...builtinModules.map((m) => `${m}/promises`),
];

export default defineConfig(({ mode }) => {
  const production = mode === "production";
  return {
    plugins: [copyCodiconsPlugin()],
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
