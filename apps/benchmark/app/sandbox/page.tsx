"use client";

import type { ProviderRoute } from "@howells/ai";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import type { BenchmarkReasoningMode } from "../../lib/benchmark-options";

interface ModelOption {
  label: string;
  model: string;
  provider: ProviderRoute;
  routeProvider?: string;
  reasoning?: BenchmarkReasoningMode;
}

interface ColumnState extends ModelOption {
  id: string;
}

interface BenchmarkConfig {
  availableProviders: ProviderRoute[];
}

interface OpenRouterEndpoint {
  provider_name?: string;
  tag?: string;
  status?: number;
  uptime_last_5m?: number | null;
  uptime_last_30m?: number | null;
  latency_last_30m?: number | null;
  throughput_last_30m?: number | null;
}

interface OpenRouterEndpointStatus {
  model: string;
  endpoints: OpenRouterEndpoint[];
  error?: string;
}

interface RouteValidation {
  canRun: boolean;
  label: string;
  pillClass: string;
  title: string;
}

interface SandboxResult {
  model: string;
  provider: ProviderRoute;
  label: string;
  ttft: number;
  totalTime: number;
  outputTokens: number;
  inputTokens: number;
  tokensPerSecond: number;
  output: string;
  error?: string;
}

const MODEL_OPTIONS: ModelOption[] = [
  {
    label: "Gemini 3.5 Flash",
    model: "google/gemini-3.5-flash",
    provider: "openrouter",
    reasoning: "minimal",
  },
  {
    label: "GLM 4.7 - Cerebras",
    model: "z-ai/glm-4.7",
    provider: "openrouter",
    reasoning: "off",
    routeProvider: "cerebras",
  },
  {
    label: "GPT-OSS 20B - Groq direct",
    model: "openai/gpt-oss-20b",
    provider: "groq",
    reasoning: "minimal",
  },
  {
    label: "GPT-OSS 120B - Groq direct",
    model: "openai/gpt-oss-120b",
    provider: "groq",
    reasoning: "minimal",
  },
  {
    label: "GPT-OSS 120B - Cerebras",
    model: "openai/gpt-oss-120b",
    provider: "openrouter",
    reasoning: "minimal",
    routeProvider: "cerebras",
  },
  {
    label: "GPT-OSS 20B - OpenRouter Groq",
    model: "openai/gpt-oss-20b",
    provider: "openrouter",
    reasoning: "minimal",
    routeProvider: "groq",
  },
  {
    label: "GPT-OSS 120B - OpenRouter Groq",
    model: "openai/gpt-oss-120b",
    provider: "openrouter",
    reasoning: "minimal",
    routeProvider: "groq",
  },
  {
    label: "Llama 4 Scout - Groq",
    model: "meta-llama/llama-4-scout",
    provider: "openrouter",
    reasoning: "off",
    routeProvider: "groq",
  },
  {
    label: "GLM 4.7 Flash",
    model: "z-ai/glm-4.7-flash",
    provider: "openrouter",
    reasoning: "off",
  },
];

const DEFAULT_COLUMNS: ColumnState[] = MODEL_OPTIONS.slice(0, 4).map((option, index) => ({
  id: `column-${index}`,
  ...option,
}));

const DEFAULT_PROMPT =
  "For a consumer app, explain one tradeoff between speed and answer quality in two sentences.";

function resultKey(column: ColumnState): string {
  return `${column.provider}:${column.model}:${column.routeProvider ?? "default"}`;
}

function metric(value: number, suffix: string): string {
  return value ? `${value.toLocaleString()}${suffix}` : "-";
}

function applyOption(column: ColumnState, label: string): ColumnState {
  const option = MODEL_OPTIONS.find((item) => item.label === label);
  if (!option) {
    return column;
  }
  return { id: column.id, ...option };
}

function canonicalModelId(model: string): string {
  return model.trim().replace(/:(nitro|exacto|floor)$/, "");
}

function normalizeRouteSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll("&", "and")
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

