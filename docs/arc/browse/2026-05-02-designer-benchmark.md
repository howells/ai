# Experience Report: Howells AI Benchmark

**Persona:** Designer
**Date:** 2026-05-02
**URL:** http://localhost:23010/
**Browser:** cursor-ide-browser (Cursor's bundled Chrome)

## App Context

A latency benchmark for `@howells/ai` — an opinionated developer tool for comparing TTFT / TPS / total time across model × provider routes. The app shell is intentionally bounded (no page scroll) and aims for a Bloomberg-terminal-light aesthetic: paper canvas, restrained accents, mono numerals, Geist Sans + Geist Mono, OKLCH neutrals.

---

### Observation 1: The chrome eats the data

**Screen:** `/` — default state with prompt panel open

**What I noticed:** On a 1440×900 viewport, the chrome above the table — header, prompt/settings panel, toolbar, run-queue strip, two-row sub-header — consumes roughly 520px of vertical space. Only ~3 of 31 rows are visible at rest. The first cell of real data sits below the fold of the visible viewport once the eye has finished traversing the controls.

**Why it matters:** This is a data tool — the table is the product. The current chrome:data ratio is roughly 50:50; the conventional ratio for a dev/admin grid is closer to 25:75. The settings panel alone takes 22% of the viewport for parameters that, for most sessions, get set once and forgotten. There's a beautifully designed collapsed strip already implemented (`1r · 200t · TTFT · comfortable`) — it just isn't used as the default state.

**Evidence:** Default-open settings panel pushes the table fold below the visible viewport (`page-2026-05-02T17-50-38-240Z.png`). Collapsed-state shows the data dominating instead (`page-2026-05-02T17-51-50-103Z.png`).

**Suggestion:** Default the settings panel to **collapsed**. Open it on first visit only (localStorage) or behind a chevron. The collapsed strip is already the densest piece of information design in the app — let it carry the parameters and reserve the open panel for editing moments.

---

### Observation 2: Density toggle is decorative

**Screen:** `/` — toolbar density toggle (`Cozy` / `Compact`)

**What I noticed:** Switching from Cozy to Compact changes one class on the cells: `py-2.5` → `py-1.5` (10px to 6px). Total row-height delta: ~4px. Visually, Compact looks identical to Cozy because the row's vertical real estate is dominated by the model name (semibold xs) + the id (mono 10px) + the pills (28px row of slot tags) — none of which the toggle touches.

**Why it matters:** A density toggle in a data tool sets an expectation — click "Compact" and the grid should compress to fit twice as many rows. Here, you click and almost nothing happens. The toggle becomes either confusing (did it work?) or invisible (you stop using it). It's currently a label without an action.

**Evidence:** Code-confirmed in `apps/benchmark/components/benchmark-table.tsx:209` — the entire density branch is `density === "compact" ? "py-1.5" : "py-2.5"`. Visual diff between modes is imperceptible in screenshots.

**Suggestion:** Either commit to a real Compact (collapse the row to ~36-44px — name only, id and pills hidden behind a row-expander or moved to a tooltip) or drop the toggle and pick a single sensible default. A half-measure on a binary toggle costs more credibility than no toggle.

---

### Observation 3: The pre-run grid is a constellation, not a canvas

**Screen:** `/` — initial state, before any benchmark has been run

**What I noticed:** With 31 models × 9 provider columns ≈ 280 cells. Every "ready" cell renders as a small empty circle `○`. Even at the chosen subdued tone, 280 circles arranged in a regular grid form a pattern that the eye reads as content. The pre-run state looks more decorated than the post-run state will: results will replace circles with mono numerals, which is a *quieter* surface, not a busier one.

**Why it matters:** Designed empty states do work. This one does the opposite — it manufactures noise where the user hasn't asked for any. The legend explains the dot ("ready"), but at this volume the legend can't undo the visual rhythm. The dot is a status that should appear *during* a run (queued / running / ready), not before one has been requested.

**Evidence:** Default screenshot — 5 visible rows × 4 visible columns of circles, with another 5 columns scrolled off (`page-2026-05-02T17-51-50-103Z.png`).

**Suggestion:** Render ready cells as truly blank background. Reserve the `○` for `queued` / `running` / `ready` states once a run has been submitted. The first run is the moment the grid earns its dots.

---

### Observation 4: No row hover state

**Screen:** `/` — table interaction

**What I noticed:** Hovering any model row produces zero visual response. The row, its cells, and the leading checkbox stay neutral. With 9 provider columns and (eventually) horizontal scroll, the user's primary mechanism for keeping their place — "which row am I scanning?" — isn't there.

**Why it matters:** This is the single cheapest readability fix in any wide grid. Refactoring UI is explicit on this — alternating row tints, hover stripes, or a focus-row indicator are *not* decoration; they are the difference between a scannable grid and a wall of cells. The current grid asks the user's eye to do the work of alignment 280 times.

**Evidence:** Hover state on `DeepSeek V3.2` row is identical to non-hover state (`page-2026-05-02T17-53-38-131Z.png`).

**Suggestion:** Add a subtle row-tint on hover (`bg-surface/60` or a 2-3% darkening). Optionally, a 2px accent-color stripe on the row's left edge to anchor the active scan-line.

---

### Observation 5: Horizontal overflow has no edge affordance

**Screen:** `/` — right edge of table at 1440px viewport

**What I noticed:** A clipped letter `m` (the start of the next provider's accent label) hangs at the right edge of the table. There is no fade, no scroll-shadow, no chevron, no scrollbar in view. Most users won't realise the table extends further right.

**Why it matters:** With 9 providers (5 OpenRouter-routed + 4 direct), at this viewport you're seeing 4-5 of them. Half the data is invisible by default and there's no visual signal saying "scroll right". A user evaluating "do I have OpenAI vs Anthropic latency?" can answer that question; "do I have Z.ai or Moonshot?" — they won't even know to ask.

**Evidence:** Right-edge of every screenshot shows the dangling `m` and an empty band beyond (`page-2026-05-02T17-50-38-240Z.png`).

**Suggestion:** Add a scroll-shadow on the right edge (`linear-gradient` mask) when the table can scroll right, and the same on the left when scrolled. Industry-standard pattern, ~10 lines of CSS, transformative for grid scannability.

---

### Observation 6: The two facet popovers behave like different components

**Screen:** `/` — Tier vs Task popover

**What I noticed:** Two facets that share trigger styling, layout, and intent disagree internally. Tier opens to a list of options with descriptions. Task opens with an extra `SELECT ALL · CLEAR` toolbar at the top, plus the same option list. Both popovers are too tall to fit between the trigger and the run-strip — Tier clips at `reasoning`, Task clips at `bulk`. Neither has a viewport-aware max-height.

**Why it matters:** Components in the same family that look identical and behave differently are a hallmark of unintentional drift. The user learns one popover's affordances, opens the second, and feels mildly betrayed when the chrome shifts. The clipping turns descriptions — a deliberate UX choice to teach the vocabulary — into half-information.

**Evidence:** Tier popover with `reasoning` clipped (`page-2026-05-02T17-52-07-049Z.png`); Task popover with bulk/vision/reasoning/longContext/creative below the fold (`page-2026-05-02T17-54-00-884Z.png`).

**Suggestion:** Unify the popover internals (one with-toolbar variant, used by both, or none at all — the toolbar is most useful where there are 9+ options, i.e. Task and Family). Set `max-height: min(420px, calc(100vh - 200px))` and make the popover scroll internally instead of clipping under the run-strip.

---

### Observation 7: Label fatigue — too many uppercase voices

**Screen:** `/` — top-of-app glance

**What I noticed:** Above the table fold I count, by row: `BENCHMARK`, `PROMPT`, `78 CHARACTERS`, `ROUNDS`, `TOKENS`, `METRIC`, `DENSITY`, `TIER`, `TASK`, `FAMILY`, `PROVIDER`, `MODELS`, `SELECTED`, `MODEL`, `OPENROUTER`, `GATEWAY`, `ANTHROPIC`, `OPENAI`, `DEFAULTS · 7 MODELS`, plus the legend strip `BEST`, `KEY`, `TTFT`. That's 22+ uppercase tracked-out micro-labels in roughly 500px of vertical space.

**Why it matters:** All-caps tracked-out labels are useful — sparingly. Used to mark every parameter, every column, every group, every legend item, the voice loses signal: nothing is special anymore because everything is shouting. The eye starts to skip the labels entirely, which is the opposite of what they're for.

**Evidence:** Default-open screenshot — count the uppercase strings across header, prompt panel, run-strip, table header, legend bar (`page-2026-05-02T17-50-38-240Z.png`).

**Suggestion:** Reserve uppercase for the most structural labels: section names (`PROMPT`, `MODEL`) and group headers (`DEFAULTS`). Render parameter labels (`Rounds`, `Tokens`, `Metric`, `Density`) and facet labels (`Tier`, `Task`, `Family`, `Provider`) in normal-case, lighter text. The downshift will make the remaining caps feel intentional.

---

### Observation 8: There's no memorable element beyond the run-queue strip

**Screen:** `/` — overall first impression

**What I noticed:** The aesthetic direction is "competent admin/dev utilitarian" — Bloomberg-light, Linear-adjacent, restrained. It's well-executed but it's not specific to *this* app. The one moment that earns identity is the run-queue strip: a giant mono `19` followed by `RUNS QUEUED · 7 MODELS · 5 PROVIDERS · 1 ROUND · ≈ 19 live API calls`. That's a piece of information design that no SaaS dashboard would ship — it has voice.

**Why it matters:** A developer tool doesn't need to be loud, but it does need a moment that someone could screenshot and remember. Take the run-queue strip away and what remains could be any open-source benchmarking utility. The opportunity is to push that single moment of confidence — the mono `19` — into a signature treatment that recurs once or twice elsewhere.

**Evidence:** The run-queue strip (`page-2026-05-02T17-51-50-103Z.png`, mid-page) is the most memorable element by an order of magnitude.

**Suggestion:** Lean into the run-queue's voice. After a run completes, replace the queue strip's `19 RUNS QUEUED` with a similarly chunky `12.4 s WALL · 47 best · 2 errors` or similar — same typographic treatment, same horizontal scale. Repeat the pattern in the legend bar status (`5/10 KEYS`) at a smaller scale. One memorable type-treatment, used three times across the app, becomes a signature.

---

## Summary

The aesthetic direction is intentional and disciplined — Geist + OKLCH neutrals + a paper/surface ladder land somewhere between Bloomberg-light and Linear, which is the right room for a developer tool. Where it falters is on **affordance and ratio**: the chrome currently outsizes the data, the density toggle and hover states under-deliver, and a constellation of pre-run dots crowds a grid that should feel quieter. The single highest-leverage change is to default the settings panel to collapsed and render ready cells as truly blank — both shift the visual centre of gravity to the table, where the product actually lives. The second is to commit harder to the one moment of identity that already works (the run-queue strip's typographic voice) and let it recur elsewhere.
