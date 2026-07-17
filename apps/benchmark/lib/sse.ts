import { BenchmarkStreamEventSchema } from "./benchmark-contracts";
import type { BenchmarkStreamEvent } from "./benchmark-contracts";

/** Incrementally decode and validate benchmark SSE data frames. */
export function createSseDecoder() {
  let buffer = "";

  function decodeFrames(flush: boolean): BenchmarkStreamEvent[] {
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = flush ? "" : (frames.pop() ?? "");
    const events: BenchmarkStreamEvent[] = [];

    for (const frame of frames) {
      const data = frame
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (!data) {
        continue;
      }
      try {
        events.push(BenchmarkStreamEventSchema.parse(JSON.parse(data)));
      } catch (error) {
        throw new Error("Invalid benchmark stream event", { cause: error });
      }
    }
    return events;
  }

  return {
    finish(): BenchmarkStreamEvent[] {
      if (!buffer.trim()) {
        return [];
      }
      buffer += "\n\n";
      return decodeFrames(true);
    },
    push(chunk: string): BenchmarkStreamEvent[] {
      buffer += chunk;
      return decodeFrames(false);
    },
  };
}
