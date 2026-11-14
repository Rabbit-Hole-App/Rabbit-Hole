# /explain visual vocabulary — supply vs. renderer (2026-11-13)

Question (owner 19:38): the renderer has a fixed set of kinds; how do we know which kinds are missing without brainstorming an infinite list?
Answer: count. Done here by me from the repository at main 05d5f02f6, no model calls. Reproducible: `handoff/figure-briefs/*/briefs.md` (`Kinds.` lines) + `tutor-diagrams/*-spec.js`.

## 1. What the renderer accepts today (not 17)

Top-level diagram kinds across `spec.js`, `ml-statistical-spec.js`, `ml-topology-spec.js`, `block-stack-spec.js`, `tensor-spec.js`, `token-links-spec.js`:

`flow` · `comparison` (text columns) · `timeline` · `sequence` · `matrix` · `layers` · `cycle` · `figure` (cell / free-body / cross-section) · `tree` (binary / hierarchy / dendrogram) · `transformation` (before/after **text item lists** + operation) · `argument` · `relationship` (graph) · `coordinate-plot` (line / scatter / step / stem, bands, reference lines) · `bar-chart` (single; grouped variant used by references) · `t-account` · `waterfall` · `number-line` · `heatmap` · `sample-set` · `histogram` · `box-plot` · `block-stack` (children: flow / tensor / layers) · `tensor` · `token-links` — **24 kinds**.

Composition: only `block-stack` can nest another kind, and only `flow`, `tensor`, `layers`. There is no side-by-side panel, no stacked bar, no "chart → operation → chart".

## 2. Supply: the 705 textbook figures Codex collected (d2l.ai, Alammar's illustrated posts, LLM architecture gallery)

654 have briefs; each brief names the renderer kinds it needs (Codex, 11-09/10). The 21 phase-02 lesson pages themselves carry no figures (`figures: []`), so this corpus measures the deep-learning textbook style we are emulating, not the 18 ML lessons' own pages.

| Kind named in briefs | figures | % of 654 |
|---|---:|---:|
| coordinate-plot | 227 | 34.7 |
| block-stack | 168 | 25.7 |
| comparison (= side-by-side panels; 99 of 102 paired with another kind) | 102 | 15.6 |
| matrix | 78 | 11.9 |
| heatmap | 76 | 11.6 |
| flow | 73 | 11.2 |
| transformation (45 of 57 are quantities before→after) | 57 | 8.7 |
| relationship | 49 | 7.5 |
| tensor | 38 | 5.8 |
| token-links | 23 | 3.5 |
| sample-set | 19 | 2.9 |
| bar-chart | 16 | 2.4 |
| timeline | 15 | 2.3 |
| sequence | 9 | 1.4 |
| cycle | 6 | 0.9 |
| layers, number-line | 2 each | 0.3 |
| waterfall | 1 | 0.2 |
| tree, histogram, box-plot, figure, argument, t-account | 0 | — |

18 kinds account for everything; the top 7 cover the bulk. Codex's own `gaps.md` lists only **4** figures as beyond the library (raster evidence panels, time-aligned weighted links) — the long tail, not worth building.

**The real gap is composition, not kinds:**

- 310 / 654 figures (47%) need **two or more kinds in one figure**.
- 46 of those are `block-stack` + flow/tensor/layers, which the renderer already nests → **264 figures (40%) need a composition primitive the renderer does not have.**
- 45 figures (7%) are numeric `transformation` (values → operation → values); the renderer's `transformation` draws text lists, so these come out as boxes with numbers — the softmax card exactly.
- Union: **274 / 654 = 42% of textbook figures cannot be drawn faithfully with today's vocabulary**, even though every one of them maps to kinds we have.

What the composition demand looks like (top pairs among the 264):
block-stack + comparison 30 · comparison + coordinate-plot 27 · block-stack + relationship 21 · comparison + heatmap 19 · block-stack + matrix 17 · tensor + transformation 15 · block-stack + transformation 13 · heatmap + matrix 8 · block-stack + heatmap 7 · matrix + relationship 6 · heatmap + token-links 6 · comparison + flow 6.

How Codex's briefs describe the softmax-type figures (fidelity check): `illustrated-transformer 12` "raw scores, scale, normalized weights, all summing to one" → `matrix + token-links`; `illustrated-transformer 31` "one logit and normalized probability per candidate" → `bar-chart + tensor`; `illustrated-gpt2 39` "score grid, normalized grid, row sums" → `heatmap`. Each is a sequence of two or three panels with an operation between them; the brief names the panel kinds, and the renderer has no way to place them in a row.

## 3. Demand: our own pipeline so far

Stage-04/07 verdict files for logistic and linear regression are not on main (they live in Claude Code's run directories); decision trees' fixture is. Decision trees (13 cards): 0 of 5 non-ship verdicts were "kind cannot express" (they were: schema slip, wrong sibling reference, factual error in the reference, prose–visual mismatch, generic flow with no worked content). Logistic (12 cards, from my 11-12 read): 0 of 4 (two server backslash bugs, one Q0 coercion, one author prose). This is expected and is **not** evidence the vocabulary suffices: the prompt-writer and coverage judge write prompts *inside* the vocabulary, so the pipeline never asks for what the renderer cannot draw. The softmax card came from a production learner prompt — the archive (ordered 18:50) is what will measure this side.

## 4. Gap list, ranked

| # | Missing capability | Textbook figures | Covers |
|---|---|---:|---|
| 1 | **`panels`** — 2–3 existing top-level kinds in a row (side-by-side or as ordered stages), optional operation label on the arrow between them, shared class/colour labels | 264 (40%) | every pair above; softmax, attention score→weight→sum, train/held-out plots side by side, head grids compared |
| 2 | **magnitude encoding for numeric `transformation`** — items `{label, value}` drawn as bars; a stacked bar for a set that sums to 1 (`bar-chart` stacked variant does the same job) | 45 (7%) | softmax, normalisation, attention weights, probability updates |
| 3 | `block-stack` child kinds beyond flow/tensor/layers (matrix, heatmap, relationship) | 45 (subset of 1) | architecture figures with a worked grid inside a block; covered by 1 if panels can hold a block-stack |
| 4 | Codex's `gaps.md` tail (raster evidence panels 3, time-aligned links 1) | 4 (0.6%) | do not build |

Build order = 1 then 2; 3 is covered by 1. Both are deterministic renderer additions → tier-1 gate each. After them the expected faithful-coverage of the textbook corpus goes from 58% to ~99%, with **no new kind** added.

## 5. Running metric from here

Per release, from the archive: count of production cards whose planned kind could not express the prompt (the auditor's "regenerate — kind cannot show this" and the v2 `capabilityGap` declarations). If it trends to ~0 after `panels` + magnitude, 24 kinds + composition is enough; if a residue stays, a slow-model "custom figure" path is the explicit option for that residue only — never the default (the author model copies references; the gates depend on specs).

## Files
- `vocabulary-gap.json` — the 264 + 45 figure ids (source, figure number, kinds) for anyone who wants to spot-check.
- `softmax-{brief,standard,detailed}.svg` — the target figures for the softmax reference once 1 + 2 exist.
