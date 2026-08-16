import { defineConfig } from "tsdown";

export default defineConfig({
  dts: true,
  entry: [
    "src/index.ts",
    "src/react.ts",
    "src/models.ts",
    "src/server.ts",
    "src/cli.ts",
    "src/catalog.ts",
    "src/bench.ts",
    "src/eval.ts",
    "src/decisions.ts",
    "src/taxonomy.ts",
  ],
  sourcemap: false,
});
