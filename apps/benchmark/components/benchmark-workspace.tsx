"use client";

import { canRouteModelToProvider, isProviderRoute } from "@howells/ai";
import type { ProviderRoute } from "@howells/ai";
import Link from "next/link";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { z } from "zod";
import { ApiErrorSchema, BenchmarkRunSpecSchema } from "../lib/benchmark-contracts";
import type {
  BenchmarkRunState,
  BenchmarkRouteSpec,
  BenchmarkRunSpec,
  BenchmarkStreamEvent,
} from "../lib/benchmark-contracts";
import type { CohortHistoryRow } from "../lib/benchmark-store";
import { createSseDecoder } from "../lib/sse";
import { BenchmarkResults } from "./benchmark-results";
import type { BenchmarkResultView } from "./benchmark-results";
import { BenchmarkSettings, routeFor } from "./benchmark-settings";
import type { ExploreOptions } from "./benchmark-settings";
import { LogoutButton } from "./logout-button";

type RunStatus = BenchmarkRunState;

interface RunState {
  cohortHash?: string;
  completedJobs: number;
  failedSampleIds: string[];
  message?: string;
  results: BenchmarkResultView[];
  status: RunStatus;
  totalJobs: number;
}

type RunAction =
  | { type: "start"; retrySampleIds?: readonly string[] }
  | { type: "started"; cohortHash: string; totalJobs: number }
  | { type: "result"; result: BenchmarkResultView; completedJobs: number }
  | { type: "terminal"; status: RunStatus; message?: string }
  | { type: "cancelling" };

const initialRunState: RunState = {
  completedJobs: 0,
  failedSampleIds: [],
  results: [],
  status: "idle",
  totalJobs: 0,
};

