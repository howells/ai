import { defineConfig } from "tsdown";

// Two builds so the root entry never shares a chunk with the command-line
// tool: it ships as one file that imports nothing.
export default defineConfig([
  { dts: true, entry: ["src/index.ts"], sourcemap: false },
  { clean: false, dts: true, entry: ["src/bench.ts", "src/cli.ts"], sourcemap: false },
]);
