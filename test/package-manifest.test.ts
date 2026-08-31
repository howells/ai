import { describe, expect, it } from "bun:test";

import manifest from "../package.json";

describe("published package manifest", () => {
  it("uses registry-resolvable production dependency ranges", () => {
    expect(
      Object.entries(manifest.dependencies).filter(([, version]) => version.startsWith("catalog:")),
    ).toEqual([]);
  });
});
