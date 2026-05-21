/**
 * Envy-backed environment boundary for provider credentials and runtime hints.
 *
 * Keep direct process.env reads here so application and provider code can use a
 * typed, normalized surface. Missing and empty values resolve to undefined.
 */

import { defineEnv } from "@howells/envy";
import { z } from "zod";

export const envSchema = defineEnv({
  optional: {
    AI_GATEWAY_API_KEY: z.string().min(1),
    OPENROUTER_API_KEY: z.string().min(1),
    ANTHROPIC_API_KEY: z.string().min(1),
    OPENAI_API_KEY: z.string().min(1),
    GOOGLE_GEMINI_API_KEY: z.string().min(1),
    VOYAGE_API_KEY: z.string().min(1),
    DEEPSEEK_API_KEY: z.string().min(1),
    XAI_API_KEY: z.string().min(1),
    QWEN_API_KEY: z.string().min(1),
    ZAI_API_KEY: z.string().min(1),
    MOONSHOT_API_KEY: z.string().min(1),
    GROQ_API_KEY: z.string().min(1),
  },
  system: {
    NODE_ENV: z.string().optional(),
    VERCEL_ENV: z.string().optional(),
  },
});

export type RuntimeEnv = ReturnType<typeof envSchema.parseServer>;
export type RuntimeEnvKey = keyof RuntimeEnv;

export function readRuntimeEnv(
  input: Record<string, unknown> = process.env,
): RuntimeEnv {
  return envSchema.parseServer(input);
}

export function envValue(key: RuntimeEnvKey): string | undefined {
  const value = readRuntimeEnv()[key];
  return typeof value === "string" ? value : undefined;
}
