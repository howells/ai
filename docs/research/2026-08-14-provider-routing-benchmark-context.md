# Provider routing benchmark context

**Reviewed:** 14 August 2026
**Scope:** Vercel AI Gateway, OpenRouter, and direct-provider routes in `@howells/ai`
**Evidence:** repository history and source, plus first-party provider documentation and public model APIs
**Live inference:** credential smoke run only; no comparative benchmark completed

## Recommendation

Keep Vercel AI Gateway as the package default provisionally, but describe that as an intentional `@howells/ai` routing default rather than evidence that every consuming project consciously uses AI Gateway.

The previous choice was real, not accidental. Commit `c51ac64` changed the default from OpenRouter to Gateway after the then-current benchmark found Gateway “matching or beating OpenRouter on most models.” Gateway remains attractive for this portfolio because it has no inference markup, authenticates automatically on Vercel, exposes unified spend and generation metadata, and now supports explicit routing by cost, time to first token, or throughput. [Vercel says Gateway uses provider list prices with no markup, including BYOK](https://vercel.com/docs/ai-gateway/pricing), and its current routing controls can sort providers by `cost`, `ttft`, or `tps` while returning the routing decision in response metadata. [Vercel routing announcement](https://vercel.com/changelog/sort-providers-by-cost-latency-or-throughput-on-ai-gateway)

Do not treat the old benchmark as decisive today. Its raw samples are not committed, and the July hardening migration explicitly deleted the legacy benchmark table. The model set and both gateways' routing systems have also changed substantially. A fresh benchmark is justified, but the current rigorous protocol needs a small versioned correction before paid calls are useful.

## Live rerun status

A route smoke run was attempted on 14 August before starting the paid rigorous matrix. It deliberately stopped short of reporting performance because the configured routes were not comparable:

| Route | Result |
| --- | --- |
| Vercel AI Gateway | Authentication reached Gateway, but all four candidate models were blocked by free-tier credit/rate limits. |
| OpenRouter | The configured key returned `401 User not found`. |
| Direct Google | The key's bound service account is deleted or disabled. |
| Direct OpenAI | The configured project is archived. |
| Direct Anthropic | Claude Sonnet 4.6 generated successfully; this proves only that the Anthropic credential works, not that direct Anthropic is faster. |

Across the aborted matrix and two diagnostic smoke passes, 54 route requests were attempted. Fifty-two failed before generation because of the account states above; two small direct-Anthropic generations succeeded. These are credential diagnostics, not benchmark samples, and must not be used to rank routes.

The production benchmark deployment does not provide a clean fallback. It is 102 days old, its explicit provider keys are 103 days old, and the current benchmark authentication variables are absent. Refresh the provider accounts and redeploy the corrected protocol before collecting a new cohort.

The decision should not be “one router wins everything.” The likely durable policy is:

- **Gateway default:** Vercel-hosted applications that benefit from zero-config authentication, consolidated Vercel observability, and automatic provider selection.
- **OpenRouter route:** broad or early model availability, fine-grained provider policy, price/latency/throughput thresholds, external observability broadcast, or its free/quality/speed routers.
- **Direct-provider route:** a control in benchmarks; first-party-only features, service tiers, capacity agreements, or strict provider identity in production.

## What the earlier decision actually established

The repository record is unusually clear even though the data is gone:

- Commit `664f72e` introduced a matrix benchmark across Gateway, OpenRouter, Anthropic, OpenAI, and Google, measuring TTFT, tokens per second, and total duration.
- Forty-seven minutes later, commit `c51ac64` changed the default route from OpenRouter to Gateway. Its commit message records three reasons: consistent speed, Vercel auto-authentication, and built-in dashboard observability.
- The first persisted benchmark implementation arrived later in commit `368693d`.
- The July migration [`0002_delete_legacy_history.sql`](../../apps/benchmark/migrations/0002_delete_legacy_history.sql) permanently deletes the legacy raw-prompt history. Consequently, Git preserves the decision and methodology evolution but not the original observations.

This means the earlier conclusion should be given weight as Daniel's measured preference at that time, but it cannot provide a reproducible baseline for the 2026 rerun.

## What the current harness measures

The current rigorous suite is considerably better controlled than the first matrix:

- Three versioned prompt cases: concise explanation, structured advice, and TypeScript generation.
- One warm-up request per route.
- Three to ten requested samples per case.
- Sequential execution with seeded shuffling of route order within paired prompt/sample blocks.
- Cache, reasoning, search, response healing, model fallbacks, and SDK retries disabled.
- End-to-end TTFT, generation duration, total duration, output tokens, throughput, reliability, and reported cost.
- Median and interquartile range rather than a single mean.
- Persistence of deployment region, Git revision, requested and resolved model IDs, route, backing provider when discoverable, and cost.

See [`benchmark-run.ts`](../../apps/benchmark/lib/benchmark-run.ts), [`route.ts`](../../apps/benchmark/app/api/benchmark/route.ts), [`benchmark-results.tsx`](../../apps/benchmark/components/benchmark-results.tsx), and [`benchmark-store.ts`](../../apps/benchmark/lib/benchmark-store.ts).

The timer begins immediately before model resolution/request construction and ends after the response stream completes. TTFT is the first text delta, so it represents the user-visible path from the deployed benchmark function through the selected router to the upstream model. This is the right primary measure for the package's real deployment context. It is not a laboratory measurement of router computation alone.

## Corrections needed before rerunning

### 1. Separate routing-policy performance from router overhead

Both gateways now choose among upstreams dynamically:

- Gateway's default provider choice considers recent uptime and latency; `only`, `order`, and explicit sorting are available. [Vercel provider options](https://vercel.com/docs/ai-gateway/models-and-providers/provider-options)
- OpenRouter's default load balancing prioritizes stable, low-cost providers; explicit `price`, `latency`, and `throughput` sorting changes that behavior. It uses rolling five-minute performance statistics. [OpenRouter provider routing](https://openrouter.ai/docs/guides/routing/provider-selection)

Therefore an unpinned comparison of “Gateway vs OpenRouter” compares two routing policies and possibly two different upstream providers. That is useful for choosing the best **default experience**, but it does not measure gateway overhead.

Run two distinct experiments:

1. **Controlled upstream:** pin Gateway and OpenRouter to the same model host, disable provider and model fallbacks, and include the direct host as the control.
2. **Real default:** allow each gateway's normal routing policy and record the upstream selected on every sample.

The rigorous UI currently has no per-route upstream pin. `routeProvider` is only exposed in Explore, and rigorous Gateway calls do not set `only`. `routing: { fallbacks: false }` maps to OpenRouter's `allow_fallbacks: false`, but [`generation.ts`](../../src/generation.ts) does not translate it into a Gateway fallback-disable flag. A single Gateway `only` provider is the reliable control.

### 2. Make backing provider part of the result identity

The API attempts to extract and persist `backing_provider`, but the SSE result omits it and historical aggregation groups only by logical model and router. Samples from Anthropic, Bedrock, Vertex, Azure, or another host can therefore be blended into one Gateway/OpenRouter median.

Add backing provider, resolved model snapshot, route policy, and service tier to:

- the streamed result;
- the result grouping key;
- cohort history rows;
- the UI summary and export.

A controlled sample whose upstream cannot be identified should be marked invalid rather than silently included.

### 3. Version the new protocol and stop cohort collisions

`RIGOROUS_SUITE.version` and `BENCHMARK_PROTOCOL_VERSION` are still `1`. More importantly, [`benchmark-store.ts`](../../apps/benchmark/lib/benchmark-store.ts) hard-codes `appVersion: "0.3.0"` in the cohort hash and persisted run even though the package is now `0.4.1` and has moved to AI SDK 7.

Before rerunning:

- derive the app version from a build constant or package metadata;
- bump the protocol and suite version;
- include route policy, selected providers, provider adapter versions, service tier, and upstream constraint in the cohort identity;
- keep Git SHA as a secondary audit field.

Without this, semantically different runs can be aggregated as though they were one experiment.

### 4. Make service tier observable and equivalent

Rigorous mode requests `serviceTier: "standard"`, but the provider adapters do not map that uniformly:

- OpenAI maps it to the direct provider's `default` tier.
- Google receives `standard`.
- Anthropic's mapper currently ignores it.
- OpenRouter receives no service-tier option.
- Gateway receives upstream-specific options inferred from the model owner, but the assigned tier is not recorded.

This matters more after recent provider changes. OpenAI's direct API now has a paid Fast mode (formerly Priority processing) that can deliver substantially faster and more consistent latency, while Anthropic reports the tier actually assigned in response usage. [OpenAI Fast mode](https://developers.openai.com/api/docs/guides/fast-mode), [Anthropic service tiers](https://platform.claude.com/docs/en/api/service-tiers)

The fair baseline is each route's explicitly verified standard/default tier. Fast/priority should be a separate cost-performance experiment, not accidentally mixed into the router comparison.

### 5. Strengthen cost and usage capture

Gateway returns cost metadata automatically. OpenRouter now includes detailed usage—including native token counts, cache tokens, total cost, and upstream inference cost—in every response; its former `usage.include` switch is deprecated. [OpenRouter usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting)

The package still conditionally sends the old OpenRouter include flag, while the benchmark's recursive cost extractor may work only if the AI SDK adapter preserves the new fields. Add fixture-backed tests against the installed adapters and persist:

- billed cost;
- upstream inference cost when supplied;
- cached, reasoning, input, and output native tokens;
- generation/request ID for later provider-side audit.

OpenRouter's generation endpoint can independently return provider, latency, generation time, service tier, cost, and upstream cost. [OpenRouter generation metadata](https://openrouter.ai/docs/api/api-reference/generations/get-generation)

### 6. Adjust run size to the actual safety limits

With three routes, five measured samples consumes 48 attempts: three warm-ups plus 45 measured calls. Six samples would consume 57 and fail the default per-run limit of 50, even though the UI offers up to ten. Long frontier calls can also approach the 295-second hard timeout because rigorous execution is sequential.

Keep the per-run protocol small and aggregate identical versioned cohorts across time:

- three samples per case, three routes: 30 total attempts;
- repeat five times across at least three periods of the day and preferably three days;
- use different seeds while keeping every other cohort field identical.

That yields 45 measured observations per route and prompt set without creating one fragile five-minute request. It also samples changes in provider load rather than treating one short window as permanent truth.

### 7. Add workload-shaped cases

The three current prompts are appropriate for inexpensive TTFT smoke tests, but too short to decide the overall default. Add separate suites rather than bloating one score:

- **Interactive:** short answer, tool-call JSON, and concise structured output; prioritize TTFT and p75/p95 total latency.
- **Generation:** fixed-shape 500–1,000 token output; prioritize throughput and total duration.
- **Agentic:** deterministic tool schema and multi-step call; score schema/tool success as well as time.
- **Long-context/cache:** a stable long prefix with cold write, immediate read, and post-TTL read; record cache tokens and cost.
- **Failure drill:** controlled bad/slow upstream where possible; measure successful failover rate and added tail latency separately from steady-state speed.

Streaming is correctly retained: OpenAI describes it as the strongest way to reduce perceived wait, and the package serves interactive applications. [OpenAI latency guidance](https://developers.openai.com/api/docs/guides/latency-optimization)

## Suggested first rerun matrix

The public Gateway and OpenRouter model APIs were queried without authentication on 14 August 2026. Both catalogues currently list the package's main cross-route candidates, including Claude Sonnet 4.6, Claude Opus 4.8, GPT-5.5, Gemini 3.5 Flash, Gemini 3.1 Flash Lite, and GPT-OSS 120B. [Gateway model API](https://ai-gateway.vercel.sh/v1/models), [OpenRouter model API](https://openrouter.ai/api/v1/models)

Start with three models rather than benchmarking the entire catalogue:

| Workload | Model | Routes | Why |
| --- | --- | --- | --- |
| Premium coding/agentic | `anthropic/claude-sonnet-4.6` | Gateway pinned Anthropic, OpenRouter pinned Anthropic, direct Anthropic | High-value production-shaped route; several alternate hosts exist, so pinning exposes the distinction clearly. |
| Premium general/coding | `openai/gpt-5.5` | Gateway pinned OpenAI, OpenRouter pinned OpenAI, direct OpenAI | Current package coding standard; validates direct default-tier equivalence. |
| Fast multimodal/general | `google/gemini-3.5-flash` | Gateway pinned Google, OpenRouter pinned Google, direct Google | Current package standard default; latency and caching are material. |

Then run a second pass with only the two gateways on their normal automatic routing. Add `google/gemini-3.1-flash-lite` if the fast/nano tiers matter operationally, and `openai/gpt-oss-120b` through the same host if router selection among open-model inference providers is a real use case. Defer Claude Opus 4.8 until the protocol is validated on cheaper models.

Use exact model snapshots when all three routes expose them. If only a moving alias is portable, record every resolved snapshot and invalidate a paired block when snapshots differ.

## Current product trade-offs

### Vercel AI Gateway

**Strengths**

- No inference markup, including BYOK, and a small included credit before an account becomes paid. [Pricing](https://vercel.com/docs/ai-gateway/pricing)
- Automatic authentication for Vercel workloads is already supported by [`gateway.ts`](../../src/providers/gateway.ts).
- Same-model provider failover, model fallbacks, spend controls, and routing by cost/TTFT/TPS. [Gateway overview](https://vercel.com/docs/ai-gateway)
- Dashboard visibility into spend, request volume, TTFT, tokens, model, provider, and project; the package additionally exposes credits, spend, model list, and generation-info APIs. [Gateway product page](https://vercel.com/ai-gateway)

**Costs/limits**

- Strongest ergonomic advantage applies on Vercel; outside Vercel it is simply another authenticated network hop.
- Default routing can obscure which host produced a latency result unless provider metadata is captured.
- Its provider-policy surface is improving quickly, so benchmark semantics must be versioned.

### OpenRouter

**Strengths**

- Rich provider controls: order/allow/deny, fallback policy, price ceilings, quantization, privacy, and explicit latency or throughput thresholds using recent percentiles. [Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection)
- Detailed response usage and generation metadata, activity exports, and asynchronous trace broadcast to external observability systems. [Usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting), [Broadcast](https://openrouter.ai/docs/guides/features/broadcast/overview)
- Wide model/provider catalogue and explicit free, throughput, cheapest, and quality-oriented route variants.

**Costs/limits**

- Inference is passed through without markup, but purchasing credits has a 5.5% fee with a minimum charge; BYOK is free for the first one million monthly requests and then incurs a fee. [OpenRouter FAQ](https://openrouter.ai/docs/faq), [BYOK](https://openrouter.ai/docs/guides/overview/auth/byok)
- Its default route is price-weighted among stable providers, whereas Gateway's default also emphasizes latency. An unconfigured benchmark can therefore make OpenRouter appear slower for a legitimate policy reason rather than proxy overhead.
- Cold edge caches and low credit balances can add latency, according to OpenRouter's own performance guidance. [Latency and performance](https://openrouter.ai/docs/features/latency-and-performance)

### Direct providers

**Strengths**

- Unambiguous provider identity and the cleanest control for measuring each gateway.
- Immediate access to first-party service tiers, cache controls, request IDs, capacity/rate-limit reporting, and provider-specific features.
- No gateway account or cross-provider data-policy layer.

**Costs/limits**

- Separate credentials, billing, rate limits, dashboards, adapters, and incident handling.
- No automatic cross-provider or cross-model failover unless the application implements it.
- “Direct” is not guaranteed to be fastest from every deployment region; only end-to-end measurement from the actual Vercel function can establish that.

## Decision rule after the rerun

Keep Gateway as the default if it meets all of these:

1. On controlled upstreams, median TTFT is within 10% of the fastest route and p75 total latency is not materially worse on at least two of the three representative models.
2. On automatic routing, it wins or is statistically indistinguishable on the interactive suite without a meaningful reliability or cost penalty.
3. Resolved upstream, service tier, and billed cost are available for at least 99% of successful samples.
4. Its operational benefit—Vercel auth, consolidated spend, and fallback—remains useful in the consuming deployment context.

Choose OpenRouter as the default only if its normal routing consistently wins the workload-shaped tests or its broader routing/observability surface is used enough to outweigh the Vercel integration. Choose explicit direct routes per workload when first-party tier/capability control matters more than unified routing.

Do not collapse all metrics into a synthetic winner. Publish TTFT, p75/p95 total latency, throughput, reliability, billed cost, upstream identity, and task success separately, then make the default a product judgment over those dimensions.

## Practical conclusion

The earlier Scaffold wording was too broad, but the opposite claim—“you do not use Gateway”—is also not established by the package. `@howells/ai` deliberately defaults to Gateway, and any consumer that calls `ai.model(...)` without a provider can use Gateway implicitly, including through Vercel OIDC. The accurate documentation is:

> `@howells/ai` is the canonical abstraction. Its current default language-model route is Vercel AI Gateway, with OpenRouter and direct-provider routes available per call. The default is benchmark-informed and should be revalidated as models and routing systems change.

That preserves the measured design decision without turning it into a portfolio-wide claim that every project explicitly chose or depends on AI Gateway.