function routeSlugForEndpoint(endpoint: OpenRouterEndpoint): string {
  const tagBase = endpoint.tag?.split("/")[0];
  return normalizeRouteSlug(tagBase || endpoint.provider_name || "");
}

function endpointMatchesRoute(endpoint: OpenRouterEndpoint, routeProvider: string): boolean {
  const route = normalizeRouteSlug(routeProvider);
  const slugs = [
    routeSlugForEndpoint(endpoint),
    normalizeRouteSlug(endpoint.provider_name ?? ""),
    normalizeRouteSlug(endpoint.tag ?? ""),
  ];
  return slugs.includes(route);
}

function endpointLabel(endpoint: OpenRouterEndpoint): string {
  const providerName = endpoint.provider_name ?? "Unknown";
  return endpoint.tag ? `${providerName} (${endpoint.tag})` : providerName;
}

function endpointSummary(endpoints: readonly OpenRouterEndpoint[]): string {
  return endpoints
    .map((endpoint) => {
      const status = endpoint.status === 0 ? "up" : `status ${endpoint.status}`;
      return `${routeSlugForEndpoint(endpoint)}: ${endpointLabel(endpoint)} ${status}`;
    })
    .join("\n");
}

function routeOptions(
  status: OpenRouterEndpointStatus | undefined,
): { value: string; label: string }[] {
  const options = new Map<string, string>();
  for (const endpoint of status?.endpoints ?? []) {
    const value = routeSlugForEndpoint(endpoint);
    if (!value || options.has(value)) {
      continue;
    }
    options.set(value, endpoint.provider_name ?? value);
  }
  return [...options]
    .map(([value, label]) => ({ label, value }))
    .toSorted((a, b) => a.label.localeCompare(b.label));
}

function validateRoute({
  column,
  providerReady,
  status,
  checking,
}: {
  column: ColumnState;
  providerReady: boolean;
  status: OpenRouterEndpointStatus | undefined;
  checking: boolean;
}): RouteValidation {
  if (!providerReady) {
    return {
      canRun: false,
      label: "missing key",
      pillClass: "pill--warn",
      title: `Set the API key for provider "${column.provider}" to run this model.`,
    };
  }

  if (column.provider !== "openrouter") {
    return {
      canRun: true,
      label: "key ready",
      pillClass: "pill--best",
      title: "Direct provider key is configured.",
    };
  }

  if (checking || !status) {
    return {
      canRun: false,
      label: "checking route",
      pillClass: "pill--info",
      title: "Checking OpenRouter endpoint metadata for this model.",
    };
  }

  if (status.error) {
    return {
      canRun: false,
      label: "verify failed",
      pillClass: "pill--warn",
      title: status.error,
    };
  }

  if (status.endpoints.length === 0) {
    return {
      canRun: false,
      label: "unknown model",
      pillClass: "pill--error",
      title: `OpenRouter returned no endpoints for ${column.model}.`,
    };
  }

  if (!column.routeProvider) {
    return {
      canRun: true,
      label: "model valid",
      pillClass: "pill--best",
      title: `OpenRouter has ${status.endpoints.length} endpoint(s):\n${endpointSummary(
        status.endpoints,
      )}`,
    };
  }

  const endpoint = status.endpoints.find((item) =>
    endpointMatchesRoute(item, column.routeProvider ?? ""),
  );

  if (!endpoint) {
    return {
      canRun: false,
      label: "invalid route",
      pillClass: "pill--error",
      title: `No OpenRouter endpoint matches "${column.routeProvider}". Available endpoints:\n${endpointSummary(
        status.endpoints,
      )}`,
    };
  }

  if (endpoint.status !== 0) {
    return {
      canRun: false,
      label: "route down",
      pillClass: "pill--warn",
      title: `${endpointLabel(endpoint)} exists but is not healthy (status ${endpoint.status}).`,
    };
  }

  return {
    canRun: true,
    label: "route valid",
    pillClass: "pill--best",
    title: `${endpointLabel(endpoint)} is available for ${column.model}.`,
  };
}

