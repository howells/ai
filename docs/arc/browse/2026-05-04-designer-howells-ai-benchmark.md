# Experience Report: Howells AI Benchmark

**Persona:** Designer
**Date:** 2026-05-04
**URL:** http://localhost:23010
**Browser:** Playwright (1280×900, 1024×768 sweeps) + cursor-ide-browser (defaults)
**Focus from user:** alignment, overflows, movement around the table

## App Context

A V7-leaning, light-mode benchmark page for `@howells/ai`: pick model rows, pick providers (Gateway, OpenRouter, plus seven directs), hit Run, watch matched-model timings + costs stream into a sticky-header table. Strip on top is the page's primary status surface; tooltips and history come from a Neon DB.

---

### Observation 1: Right edge of the table silently disappears at common laptop widths

**Screen:** `/`
**What I noticed:** The table's intrinsic width is **1414.88px** (model column 481px + 7×110px + OpenRouter 116px + selector 48px). Below ~1430px viewport the rightmost provider columns just... stop. At 1280, "Z.ai" header is about 85px visible and "Moonshot" is reduced to ~24px — the body cell underneath them clips mid-value (e.g. on the GLM 4.7 row I can see `4.96` truncated to `4.96` against the right edge). At 1024 the table cuts off after OpenAI; the entire xAI/Z.ai/Moonshot stack is offscreen with **no visible affordance**: no scroll thumb until you hover, no edge gradient, no "+3 more" hint, nothing.
**Why it matters:** This is the headline benchmark surface — the user's premise is "compare 8 providers side-by-side." If three of them are invisible by default at any standard MBP/laptop width, the comparison breaks. It also undermines the "8 providers" headline number in the strip: the strip says 8, the eye sees 5.
**Evidence:** Screenshots `02-table-1280.png` (header "Z.ai" clipping, no visible Moonshot) and `07-1024-narrow.png` (only OpenRouter / Gateway / Anthropic / OpenAI fully visible). The `.scroll-shadow-x` Lea-Verou pattern is in place but its cover gradients are `var(--color-surface) → transparent` over a white surface, so they're rendering but invisible.
**Suggestion:** Either (a) bump the scroll-shadow stops to a real grey (`oklch(0.94 ...)`) so the right edge fades into a hint, (b) add a fixed right-side fade with a small `→ 3 more` chip, or (c) introduce column priority so direct-only providers collapse into a "Direct" group on narrow widths. The current Lea-Verou shadow technique is the right direction — it just isn't tuned for a white-on-white canvas.

---

### Observation 2: Movement under the column header — body content peeks above the sticky head while scrolling

**Screen:** `/` (during vertical scroll of the table)
**What I noticed:** Sticky behaviour is implemented per-cell (`thead th { position: sticky; top: 0 }`), not on `<thead>`. As I scroll the table body, **fragments of the row that just left the viewport are visible in a 6–10px band above the column-header row.** It's a thin, ghosty strip of letterforms ("…FLASH PR…") that sits between the run-queue strip and the OpenRouter/Gateway/etc. labels. The header itself is opaque white, so this isn't a transparency bug — it looks like body rows briefly paint outside the scroller's top edge before the sticky cell catches them.
**Why it matters:** Of all three things the user flagged, this is the most distracting "movement around the table." Every scroll gesture flickers a phantom line of text above the header. In a precision dashboard whose whole identity is monospace timings and tabular calm, that flicker is the loudest thing on the page.
**Evidence:** Screenshot `03-scrolled-mid-table.png` — between the strip's bottom edge (`y≈155`) and the OpenRouter label (`y≈175`) you can see the orphaned glyph row. Inspector confirms `<thead>` is `position: static` at `y=-396` while individual `<th>` cells are `sticky/top: 0/zIndex: 30/background: white`. The "Defaults 12" / "Task-optimized 7" group rows are also doing their own sticky thing and may be racing for the same anchor.
**Suggestion:** Lift sticky to the row level (`thead tr { position: sticky; top: 0; z-index: 30 }`) and give the `thead` a 1px solid bottom border using `--color-border` so the seam between scrolling content and the pinned header is sharp instead of feathered. Alternatively, set `clip-path: inset(0 0 0 0)` on the scroller to strictly clip overscan paint.

