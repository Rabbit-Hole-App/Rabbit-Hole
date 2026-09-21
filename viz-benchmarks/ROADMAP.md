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

### Phase 1 status, 2026-09-20

**Vocabulary coverage complete; visual-quality acceptance pending.**

Not "Phase 1 complete". What the static run proved is real but narrower than the
headline suggested:

- the current vocabulary expressed all nine static cases **without bespoke renderer work**
- `flow`, `matrix_operation` and basic `graphs` / `coordinated_views` are working
- **no new primitive or template gap surfaced** — every failure was `layout` or `content`, fixed by re-authoring
- **zero bespoke workarounds** across nine cases
- A.5d fixed the right underlying capabilities

What it did **not** prove: production visual quality. The author graded its own
work, averaging 4.83/5, while the flagship case ships an arrow drawn straight
through a row label. A self-score is not an acceptance.

Four of eleven patterns were exercised. `zoom_drilldown`, `process_scrubbing` and
`live_computation` are dynamic-only and deferred; `routing` was declared on
multi-head attention and is a mismatch — every head always runs, nothing branches.
**Unexercised and mismatched patterns never become passes.**

### Phase 1 static quality passes only when all five hold

- [ ] exercised pattern coverage stays green
- [ ] no bespoke workarounds exist
- [ ] the authoring lint passes
- [ ] an **independent** critic — one that did not author or repair the scenes — approves at the agreed quality bar
- [ ] the human reviewer agrees the flagship cases are production quality

## The app-review finish line

After the blind critic passes and the regression run is green, the last step
before the hard stop is the **Static App Review Gallery** — five realistic lesson
canvases on a dev-only `?board=static-app-review`, reviewed by hand in the running
application.

Specified at
[docs/features/static-app-review-gallery.md](../docs/features/static-app-review-gallery.md):
nanoGPT self-attention, nanoGPT transformer block, a VLM image-to-patches flow, a
world model's branching futures, and a large-codebase architecture orientation.

**These are product review cases, not benchmark cases.** No reference matching, no
new capability. The benchmark asked whether the language can match a published
explanation; this asks whether it produces lessons someone would want to learn
from — including one case, the codebase orientation, that deliberately leaves the
ML-diagram comfort zone to test whether this is a repo-learning product or a
visualization demo.

## The benchmark milestone closes when regression passes

Once the closing pass and its regression are green, **the static benchmark
milestone is done** — including if the hands-on app review then finds product
problems.

Those findings belong to the **next** milestone. They do not automatically reopen
this one. A UX problem discovered in the gallery is evidence about the product,
not evidence that the visual language failed its benchmarks; three independent
blind reviews already answered that question.

This exists because the opposite is the natural drift. Every report in this phase
surfaced something real, and every one justified another round — which is what a
repair ratchet looks like from the inside. The question changes here, from *can
the visual system survive another benchmark* to *does this feel like a product
someone would want to learn in.* Those are different questions with different
work behind them, and mixing them means neither gets finished.

## HARD STOP after Phase 1

**The roadmap describes an order, not a permission.**

When static Phase 1 passes its five conditions and an independent critic approves
it, the work **stops** until the human has reviewed the app themselves, generated
several real canvases, and explicitly said to continue.

Nothing below this line starts before that:

- Phase 2 dynamic benchmark work, including Diffusion Explainer
- Plan B, or the input axis
- coordinated views
- any interactive runtime work
- ONNX Runtime Web
- GSAP

This exists because momentum at the end of a successful pass is exactly when work
rolls into the next phase without anyone deciding to. An idle agent waiting on a
decision is the correct state here. An agent that started Phase 2 because nothing
told it not to is not.

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
