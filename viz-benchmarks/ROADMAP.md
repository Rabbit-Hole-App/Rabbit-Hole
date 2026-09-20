# Benchmark roadmap — static clarity first

Decided 2026-09-20, after the first Transformer Explainer gate.

```text
Illustrated Transformer      →  STATIC QUALITY
Diffusion Explainer          →  SIMPLE DYNAMIC QUALITY
Plan B input axis            →  INTERACTION
Transformer Explainer, GAN Lab, Playground  →  COMPLEX INTERACTIVE QUALITY
```

## Why the order changed

We went to Transformer Explainer too early. It is a full interactive application
running a real GPT-2, and it is excellent — but a sophisticated app should not
dictate runtime features before the static visual language is good. Benchmarking
against it first meant the hardest capabilities set the agenda while the simplest
ones were unproven.

**Nothing from that work is discarded.** It produced genuine runtime fixes — the
discrete `replace_values` transform, grid axis labels, signed heat, contrast-aware
ink, a value-blind selection overlay, and the identity axis. Its cases and scores
stay as **advanced** benchmark material, with interaction-dependent cases marked
`blocked_by: input_axis`. It is simply no longer the near-term driver.

## Phase 1 — static explanatory visuals

Real published static visualizations, beginning with The Illustrated Transformer.

Architecture diagrams, token flow, Q/K/V, matrices, attention flows, multi-head
diagrams, transformer blocks, positional encoding, clean technical illustration.

**The question:** can Learn generate a production-quality static technical
explanation using only its reusable vocabulary?

Each distinct visualization becomes its own case under
`illustrated-transformer/cases/`. **Do not invent reference images** — capture the
actual published visual for internal evaluation, and for restrictively licensed
sources follow [REFERENCE-LICENSING.md](REFERENCE-LICENSING.md): metadata
committed, captures in `.local-benchmark-cache/`.

### Phase 1 is not complete until every case is captured

**Static first means finishing static first, not having one populated case.**

Truthful status, 2026-09-20:

```text
illustrated-transformer
├─ case 01
│  ├─ synthetic internal fixture   done
│  └─ real external capture        done
└─ cases 02-10
   └─ real external references     NOT CAPTURED
```

The order of remaining work, and nothing skips ahead of it:

1. Renderer invariant cleanup — a deterministic ownership check, not a behavioural test that passes against both the broken and the fixed implementation
2. Protect the synthetic fixtures structurally
3. Capture real references for cases 02-10 under [REFERENCE-LICENSING.md](REFERENCE-LICENSING.md)
4. Populate each case's `SOURCE.md`, manifest, reference notes and cache metadata
5. Run the static benchmark cases
6. Refine the static vocabulary from what they find
7. **Only then** Phase 2

## Phase 2 — simple dynamic visualizations

Published explainers with contained motion, such as Diffusion Explainer.

Progressive reveal, process animation, timestep progression, scrub and play and
pause, camera focus, flow animation, before-and-after transformation.

**The question:** can the same reusable system animate a concept clearly without
becoming a bespoke app?

## Phase 3 — complex interactive visualizations

Transformer Explainer, TensorFlow Playground, Seeing Theory, GAN Lab, Embedding
Atlas. Shared semantic state, coordinated views, parameter manipulation, real
computation, runtime model output, multi-view interaction.

Most depend on Plan B's input axis and stay **captured but blocked** until it
exists. Capturing a reference early is useful; running a benchmark for a
capability the runtime does not have measures nothing.

## What this gates

Tasks 13 and 14 of Plan A.5 stay parked until the Motion-invariant renderer bug
is fixed, the static benchmark pass is underway, and the vocabulary has been shown
strong enough against **real static references** rather than against scenes we
wrote ourselves.

The progression is: **static clarity → simple dynamic clarity → interaction →
full app-like exploration.**