---

### Observation 3: Provider columns are not equal-width, and the asymmetry shows

**Screen:** `/`
**What I noticed:** At 1440 viewport, OpenRouter's column is **115.91px** while every other provider column is exactly **110px**. The model column is **481px**. The 5.9px asymmetry on the leftmost provider column nudges every cell value rightward by a fraction relative to its neighbours, and because TanStack right-aligns the numeric content, the 705ms green pill on Grok 4.1 Fast (xAI column) doesn't sit directly above 4.89s (xAI column on Grok 4.3) by quite the same offset as 1.27s (OpenRouter, Gemini 3 Flash) sits above 1.25s (OpenRouter, Claude Opus 4.7). At a glance this reads as columns having different "personalities" without the data justifying it.
**Why it matters:** The page is a comparison surface. Equal columns telegraph "this is a like-for-like read." Unequal columns whisper "OpenRouter is special" — which is a story the data, not the layout, should be telling.
**Evidence:** TH bounding box dump: OpenRouter `width=115.9140625`, Gateway/Anthropic/OpenAI/Google/xAI/Z.ai/Moonshot all `width=110`. Visible in `01-first-impression-1440.png` if you measure with a ruler — OpenRouter values sit ~3px further left than expected.
**Suggestion:** Pin all provider columns to `--col-provider: 110px` (or `1fr` with `min-width: 110px`) and let any header text overflow into a tooltip. "OpenRouter" is 10 characters, "Anthropic" / "Moonshot" are 9 — that's not enough to warrant a custom width.

---

### Observation 4: The run-queue strip cycles through four shapes with no transition

**Screen:** `/` (idle-no-history → idle-with-history → running → done)
**What I noticed:** The strip swaps content based on state, and the layout reflows hard each time:
- Fresh load (no history): `33 / calls queued · 33 routes · 12 models · 8 providers · 1 round · ≈ 33 live API calls · uses your keys / Run →`
- Idle with history: `33 / calls queued · 33 routes · 12 models · 8 providers · 1 round · Historical route avg 0.64x · xAI · 2 matched / Run →`
- Running: `33 / calls queued · 33 routes · 12 models · 8 providers · 1 round · 32/33 · Cancel`
- Done: `33 / calls queued · Fastest 705ms · Grok 4.1 Fast · xAI · Fastest route avg 0.64x · xAI · 2 matched · Cost $0.02 / Run again →`
The `33` numeral in Fraunces is the only stable anchor. The five labelled stat-pairs (`33 routes`, `12 models`, `8 providers`, `1 round`, plus a long descriptor) **vanish entirely** in the "done" state, replaced by three different stat-pairs of different widths. The "Run" pill morphs into "Cancel" then into "Run again →" with no animation.
**Why it matters:** This is the page's primary status surface. Its job is to give a steady mental anchor for "what's happening now" — but the layout reshapes every time the user interacts. The user explicitly flagged "movement around the table," and the strip's per-state reflow is the biggest source of it. Also: in the idle-with-history state, "Historical route avg 0.64x · xAI · 2 matched" wraps onto two lines on viewports ≤1440 because there's no reserved slot for it, breaking the strip's single-line rhythm.
**Evidence:** `01-first-impression-1440.png` (idle-no-history with `≈ 33 live API calls`), `08-idle-with-history.png` (idle-with-history showing the wrapped "matched"), `04-running.png` (running with `32/33 · Cancel`), `05-after-run.png` (done with three new stats).
**Suggestion:** Reserve fixed slots: `[hero numeral] [scope: routes/models/providers/rounds] [primary insight: live | fastest | historical] [cost] [action]`. Empty-state slots should hold a `pill--ghost` placeholder so dimensions don't reshape. Then cross-fade the *content* of each slot, not the slot geometry — exactly the discipline the table cells already use with `pill--ghost`.

