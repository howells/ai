/**
 * The command-line tool's one environment read. Nothing in the root entry
 * touches the environment.
 */

import { defineEnv } from "@howells/envy";
import { loadDotenv } from "@howells/envy/dotenv";
import path from "node:path";
import { cwd, env } from "node:process";
import { z } from "zod";

const envSchema = defineEnv({
  optional: {
    OPENROUTER_API_KEY: z.string().min(1),
  },
});

/** Load `.env` and `.env.local` from the working directory, then return the OpenRouter key if set. */
export const openRouterApiKey = (): string | undefined => {
  loadDotenv([path.join(cwd(), ".env"), path.join(cwd(), ".env.local")], { skipMissing: true });
  return envSchema.parseServer(env).OPENROUTER_API_KEY;
};
