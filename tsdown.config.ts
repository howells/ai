import { defineConfig } from "tsdown";

export default defineConfig({
  dts: true,
  entry: ["src/index.ts", "src/react.ts", "src/models.ts", "src/cli.ts"],
  sourcemap: true,
});
