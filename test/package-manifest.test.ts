import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { z } from "zod";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

const run = (command: string, args: readonly string[], cwd: string): string =>
  execFileSync(command, [...args], {
    cwd,
    encoding: "utf-8",
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });

const manifestSchema = z.object({ dependencies: z.record(z.string(), z.string()) });

// These read the packed tarball, never the working tree: `pnpm pack` is what
// runs the build and expands the manifest, so it is the artefact a consumer gets.
describe("published package", () => {
  const destination = mkdtempSync(path.join(tmpdir(), "howells-ai-pack-"));
  let tarball = "";

  const packed = (file: string): string =>
    run("tar", ["-xOf", tarball, `package/${file}`], destination);

  beforeAll(() => {
    run("pnpm", ["pack", "--pack-destination", destination], packageRoot);
    const name = readdirSync(destination).find((entry) => entry.endsWith(".tgz"));
    if (name === undefined) {
      throw new Error(`pnpm pack produced no tarball in ${destination}`);
    }
    tarball = path.join(destination, name);
  }, 300_000);

  afterAll(() => {
    rmSync(destination, { force: true, recursive: true });
  });

  test("packs registry-resolvable dependency ranges", () => {
    const { dependencies } = manifestSchema.parse(JSON.parse(packed("package.json")));
    const unresolved = Object.entries(dependencies).filter(
      ([, version]) => version.startsWith("catalog:") || version.startsWith("workspace:"),
    );
    expect(unresolved).toStrictEqual([]);
  });

  // The root entry is a lookup a repo imports for two constants. Anything it
  // imports is a dependency every consumer loads for nothing.
  test("ships a root entry that imports nothing", () => {
    const code = packed("dist/index.mjs").replaceAll(/\/\*[\s\S]*?\*\//gu, "");
    expect(code).not.toMatch(/\bimport\b|\brequire\(/u);
  });
});