---

### Observation 5: Result cells show two stacked baselines that don't align row-to-row

**Screen:** `/` after a run
**What I noticed:** Each filled cell stacks `time` over `cost` (e.g. `1.27s` / `$0.0002`). Three things are off:
1. Row height is **58px** so the time label sits noticeably above the cell's vertical center; cells without a cost (just `—` or just a green pill) sit at center, so the eye gets a wave instead of a line as it sweeps a row.
2. Costs sometimes render in muted grey, sometimes red (e.g. `Claude Opus 4.7 / OpenRouter / $0.0047` shows red). The legend in the bottom strip never explains red — there's `best · — no route · running · no key · TTFT` but no cost-tone key.
3. `<$0.0001` and `$0` and `$0.0001` all coexist in adjacent rows, three different sub-cent formats stacked vertically — a small thing that makes the cost column feel hand-rolled rather than systematic.
**Why it matters:** Tabular UIs live or die on the eye-line discipline. The reason monospace + tabular numerals exists is so a column reads as a column, not a list of micro-decisions. The current stacked baseline + multi-format costs gives up that win.
**Evidence:** `04-running.png` and `05-after-run.png`. Compare the GLM 4.7 row (5 cells: 4.91s/$0.0004, 1.03s/$0.0006, —, —, 1.96s, 4.96, —) to Grok 4.3 (5 cells: 6.23s/$0.0013, 6.21s/$0.0014, —, —, —, 4.89s green, —). The two-line cells sit higher than the one-line cells in their rows.
**Suggestion:** Either (a) normalize to one-line cells with the cost living in the existing tooltip, or (b) hard-pin the time to vertical center and the cost as a 10px subline below it, regardless of whether a cost exists, using a `pill--ghost`-style transparent placeholder for missing costs. Add a one-line key for the red cost tone in the legend, or drop the tone entirely until there's a defined "expensive" rule (>$0.01? >2x median?).

---

### Observation 6: The "—" empty state can't tell two very different stories apart

**Screen:** `/`
**What I noticed:** Cells with no value all render the same em-dash. The `aria-label` on each "—" varies — some say "Gemini 3.1 Flash Lite Preview cannot route through Anthropic" (no route), others would say no API key configured — but visually they're identical. The footer legend even bothers to define both states: `· — no route` and `· no key` (in an amber-coloured pill). So the design *intends* to differentiate. The implementation doesn't.
**Why it matters:** "No route" is a permanent fact about a model/provider pair (Anthropic doesn't host Gemini). "No key" is a temporary fact about my account (I don't have a Moonshot key right now). Conflating them lies to the user about which gaps they could close by adding a key. With only 8 of 10 keys configured, this is exactly the page's job.
**Evidence:** Screenshot `01-first-impression-1440.png` — every "—" looks identical despite the legend distinguishing them. Snapshot accessibility labels confirm intent ("cannot route through Anthropic") but there's no visible variant.
**Suggestion:** Use the `pill--ghost` style for "no route" and the existing `pill--warn` (amber) for "no key", matching the legend. Or just dim "no route" to `--color-text-faint` and keep "no key" at `--color-warn-fg`. The legend already uses both — the table should follow.

---

### Observation 7: Filter-row utility controls disappear silently below 1280

