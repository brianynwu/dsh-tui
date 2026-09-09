import { defineConfig } from "tsdown";

// The build runs `tsc -p tsconfig.json` (emits declarations to lib/types) THEN
// `tsdown`. tsdown emits the four ESM entry `.js` files into lib/, bundling
// pi-tui and the local src/** while externalizing the host-provided
// @deepseek-ai/* packages (and, by tsdown's default, the runtime deps in
// package.json). The four entries are externalized from one another, so
// index.js imports "./prompt.js" rather than inlining it.
export default defineConfig({
  entry: [
    "src/index.ts",
    "src/startup.ts",
    "src/prompt.ts",
    "src/invariant.ts",
  ],
  format: "esm",
  outDir: "lib",
  // Force plain `.js` (package is `type: module`), overriding the `.mjs` that
  // fixedExtension would otherwise produce under the node platform default.
  outExtensions: () => ({ js: ".js" }),
  dts: false,
  external: [/^@deepseek-ai\//],
  minify: false,
  // tsc already wrote lib/types before this step; do not let tsdown wipe it.
  clean: false,
});