export function BenchmarkWorkspace({
  availableProviders,
  initialHistory,
  limits,
  mode,
  remainingDailyAttempts,
}: {
  availableProviders: readonly ProviderRoute[];
  initialHistory: { cohortHash?: string; error?: string; rows: CohortHistoryRow[] };
  limits: { dailyAttempts: number; maxOutputTokens: number; runAttempts: number };
  mode: "rigorous" | "explore";
  remainingDailyAttempts: number;
}) {
  const fallbackProvider = availableProviders[0] ?? "gateway";
  const defaultModel = "openai/gpt-5.4-mini";
  const [model, setModel] = useState(defaultModel);
  const [routes, setRoutes] = useState<BenchmarkRouteSpec[]>(() =>
    availableProviders
      .filter((provider) => mode === "explore" || canRouteModelToProvider(defaultModel, provider))
      .slice(0, mode === "rigorous" ? 3 : 2)
      .map((provider, index) => routeFor(provider, defaultModel, index)),
  );
  const [samples, setSamples] = useState(5);
  const [maxOutputTokens, setMaxOutputTokens] = useState(
    Math.min(mode === "rigorous" ? 300 : 800, limits.maxOutputTokens),
  );
  const [prompt, setPrompt] = useState(
    "Explain the tradeoffs between latency, throughput, and cost in an AI application.",
  );
  const [options, setOptions] = useState<ExploreOptions>({
    cache: false,
    fallbackModels: [],
    responseHealing: false,
    webSearch: false,
  });
  const [runState, dispatch] = useReducer(runReducer, initialRunState);
  const [history, setHistory] = useState(initialHistory);
  const [remainingAttempts, setRemainingAttempts] = useState(remainingDailyAttempts);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const requestRetryRef = useRef<{ identity: string; requestKey: string } | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem(`benchmark-draft:${mode}`);
    if (!saved) {
      return;
    }
    try {
      const parsed = BenchmarkRunSpecSchema.parse(JSON.parse(saved));
      if (parsed.mode !== mode) {
        return;
      }
      setRoutes(parsed.routes);
      setModel(parsed.routes[0]?.model ?? defaultModel);
      setMaxOutputTokens(parsed.maxOutputTokens);
      if (parsed.mode === "rigorous") {
        setSamples(parsed.samples);
      }
      if (parsed.mode === "explore") {
        setPrompt(parsed.prompt);
        setOptions({
          cache: parsed.options?.cache ?? false,
          fallbackModels: parsed.options?.fallbackModels ?? [],
          responseHealing: parsed.options?.responseHealing ?? false,
          serviceTier: parsed.options?.serviceTier,
          webSearch: parsed.options?.webSearch ?? false,
        });
      }
    } catch {
      sessionStorage.removeItem(`benchmark-draft:${mode}`);
    }
  }, [mode]);

  const attemptCount =
    mode === "rigorous"
      ? routes.length * (1 + 3 * samples)
      : routes.length * (1 + options.fallbackModels.length);
  const canRun =
    availableProviders.length > 0 &&
    routes.length > 0 &&
    routes.every((route) => availableProviders.includes(route.provider)) &&
    attemptCount <= limits.runAttempts &&
    (mode === "rigorous" || prompt.trim().length > 0);
  const running = ["reserving", "running", "cancelling"].includes(runState.status);
  const announcement = statusAnnouncement(runState);

  async function start(retrySampleIds?: string[], selectedRouteIds?: string[]) {
    dispatch({ retrySampleIds, type: "start" });
    const requestBody = {
      maxOutputTokens:
        mode === "rigorous"
          ? Math.min(300, limits.maxOutputTokens)
          : Math.min(Math.max(1, maxOutputTokens), limits.maxOutputTokens),
      mode,
      ...(mode === "rigorous" ? { samples } : { options, prompt }),
      ...(retrySampleIds?.length ? { retrySampleIds } : {}),
      routes: selectedRouteIds
        ? routes.filter((route) => selectedRouteIds.includes(route.id))
        : routes,
      seed: 42,
      version: 1,
    };
    const identity = JSON.stringify(requestBody);
    const requestKey =
      requestRetryRef.current?.identity === identity
        ? requestRetryRef.current.requestKey
        : crypto.randomUUID();
    requestRetryRef.current = { identity, requestKey };
    const rawSpec = { ...requestBody, requestKey };
    let spec: BenchmarkRunSpec;
    try {
      spec = BenchmarkRunSpecSchema.parse(rawSpec);
    } catch {
      requestRetryRef.current = null;
      dispatch({
        type: "terminal",
        status: "failed",
        message: "Review the run settings and try again.",
      });
      return;
    }
    sessionStorage.setItem(`benchmark-draft:${mode}`, JSON.stringify(spec));
    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      const response = await fetch("/api/benchmark", {
        body: JSON.stringify(spec),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: abortController.signal,
      });
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!response.ok || !response.body) {
        requestRetryRef.current = null;
        const payload = ApiErrorSchema.safeParse(await response.json());
        const quota = response.status === 429;
        dispatch({
          message: payload.success ? payload.data.error.message : "The run could not be started.",
          status: quota ? "quota-blocked" : "failed",
          type: "terminal",
        });
        return;
      }
      if (response.headers.get("content-type")?.includes("application/json")) {
        const existing = ExistingRunSchema.safeParse(await response.json());
        if (!existing.success) {
          requestRetryRef.current = null;
          dispatch({
            message: "The existing run response was invalid.",
            status: "failed",
            type: "terminal",
          });
          return;
        }
        requestRetryRef.current = null;
        dispatch({
          message: "This matching request already exists; no provider calls were dispatched.",
          status: existingRunState(existing.data.status),
          type: "terminal",
        });
        await refreshHistory(existing.data.cohortHash);
        void refreshQuota();
        return;
      }

      const reader = response.body.getReader();
      const textDecoder = new TextDecoder();
      const sse = createSseDecoder();
      let terminalCohort: string | undefined;
      while (true) {
        const chunk = await reader.read();
        const events = sse.push(textDecoder.decode(chunk.value, { stream: !chunk.done }));
        for (const event of events) {
          terminalCohort = handleEvent(event, dispatch) ?? terminalCohort;
        }
        if (chunk.done) {
          for (const event of sse.finish()) {
            terminalCohort = handleEvent(event, dispatch) ?? terminalCohort;
          }
          break;
        }
      }
      if (terminalCohort) {
        requestRetryRef.current = null;
        void refreshHistory(terminalCohort);
        void refreshQuota();
      }
    } catch {
      if (abortController.signal.aborted) {
        requestRetryRef.current = null;
      }
      dispatch({
        message: abortController.signal.aborted
          ? "The run was cancelled. Completed samples were kept."
          : "The benchmark connection was lost. Retry the failed work.",
        status: abortController.signal.aborted ? "cancelled" : "failed",
        type: "terminal",
      });
    } finally {
      abortRef.current = null;
    }
  }

  async function refreshHistory(cohortHash: string) {
    try {
      const response = await fetch(`/api/benchmark/history?cohort=${cohortHash}`);
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!response.ok) {
        setHistory((current) => ({
          ...current,
          error: "History could not be refreshed. The completed run results are still available.",
        }));
        return;
      }
      const payload = HistoryResponseSchema.safeParse(await response.json());
      if (payload.success) {
        setHistory(payload.data);
        return;
      }
      setHistory((current) => ({
        ...current,
        error:
          "History returned an invalid response. The completed run results are still available.",
      }));
    } catch {
      setHistory((current) => ({
        ...current,
        error: "History could not be reached. The completed run results are still available.",
      }));
    }
  }

  async function refreshQuota() {
    try {
      const response = await fetch("/api/benchmark");
      if (!response.ok) {
        return;
      }
      const payload = QuotaResponseSchema.safeParse(await response.json());
      if (payload.success) {
        setRemainingAttempts(payload.data.remainingDailyAttempts);
      }
    } catch {
      // The last server-rendered value remains visibly conservative until the next navigation.
    }
  }

  function cancel() {
    dispatch({ type: "cancelling" });
    abortRef.current?.abort();
  }

  function changeModel(value: string) {
    setModel(value);
    setRoutes((current) => {
      const compatible = current
        .filter((route) => mode === "explore" || canRouteModelToProvider(value, route.provider))
        .map((route) => ({ ...route, model: value }));
      const replacement = availableProviders.find(
        (provider) =>
          !compatible.some((route) => route.provider === provider) &&
          (mode === "explore" || canRouteModelToProvider(value, provider)),
      );
      return compatible.length > 0 || !replacement ? compatible : [routeFor(replacement, value, 0)];
    });
  }

  return (
    <div className={`benchmark-app benchmark-app--${mode}`}>
      <a className="skip-link" href="#results-heading">
        Skip to benchmark results
      </a>
      <header className="app-header">
        <div className="app-brand">
          <Link aria-label="Homepage" className="app-mark" href="/">
            <span aria-hidden="true" />
            @howells/ai
          </Link>
          <span aria-hidden="true" className="app-brand__separator">
            ·
          </span>
          <h1>Benchmark</h1>
          <span className="app-brand__mode">
            {mode === "rigorous" ? "Controlled comparisons" : "Route explorer"}
          </span>
        </div>
        <div className="app-header__actions">
          <nav aria-label="Benchmark modes">
            <Link aria-current={mode === "rigorous" ? "page" : undefined} href="/">
              Rigorous
            </Link>
            <Link aria-current={mode === "explore" ? "page" : undefined} href="/explore">
              Explore
            </Link>
          </nav>
          <span className="header-quota data">{remainingAttempts} calls left</span>
          <LogoutButton />
        </div>
      </header>

      <main className="workspace-layout">
        <aside aria-labelledby="settings-title" className="settings-rail">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Protocol</p>
              <h2 id="settings-title">Run settings</h2>
            </div>
          </div>
          <BenchmarkSettings
            availableProviders={availableProviders.length ? availableProviders : [fallbackProvider]}
            idPrefix="desktop"
            maxOutputTokens={maxOutputTokens}
            maxOutputTokensLimit={limits.maxOutputTokens}
            mode={mode}
            onMaxOutputTokensChange={setMaxOutputTokens}
            model={model}
            onModelChange={changeModel}
            onOptionsChange={setOptions}
            onPromptChange={setPrompt}
            onRoutesChange={setRoutes}
            onSamplesChange={setSamples}
            options={options}
            prompt={prompt}
            routes={routes}
            samples={samples}
          />
        </aside>

        <section aria-busy={running} className="workspace-main">
          <section aria-label="Run queue" className="run-summary">
            <div className="run-summary__hero">
              <strong className="display run-summary__number">{attemptCount}</strong>
              <span>{attemptCount === 1 ? "call queued" : "calls queued"}</span>
            </div>
            <div className="run-summary__stat">
              <strong className="data">{routes.length}</strong>
              <span>{routes.length === 1 ? "route" : "routes"}</span>
            </div>
            <div className="run-summary__stat">
              <strong className="data">{mode === "rigorous" ? samples : 1}</strong>
              <span>{mode === "rigorous" ? "samples / case" : "prompt"}</span>
            </div>
            <div className="run-summary__stat">
              <strong className="data">{remainingAttempts}</strong>
              <span>remaining today</span>
            </div>
            <div className="run-summary__stat">
              <strong className="data">
                {runState.completedJobs}/{runState.totalJobs || attemptCount}
              </strong>
              <span>{running ? "progress" : "completed"}</span>
            </div>
            <span
              className={`pill ${runState.status === "failed" || runState.status === "quota-blocked" ? "pill--error" : running ? "pill--warn" : "pill--neutral"}`}
            >
              {runState.status}
            </span>
            <div className="run-summary__actions">
              <RunActions
                canRun={canRun}
                failedIds={runState.failedSampleIds}
                onCancel={cancel}
                onRetry={start}
                onRun={async () => start()}
                running={running}
              />
            </div>
            {running ? (
              <span
                aria-hidden="true"
                className="run-summary__progress"
                style={
                  {
                    "--run-progress": `${Math.min(100, (runState.completedJobs / Math.max(1, runState.totalJobs || attemptCount)) * 100)}%`,
                  } as React.CSSProperties
                }
              />
            ) : null}
          </section>

          {runState.message ? (
            <div className="error-banner" role="alert">
              {runState.message}
            </div>
          ) : null}
          {availableProviders.length === 0 ? (
            <output className="error-banner">
              No provider route is configured. Add a provider credential or an explicit Ollama base
              URL on the server.
            </output>
          ) : null}
          {attemptCount > limits.runAttempts ? (
            <output className="error-banner">
              This selection reserves {attemptCount} attempts; reduce routes or samples to the
              per-run limit of {limits.runAttempts}.
            </output>
          ) : null}
          <output aria-atomic="true" aria-live="polite" className="sr-only">
            {announcement}
          </output>
          {mode === "explore" ? (
            <fieldset className="route-run-actions">
              <legend>Run one:</legend>
              {routes.map((route, index) => (
                <button
                  className="button button--quiet"
                  disabled={!canRun || running}
                  key={route.id}
                  onClick={async () => start(undefined, [route.id])}
                  type="button"
                >
                  Route {index + 1}
                </button>
              ))}
            </fieldset>
          ) : null}
          <BenchmarkResults mode={mode} results={runState.results} />
          <HistorySummary error={history.error} history={history.rows} />
        </section>
      </main>

      <div className="mobile-actions">
        <button
          aria-controls="settings-dialog"
          aria-expanded={settingsOpen}
          className="button button--quiet"
          onClick={() => {
            dialogRef.current?.showModal();
            setSettingsOpen(true);
          }}
          type="button"
        >
          Settings
        </button>
        <RunActions
          canRun={canRun}
          failedIds={runState.failedSampleIds}
          onCancel={cancel}
          onRetry={start}
          onRun={async () => start()}
          running={running}
        />
      </div>
      <dialog
        aria-labelledby="mobile-settings-title"
        className="settings-dialog"
        id="settings-dialog"
        onClose={() => {
          setSettingsOpen(false);
        }}
        ref={dialogRef}
      >
        <div className="dialog-heading">
          <h2 id="mobile-settings-title">Run settings</h2>
          <button
            aria-label="Close settings"
            className="icon-button"
            onClick={() => dialogRef.current?.close()}
            type="button"
          >
            ×
          </button>
        </div>
        <BenchmarkSettings
          availableProviders={availableProviders.length ? availableProviders : [fallbackProvider]}
          idPrefix="mobile"
          maxOutputTokens={maxOutputTokens}
          maxOutputTokensLimit={limits.maxOutputTokens}
          mode={mode}
          onMaxOutputTokensChange={setMaxOutputTokens}
          model={model}
          onModelChange={changeModel}
          onOptionsChange={setOptions}
          onPromptChange={setPrompt}
          onRoutesChange={setRoutes}
          onSamplesChange={setSamples}
          options={options}
          prompt={prompt}
          routes={routes}
          samples={samples}
        />
      </dialog>
    </div>
  );
}

