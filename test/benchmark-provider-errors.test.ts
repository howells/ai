import { describe, expect, spyOn, test } from "bun:test";
import { suppressProviderStreamError } from "../apps/benchmark/lib/provider-errors";

describe("benchmark provider error handling", () => {
  test("does not write upstream stream errors to the server console", () => {
    const consoleError = spyOn(console, "error").mockImplementation(() => {});

    suppressProviderStreamError({ error: new Error("sensitive upstream response") });

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
