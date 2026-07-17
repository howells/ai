"use client";

import { canRouteModelToProvider, isProviderRoute, PROVIDER_DEFINITION_BY_ID } from "@howells/ai";
import type { ProviderRoute } from "@howells/ai";
import { MODEL_ROWS } from "../lib/models";
import type { BenchmarkRouteSpec } from "../lib/benchmark-contracts";

export interface ExploreOptions {
  cache: boolean;
  fallbackModels: string[];
  responseHealing: boolean;
  serviceTier?: "auto" | "standard" | "flex" | "priority";
  webSearch: boolean;
}

export function BenchmarkSettings({
  availableProviders,
  idPrefix,
  maxOutputTokens,
  maxOutputTokensLimit,
  mode,
  model,
  onModelChange,
  onMaxOutputTokensChange,
  onOptionsChange,
  onPromptChange,
  onRoutesChange,
  onSamplesChange,
  options,
  prompt,
  routes,
  samples,
}: {
  availableProviders: readonly ProviderRoute[];
  idPrefix: string;
  maxOutputTokens: number;
  maxOutputTokensLimit: number;
  mode: "rigorous" | "explore";
  model: string;
  onModelChange: (model: string) => void;
  onMaxOutputTokensChange: (tokens: number) => void;
  onOptionsChange: (options: ExploreOptions) => void;
  onPromptChange: (prompt: string) => void;
  onRoutesChange: (routes: BenchmarkRouteSpec[]) => void;
  onSamplesChange: (samples: number) => void;
  options: ExploreOptions;
  prompt: string;
  routes: readonly BenchmarkRouteSpec[];
  samples: number;
}) {
  const samplesId = `${idPrefix}-measured-samples`;
  const promptId = `${idPrefix}-explore-prompt`;
  if (mode === "rigorous") {
    return (
      <div className="settings-stack">
        <fieldset>
          <legend>Logical model</legend>
          <select
            aria-label="Logical model"
            onChange={(event) => {
              onModelChange(event.target.value);
            }}
            value={model}
          >
            {MODEL_ROWS.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </fieldset>
        <fieldset>
          <legend>Provider routes, up to three</legend>
          <div className="checkbox-list">
            {availableProviders.map((provider) => {
              const checked = routes.some((route) => route.provider === provider);
              const compatible = canRouteModelToProvider(model, provider);
              return (
                <label key={provider}>
                  <input
                    checked={checked}
                    disabled={!compatible || (!checked && routes.length >= 3)}
                    onChange={(event) => {
                      if (event.target.checked) {
                        onRoutesChange([...routes, routeFor(provider, model, routes.length)]);
                      } else {
                        onRoutesChange(routes.filter((route) => route.provider !== provider));
                      }
                    }}
                    type="checkbox"
                  />
                  {PROVIDER_DEFINITION_BY_ID[provider].label}
                  {!compatible ? " (not available for this model)" : null}
                </label>
              );
            })}
          </div>
        </fieldset>
        <fieldset>
          <legend>Sampling</legend>
          <label htmlFor={samplesId}>Measured samples per case</label>
          <select
            id={samplesId}
            onChange={(event) => {
              onSamplesChange(Number(event.target.value));
            }}
            value={samples}
          >
            {Array.from({ length: 8 }, (_, index) => index + 3).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </fieldset>
        <div className="protocol-card">
          <p className="eyebrow">Locked protocol</p>
          <ul>
            <li>Three versioned prompt cases</li>
            <li>One warm-up per route</li>
            <li>Sequential seeded route order</li>
            <li>No fallback, cache, search, or healing</li>
          </ul>
        </div>
      </div>
    );
  }

  const activeSettings =
    options.fallbackModels.length +
    Number(options.cache) +
    Number(options.webSearch) +
    Number(options.responseHealing) +
    Number(Boolean(options.serviceTier)) +
    Number(maxOutputTokens !== Math.min(800, maxOutputTokensLimit));
  return (
    <div className="settings-stack">
      <fieldset>
        <legend>Custom input</legend>
        <label htmlFor={promptId}>Prompt</label>
        <textarea
          id={promptId}
          maxLength={32_768}
          onChange={(event) => {
            onPromptChange(event.target.value);
          }}
          rows={6}
          value={prompt}
        />
      </fieldset>
      <fieldset>
        <legend>Route columns, one to four</legend>
        <div className="route-editor">
          {routes.map((route, index) => (
            <div className="route-editor__row" key={route.id}>
              <span className="data">{index + 1}</span>
              <select
                aria-label={`Provider for route ${index + 1}`}
                onChange={(event) => {
                  const provider = event.target.value;
                  if (isProviderRoute(provider)) {
                    onRoutesChange(
                      routes.map((item) => (item.id === route.id ? { ...item, provider } : item)),
                    );
                  }
                }}
                value={route.provider}
              >
                {availableProviders.map((provider) => (
                  <option key={provider} value={provider}>
                    {PROVIDER_DEFINITION_BY_ID[provider].label}
                  </option>
                ))}
              </select>
              <input
                aria-label={`Model for route ${index + 1}`}
                className="route-editor__model"
                onChange={(event) => {
                  onRoutesChange(
                    routes.map((item) =>
                      item.id === route.id ? { ...item, model: event.target.value } : item,
                    ),
                  );
                }}
                value={route.model}
              />
              {route.provider === "openrouter" || route.provider === "gateway" ? (
                <input
                  aria-label={`Backing provider for route ${index + 1}`}
                  className="route-editor__backing"
                  onChange={(event) => {
                    onRoutesChange(
                      routes.map((item) =>
                        item.id === route.id
                          ? { ...item, routeProvider: event.target.value.trim() || undefined }
                          : item,
                      ),
                    );
                  }}
                  placeholder="Backing provider (optional)"
                  value={route.routeProvider ?? ""}
                />
              ) : null}
              <button
                aria-label={`Remove route ${index + 1}`}
                className="icon-button route-editor__remove"
                disabled={routes.length === 1}
                onClick={() => {
                  onRoutesChange(routes.filter((item) => item.id !== route.id));
                }}
                type="button"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          className="button button--quiet"
          disabled={routes.length >= 4}
          onClick={() => {
            const provider = availableProviders[routes.length % availableProviders.length];
            if (provider) {
              onRoutesChange([...routes, routeFor(provider, model, nextRouteOrdinal(routes))]);
            }
          }}
          type="button"
        >
          Add route
        </button>
      </fieldset>
      <p className="active-settings">{activeSettings} advanced settings active</p>
      <details>
        <summary>Routing</summary>
        <label>
          Fallback models, comma separated
          <input
            onChange={(event) => {
              onOptionsChange({
                ...options,
                fallbackModels: event.target.value
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean)
                  .slice(0, 2),
              });
            }}
            value={options.fallbackModels.join(", ")}
          />
        </label>
      </details>
      <details>
        <summary>Cost</summary>
        <label>
          Maximum output tokens
          <input
            inputMode="numeric"
            max={maxOutputTokensLimit}
            min={1}
            onChange={(event) => {
              onMaxOutputTokensChange(Number(event.target.value));
            }}
            type="number"
            value={maxOutputTokens}
          />
        </label>
        <label>
          Service tier
          <select
            onChange={(event) => {
              onOptionsChange({ ...options, serviceTier: serviceTier(event.target.value) });
            }}
            value={options.serviceTier ?? ""}
          >
            <option value="">Provider default</option>
            <option value="auto">Auto</option>
            <option value="standard">Standard</option>
            <option value="flex">Flex</option>
            <option value="priority">Priority</option>
          </select>
        </label>
      </details>
      <details>
        <summary>Reasoning</summary>
        <p>
          Reasoning is set per route by the model provider. Explicit controls are disabled until the
          selected route advertises support.
        </p>
      </details>
      <details>
        <summary>Diagnostics</summary>
        <label>
          <input
            checked={options.cache}
            onChange={(event) => {
              onOptionsChange({ ...options, cache: event.target.checked });
            }}
            type="checkbox"
          />{" "}
          Prompt cache
        </label>
        <label>
          <input
            checked={options.webSearch}
            onChange={(event) => {
              onOptionsChange({ ...options, webSearch: event.target.checked });
            }}
            type="checkbox"
          />{" "}
          Web search
        </label>
        <label>
          <input
            checked={options.responseHealing}
            onChange={(event) => {
              onOptionsChange({ ...options, responseHealing: event.target.checked });
            }}
            type="checkbox"
          />{" "}
          Response healing
        </label>
      </details>
    </div>
  );
}

function nextRouteOrdinal(routes: readonly BenchmarkRouteSpec[]): number {
  let maximum = 0;
  for (const route of routes) {
    const match = /^route-(\d+)$/.exec(route.id);
    maximum = Math.max(maximum, match ? Number(match[1]) : 0);
  }
  return maximum;
}

export function routeFor(
  provider: ProviderRoute,
  model: string,
  index: number,
): BenchmarkRouteSpec {
  return { id: `route-${index + 1}`, model, provider };
}

function serviceTier(value: string): ExploreOptions["serviceTier"] {
  if (value === "auto" || value === "standard" || value === "flex" || value === "priority") {
    return value;
  }
  return undefined;
}
