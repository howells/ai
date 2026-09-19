import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "bun:test";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

const run = (command: string, args: readonly string[], cwd: string): string =>
  execFileSync(command, [...args], {
    cwd,
    encoding: "utf-8",
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });

describe("published package manifest", () => {
  // Every version is pinned once in pnpm-workspace.yaml, so the manifest in the
  // repository says `catalog:` and only the packed tarball says a range npm can
  // resolve. Reading the manifest on disk would measure the wrong artefact:
  // `pnpm pack` is what expands the specifier, and a tarball that still carries
  // one installs fine from the repository and fails for the first stranger.
  it("packs registry-resolvable dependency ranges", () => {
    const destination = mkdtempSync(path.join(tmpdir(), "howells-ai-pack-"));
    try {
      run("pnpm", ["pack", "--pack-destination", destination], packageRoot);
      const tarball = readdirSync(destination).find((name) => name.endsWith(".tgz"));
      if (tarball === undefined) {
        throw new Error(`pnpm pack produced no tarball in ${destination}`);
      }
      const manifest: unknown = JSON.parse(
        run("tar", ["-xOf", path.join(destination, tarball), "package/package.json"], destination),
      );
      const dependencies = (manifest as { dependencies: Record<string, string> }).dependencies;
      expect(
        Object.entries(dependencies).filter(
          ([, version]) => version.startsWith("catalog:") || version.startsWith("workspace:"),
        ),
      ).toEqual([]);
    } finally {
      rmSync(destination, { force: true, recursive: true });
    }
  }, 300_000);
});