function RunActions({
  canRun,
  failedIds,
  onCancel,
  onRetry,
  onRun,
  running,
}: {
  canRun: boolean;
  failedIds: readonly string[];
  onCancel: () => void;
  onRetry: (ids: string[]) => void;
  onRun: () => void;
  running: boolean;
}) {
  const primaryActionRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="run-actions">
      {failedIds.length && !running ? (
        <button
          className="button button--quiet"
          onClick={() => {
            primaryActionRef.current?.focus();
            onRetry([...failedIds]);
          }}
          type="button"
        >
          Retry failed
        </button>
      ) : null}
      <button
        className={`button ${running ? "button--danger" : "button--primary"}`}
        disabled={!running && !canRun}
        onClick={running ? onCancel : onRun}
        ref={primaryActionRef}
        type="button"
      >
        {running ? "Cancel run" : "Run benchmark"}
      </button>
    </div>
  );
}

function HistorySummary({
  error,
  history,
}: {
  error?: string;
  history: readonly CohortHistoryRow[];
}) {
  return (
    <section aria-labelledby="history-heading" className="history-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Exact cohort</p>
          <h2 id="history-heading">Recent history</h2>
        </div>
      </div>
      {error ? (
        <p className="error-banner" role="alert">
          {error}
        </p>
      ) : null}
      {history.length === 0 && !error ? (
        <p className="empty-copy">No matching measured history yet.</p>
      ) : (
        <div className="history-grid">
          {history.map((row) => (
            <article key={`${row.logicalModelId}:${row.provider}`}>
              <h3>{row.provider}</h3>
              <p>{row.logicalModelId}</p>
              <dl>
                <div>
                  <dt>Median TTFT</dt>
                  <dd>{historyDuration(row.medianTtftMs)}</dd>
                </div>
                <div>
                  <dt>TTFT p25–p75</dt>
                  <dd>{historyRange(row.p25TtftMs, row.p75TtftMs)}</dd>
                </div>
                <div>
                  <dt>Median generation</dt>
                  <dd>{historyDuration(row.medianGenerationMs)}</dd>
                </div>
                <div>
                  <dt>Median total</dt>
                  <dd>{historyDuration(row.medianTotalMs)}</dd>
                </div>
                <div>
                  <dt>Paired total delta</dt>
                  <dd>{historyDelta(row.pairedMedianTotalDeltaMs, row.pairedSampleCount)}</dd>
                </div>
                <div>
                  <dt>Reported cost</dt>
                  <dd>
                    {row.totalCostMicros === 0
                      ? "Unknown / $0"
                      : `$${(row.totalCostMicros / 1_000_000).toFixed(4)}`}
                  </dd>
                </div>
                <div>
                  <dt>Success</dt>
                  <dd>{Math.round(row.successRate * 100)}%</dd>
                </div>
                <div>
                  <dt>N</dt>
                  <dd>{row.sampleCount}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function handleEvent(
  event: BenchmarkStreamEvent,
  dispatch: React.Dispatch<RunAction>,
): string | undefined {
  switch (event.type) {
    case "started": {
      dispatch({ cohortHash: event.cohortHash, totalJobs: event.totalJobs, type: "started" });
      return event.cohortHash;
    }
    case "sample-result": {
      dispatch({
        completedJobs: event.completedJobs,
        result: {
          costMicros: event.costMicros,
          generationDurationMs: event.generationDurationMs,
          inputTokens: event.inputTokens,
          output: event.output,
          outputTokens: event.outputTokens,
          phase: event.phase,
          provider: event.provider,
          providerModelId: event.providerModelId,
          requestedModelId: event.requestedModelId,
          sampleId: event.sampleId,
          status: "success",
          totalDurationMs: event.totalDurationMs,
          ttftMs: event.ttftMs,
        },
        type: "result",
      });
      return undefined;
    }
    case "sample-error": {
      dispatch({
        completedJobs: event.completedJobs,
        result: {
          errorCode: event.code,
          phase: event.phase,
          provider: event.provider,
          requestedModelId: event.requestedModelId,
          sampleId: event.sampleId,
          status: "error",
        },
        type: "result",
      });
      return undefined;
    }
    case "cancelled": {
      dispatch({
        message: "The run was cancelled. Completed results were preserved.",
        status: "cancelled",
        type: "terminal",
      });
      return undefined;
    }
    case "completed": {
      const status =
        event.failedJobs === 0 ? "complete" : event.successfulJobs === 0 ? "failed" : "partial";
      dispatch({
        message:
          status === "failed"
            ? "All provider jobs failed. Review route configuration or credentials, then retry."
            : status === "partial"
              ? "Some provider jobs failed. Successful results were preserved."
              : undefined,
        status,
        type: "terminal",
      });
      return undefined;
    }
    case "heartbeat": {
      return undefined;
    }
  }
}

function runReducer(state: RunState, action: RunAction): RunState {
  switch (action.type) {
    case "start": {
      if (!action.retrySampleIds?.length) {
        return { ...initialRunState, status: "reserving" };
      }
      const retryIds = new Set(action.retrySampleIds);
      return {
        ...initialRunState,
        results: state.results.filter(
          (result) => result.status === "success" && !retryIds.has(result.sampleId),
        ),
        status: "reserving",
      };
    }
    case "started": {
      return {
        ...state,
        cohortHash: action.cohortHash,
        status: "running",
        totalJobs: action.totalJobs,
      };
    }
    case "result": {
      return {
        ...state,
        completedJobs: action.completedJobs,
        failedSampleIds:
          action.result.status === "error"
            ? [...new Set([...state.failedSampleIds, action.result.sampleId])]
            : state.failedSampleIds,
        results: [
          ...state.results.filter((result) => result.sampleId !== action.result.sampleId),
          action.result,
        ],
      };
    }
    case "cancelling": {
      return { ...state, status: "cancelling" };
    }
    case "terminal": {
      return { ...state, message: action.message, status: action.status };
    }
  }
}

function statusAnnouncement(state: RunState): string {
  if (state.status === "running") {
    if (state.completedJobs === 0 || state.totalJobs === 0) {
      return "Benchmark running.";
    }
    const milestone = Math.min(75, Math.floor((state.completedJobs / state.totalJobs) * 4) * 25);
    return milestone > 0 ? `Benchmark running. ${milestone}% complete.` : "Benchmark running.";
  }
  if (state.status === "complete") {
    const measured = state.results.filter((result) => result.phase === "measured").length;
    return `Benchmark complete. ${measured} measured results available.`;
  }
  if (state.status === "partial") {
    return "Benchmark completed with some provider errors.";
  }
  if (state.status === "cancelled") {
    return "Benchmark cancelled. Completed results were kept.";
  }
  if (state.status === "failed") {
    return "Benchmark failed. All provider jobs returned errors.";
  }
  if (state.status === "quota-blocked") {
    return "Benchmark blocked by quota limits.";
  }
  return "";
}

const HistoryResponseSchema = z.strictObject({
  cohortHash: z.string(),
  rows: z.array(
    z.strictObject({
      logicalModelId: z.string(),
      medianGenerationMs: z.number().nullable(),
      medianTotalMs: z.number().nullable(),
      medianTtftMs: z.number().nullable(),
      p25TtftMs: z.number().nullable(),
      p75TtftMs: z.number().nullable(),
      pairedMedianTotalDeltaMs: z.number().nullable(),
      pairedSampleCount: z.number(),
      provider: z.string().refine(isProviderRoute),
      sampleCount: z.number(),
      successRate: z.number(),
      totalCostMicros: z.number(),
    }),
  ),
});

const ExistingRunSchema = z.strictObject({
  cohortHash: z.string().regex(/^[a-f0-9]{64}$/),
  existing: z.literal(true),
  runId: z.string().uuid(),
  status: z.enum(["reserved", "running", "completed", "partial", "cancelled", "failed", "expired"]),
});

const QuotaResponseSchema = z.strictObject({
  availableProviders: z.array(z.string().refine(isProviderRoute)),
  availableServices: z.array(z.string()),
  limits: z.strictObject({
    activeRuns: z.number().int().positive(),
    dailyAttempts: z.number().int().positive(),
    exploreConcurrency: z.number().int().positive(),
    images: z.number().int().nonnegative(),
    maxOutputTokens: z.number().int().positive(),
    requestBytes: z.number().int().positive(),
    rigorousConcurrency: z.number().int().positive(),
    runAttempts: z.number().int().positive(),
  }),
  remainingDailyAttempts: z.number().int().nonnegative(),
});

function existingRunState(status: z.infer<typeof ExistingRunSchema>["status"]): RunStatus {
  if (status === "completed") {
    return "complete";
  }
  if (status === "failed" || status === "expired") {
    return "failed";
  }
  if (status === "cancelled") {
    return "cancelled";
  }
  return "partial";
}

function historyDuration(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}ms`;
}

function historyRange(p25: number | null, p75: number | null): string {
  return p25 === null || p75 === null ? "—" : `${Math.round(p25)}–${Math.round(p75)}ms`;
}

function historyDelta(value: number | null, count: number): string {
  if (value === null || count === 0) {
    return "—";
  }
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}ms (${count} pairs)`;
}
