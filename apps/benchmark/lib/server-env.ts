import { loadDotenv } from "@howells/envy/dotenv";

let loaded = false;

/**
 * Next loads app-local dotenv files, but this benchmark app often runs from the
 * workspace root while provider keys live in the package root. Load both scopes
 * once before creating provider clients.
 */
export function loadBenchmarkEnv(): void {
  if (loaded) {
    return;
  }

  loadDotenv(
    [
      ".env",
      ".env.local",
      "apps/benchmark/.env",
      "apps/benchmark/.env.local",
      "../../.env",
      "../../.env.local",
    ],
    { skipMissing: true },
  );

  loaded = true;
}