**Screen:** `/` (1024×768)
**What I noticed:** At 1024 viewport, the right end of the filter row loses "Select visible" and "Clear" buttons (still present at 1280). The `27/27 · 12 selected` count remains, but the actions to act on it are gone with no overflow menu, no `…` indicator, no responsive cue.
**Why it matters:** The filter row is one of two main controls (along with the strip). Hiding actions silently violates Jakob's law — users expect either responsive collapse with a visible hint, or persistent presence. The page does neither.
**Evidence:** Compare `02-table-1280.png` (right side shows `27/27 · 12 selected · Select visible · Clear`) with `07-1024-narrow.png` (just `27/27 · 12 selected`).
**Suggestion:** Either keep the buttons visible (they're small) and let the filter pills compress, or wrap them into a `…` menu that's discoverable on narrow widths.

---

### Observation 8: Header band has competing horizontal frames — the strip ends at viewport, the table extends beyond it

**Screen:** `/` (1280×900, after horizontal scroll)
**What I noticed:** The run-queue strip lives **outside** the horizontal scroll container (its right edge sits at 1280px, the viewport). The table's column header lives **inside** the scroller (extends to 1414px). When the user horizontally scrolls to reveal Z.ai/Moonshot, the column headers slide left under the model column and the strip's "Run again" pill stays put. The strip's right edge and the table's right edge are no longer the same line. Combined with Observation 1 (no scroll affordance), the result is a layout where the two main horizontal frames disagree about where "right" is.
**Why it matters:** This isn't broken — it's the standard sticky-left + horizontal-scroll pattern. But the absence of edge fading + the unequal frames means there's no visual seam telling the user "the strip is fixed, the table scrolls." It just looks like the Run button got chopped off.
**Evidence:** `02-table-1280.png` — strip "Run again" right edge at x≈1024 (CSS-scaled), but Z.ai header continues to the right edge of the viewport with no separator.
**Suggestion:** Push the strip into the scroller as a `position: sticky; left: 0` row at the top, OR add a 1px vertical divider at the sticky-column boundary so the eye reads "fixed | scrolling" cleanly. The latter is cheaper and matches V7's typical product table pattern.

---

### Observation 9: Aesthetic direction is intentional and on-brief, but there's no memorable element

**Screen:** `/`
**What I noticed:** The page nails the V7-leaning brief — warm near-neutral canvas, white surface, Geist sans + Geist mono, exactly one Fraunces moment (`33` numeral), tinted soft pills for status, single orange accent restricted to "running" and `:focus-visible`. AI-slop checks all pass: no purple gradients, no white-on-white cards, no rounded-corner-everything. The Fraunces `33` is a real attempt at a memorable element. But after a run, the `33` doesn't change (it's still "33 calls queued") even though the headline insight is now `Fastest 705ms / Grok 4.1 Fast / xAI`. The numeral that was supposed to anchor the page has nothing to do with the win condition.
**Why it matters:** A memorable element earns its place by carrying meaning, not just by being big and serif. Right now `33` is a permanent decoration; the actual hero — "Grok 4.1 Fast won at 705ms" — is rendered in 12px Geist next to it.
**Evidence:** All five strip screenshots. The Fraunces `33` is identical in every state.
**Suggestion:** Promote the post-run hero. Swap the Fraunces numeral to render the **fastest time** (`705ms`) once a run completes, with `Grok 4.1 Fast · xAI` as its subtitle. Pre-run, keep `33` queued. This makes the editorial display moment do something the rest of the dashboard can't.

---

## Summary

The page commits to a clear V7-product aesthetic and the AI-slop checks all pass — Geist + Fraunces typography is intentional, the orange accent is disciplined, the soft-pill system is consistent. What undercuts it is **edge discipline**: a header that bleeds during scroll, columns that overflow without affordance below 1430px, a strip that reshapes its layout four different ways, and an em-dash that conflates "no route" with "no key." The single highest-leverage fix is **Observation 2** (sticky-header bleed) — it accounts for nearly all the "movement around the table" the user flagged, and the fix is mechanical (`thead tr { position: sticky }` + a real bottom border). After that, lock provider column widths to a single value and tune the scroll-shadow stops to actually show on white.
