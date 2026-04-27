import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/react.ts", "src/models.ts"],
  sourcemap: true,
  dts: true,
});