/** Four-column model sandbox for sending one prompt to comparable routes. */
export default function SandboxPage() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [maxTokens, setMaxTokens] = useState(180);
  const [columns, setColumns] = useState<ColumnState[]>(DEFAULT_COLUMNS);
  const [availableProviders, setAvailableProviders] = useState<ProviderRoute[]>([]);
  const [results, setResults] = useState<Record<string, SandboxResult>>({});
  const [runningColumnIds, setRunningColumnIds] = useState<Set<string>>(() => new Set());
  const [openRouterStatuses, setOpenRouterStatuses] = useState<
    Record<string, OpenRouterEndpointStatus>
  >({});
  const [checkingOpenRouterModels, setCheckingOpenRouterModels] = useState<Set<string>>(
    () => new Set(),
  );
  const checkingOpenRouterModelsRef = useRef(new Set<string>());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/benchmark");
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const config = (await response.json()) as BenchmarkConfig;
        if (!cancelled) {
          setAvailableProviders(config.availableProviders);
        }
      } catch (error) {
        if (!cancelled) {
          setError(error instanceof Error ? error.message : String(error));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const configured = useMemo(() => new Set(availableProviders), [availableProviders]);
  const running = runningColumnIds.size > 0;

  useEffect(() => {
    const modelsToCheck = [
      ...new Set(
        columns
          .filter((column) => column.provider === "openrouter")
          .map((column) => canonicalModelId(column.model)),
      ),
    ].filter(
      (model) =>
        model && !openRouterStatuses[model] && !checkingOpenRouterModelsRef.current.has(model),
    );

    if (modelsToCheck.length === 0) {
      return;
    }

    for (const model of modelsToCheck) {
      checkingOpenRouterModelsRef.current.add(model);
    }
    setCheckingOpenRouterModels((current) => {
      const next = new Set(current);
      for (const model of modelsToCheck) {
        next.add(model);
      }
      return next;
    });

    for (const model of modelsToCheck) {
      void (async () => {
        try {
          const response = await fetch(
            `/api/openrouter/endpoints?model=${encodeURIComponent(model)}`,
          );
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const status = (await response.json()) as OpenRouterEndpointStatus;
          setOpenRouterStatuses((current) => ({
            ...current,
            [model]: status,
          }));
        } catch (error) {
          setOpenRouterStatuses((current) => ({
            ...current,
            [model]: {
              endpoints: [],
              error: error instanceof Error ? error.message : String(error),
              model,
            },
          }));
        } finally {
          checkingOpenRouterModelsRef.current.delete(model);
          setCheckingOpenRouterModels((current) => {
            const next = new Set(current);
            next.delete(model);
            return next;
          });
        }
      })();
    }
  }, [columns, openRouterStatuses]);

  async function runSandbox(targetColumns: ColumnState[], clearAll: boolean) {
    const targetIds = new Set(targetColumns.map((column) => column.id));
    setRunningColumnIds(targetIds);
    setError(null);
    setResults((current) => {
      if (clearAll) {
        return {};
      }
      const next = { ...current };
      for (const column of targetColumns) {
        delete next[resultKey(column)];
      }
      return next;
    });

    try {
      const response = await fetch("/api/benchmark", {
        body: JSON.stringify({
          maxTokens,
          options: {
            allowProviders: [],
            cache: "off",
            denyProviders: [],
            fallbackModels: [],
            fallbacks: true,
            includeCost: true,
            logprobs: "off",
            openRouterVariant: "off",
            privacy: [],
            providerOrder: [],
            quantizations: [],
            reasoning: "default",
            responseHealing: false,
            routePreference: "auto",
            serviceTier: "default",
            tags: ["sandbox"],
            webSearch: "off",
          },
          prompt,
          runs: targetColumns.map((column) => ({
            model: column.model,
            provider: column.provider,
            label: column.label,
            routeProvider: column.routeProvider,
            reasoning: column.reasoning === "default" ? undefined : column.reasoning,
          })),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok || !response.body) {
        throw new Error(`Benchmark request failed: HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const event of events) {
          const line = event.split("\n").find((part) => part.startsWith("data: "));
          if (!line) {
            continue;
          }
          const payload = line.slice("data: ".length);
          if (payload === "[DONE]") {
            continue;
          }
          const result = JSON.parse(payload) as SandboxResult;
          const column = targetColumns.find(
            (item) =>
              item.label === result.label &&
              item.provider === result.provider &&
              item.model === result.model,
          );
          if (!column) {
            continue;
          }
          setResults((current) => ({
            ...current,
            [resultKey(column)]: result,
          }));
        }
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setRunningColumnIds((current) => {
        const next = new Set(current);
        for (const id of targetIds) {
          next.delete(id);
        }
        return next;
      });
    }
  }

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-canvas text-text">
      <header className="flex items-center justify-between border-b border-border bg-surface px-5 py-3">
        <div>
          <div className="eyebrow">Howells AI</div>
          <h1 className="text-xl font-medium">Model sandbox</h1>
        </div>
        <Link
          className="rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-sm text-text-muted hover:bg-raised"
          href="/"
        >
          Benchmark table
        </Link>
      </header>

      <section className="border-b border-border bg-raised px-5 py-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_140px_auto]">
          <label className="grid gap-1">
            <span className="eyebrow">Shared prompt</span>
            <textarea
              aria-label="Shared prompt"
              className="min-h-24 resize-none rounded-[var(--radius-control)] border border-border bg-surface p-3 text-sm leading-6"
              value={prompt}
              onChange={(event) => {
                setPrompt(event.target.value);
              }}
            />
          </label>
          <label className="grid gap-1">
            <span className="eyebrow">Max tokens</span>
            <input
              aria-label="Max tokens"
              className="rounded-[var(--radius-control)] border border-border bg-surface px-3 py-2 text-sm"
              min={32}
              max={4096}
              type="number"
              value={maxTokens}
              onChange={(event) => {
                setMaxTokens(Number(event.target.value));
              }}
            />
          </label>
          <button
            className="self-end rounded-[var(--radius-control)] bg-cta px-5 py-2.5 text-sm font-medium text-cta-fg hover:bg-cta-hover disabled:cursor-not-allowed disabled:opacity-50"
            disabled={running || !prompt.trim()}
            onClick={() => void runSandbox(columns, true)}
            type="button"
          >
            {running ? "Running..." : "Send to all"}
          </button>
        </div>
        {error ? <p className="mt-2 text-sm text-error-fg">{error}</p> : null}
      </section>

      <section className="grid min-h-0 flex-1 grid-cols-1 gap-px overflow-auto bg-border p-px md:grid-cols-2 xl:grid-cols-4">
        {columns.map((column, index) => {
          const currentResult = results[resultKey(column)];
          const providerReady = configured.has(column.provider);
          const columnRunning = runningColumnIds.has(column.id);
          const openRouterModelId = canonicalModelId(column.model);
          const openRouterStatus = openRouterStatuses[openRouterModelId];
          const routeValidation = validateRoute({
            checking:
              column.provider === "openrouter" && checkingOpenRouterModels.has(openRouterModelId),
            column,
            providerReady,
            status: column.provider === "openrouter" ? openRouterStatus : undefined,
          });
          const availableRouteOptions = routeOptions(openRouterStatus);

          return (
            <article className="flex min-h-[520px] flex-col bg-surface" key={column.id}>
              <div className="border-b border-border p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="eyebrow">Column {index + 1}</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`pill ${routeValidation.pillClass}`}
                      title={routeValidation.title}
                    >
                      {routeValidation.label}
                    </span>
                    <button
                      className="rounded-[var(--radius-control)] border border-border px-2.5 py-1 text-xs font-medium text-text-muted hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={running || !prompt.trim() || !routeValidation.canRun}
                      onClick={() => void runSandbox([column], false)}
                      type="button"
                    >
                      {columnRunning ? "Running..." : "Run"}
                    </button>
                  </div>
                </div>

                <label className="grid gap-1">
                  <span className="eyebrow-sm">Model preset</span>
                  <select
                    className="rounded-[var(--radius-control)] border border-border bg-surface px-3 py-2 text-sm"
                    value={column.label}
                    onChange={(event) => {
                      setColumns((current) =>
                        current.map((item) =>
                          item.id === column.id ? applyOption(item, event.target.value) : item,
                        ),
                      );
                    }}
                  >
                    {MODEL_OPTIONS.map((option) => (
                      <option key={option.label}>{option.label}</option>
                    ))}
                  </select>
                </label>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label className="grid gap-1">
                    <span className="eyebrow-sm">Provider</span>
                    <select
                      className="rounded-[var(--radius-control)] border border-border bg-surface px-3 py-2 text-sm"
                      value={column.provider}
                      onChange={(event) => {
                        setColumns((current) =>
                          current.map((item) =>
                            item.id === column.id
                              ? {
                                  ...item,
                                  provider: event.target.value as ProviderRoute,
                                  routeProvider: undefined,
                                }
                              : item,
                          ),
                        );
                      }}
                    >
                      {[
                        "openrouter",
                        "gateway",
                        "google",
                        "zai",
                        "groq",
                        "openai",
                        "anthropic",
                      ].map((provider) => (
                        <option key={provider}>{provider}</option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-1">
                    <span className="eyebrow-sm">Route</span>
                    <select
                      className="rounded-[var(--radius-control)] border border-border bg-surface px-3 py-2 text-sm disabled:text-text-faint"
                      disabled={column.provider !== "openrouter"}
                      value={column.routeProvider ?? ""}
                      onChange={(event) => {
                        setColumns((current) =>
                          current.map((item) =>
                            item.id === column.id
                              ? {
                                  ...item,
                                  routeProvider: event.target.value || undefined,
                                }
                              : item,
                          ),
                        );
                      }}
                    >
                      <option value="">default</option>
                      {availableRouteOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                      {column.routeProvider &&
                      !availableRouteOptions.some(
                        (option) => option.value === column.routeProvider,
                      ) ? (
                        <option value={column.routeProvider}>{column.routeProvider}</option>
                      ) : null}
                    </select>
                  </label>
                </div>

                <label className="mt-3 grid gap-1">
                  <span className="eyebrow-sm">Model ID</span>
                  <input
                    aria-label={`Model ID for ${column.label}`}
                    className="rounded-[var(--radius-control)] border border-border bg-surface px-3 py-2 font-mono text-xs"
                    value={column.model}
                    onChange={(event) => {
                      setColumns((current) =>
                        current.map((item) =>
                          item.id === column.id ? { ...item, model: event.target.value } : item,
                        ),
                      );
                    }}
                  />
                </label>
              </div>

              <div className="grid grid-cols-3 gap-px bg-border text-center">
                <MetricBox label="TTFT" value={metric(currentResult?.ttft ?? 0, "ms")} />
                <MetricBox label="Total" value={metric(currentResult?.totalTime ?? 0, "ms")} />
                <MetricBox
                  label="Tok/s"
                  value={
                    currentResult?.tokensPerSecond
                      ? currentResult.tokensPerSecond.toLocaleString()
                      : "-"
                  }
                />
              </div>

              <div className="min-h-0 flex-1 overflow-auto p-4">
                {columnRunning && !currentResult ? (
                  <p className="text-sm text-text-muted">Waiting for response...</p>
                ) : currentResult?.error ? (
                  <pre className="whitespace-pre-wrap rounded-[var(--radius-control)] bg-error-bg p-3 text-xs text-error-fg">
                    {currentResult.error}
                  </pre>
                ) : currentResult ? (
                  <div className="space-y-3">
                    <p className="eyebrow-sm">
                      {currentResult.inputTokens} input tokens / {currentResult.outputTokens} output
                      tokens
                    </p>
                    <Streamdown
                      className="streamdown-output text-sm leading-6"
                      controls={false}
                      mode="static"
                    >
                      {currentResult.output}
                    </Streamdown>
                  </div>
                ) : (
                  <p className="text-sm text-text-muted">
                    The response will appear here after you send the prompt.
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-raised px-3 py-2">
      <div className="eyebrow-sm">{label}</div>
      <div className="data text-sm">{value}</div>
    </div>
  );
}
