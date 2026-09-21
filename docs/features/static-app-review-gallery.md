# Static App Review Gallery

The finish line for Phase 1 Static. Five realistic lesson canvases on one dev-only
board, reviewed by hand in the running application.

```text
?board=static-app-review
```

**These are product review cases, not benchmark cases.** No external reference
matching, no animation, no interaction work, no new runtime capabilities. The
question is not "does this resemble The Illustrated Transformer" — it is whether
the static visual system produces lessons someone would actually want to learn
from.

## What each canvas must be

A full Learn lesson composition in the real vertical learning canvas, with the
normal tutor panel: explanation, visualization, code or equation where relevant,
source or repo reference, and a static knowledge check. Not an isolated
visualization demo.

Both light and dark mode.

## The five

### 1. nanoGPT — Self-Attention

Tokens · Q/K/V · score matrix · softmax and attention weights · **one
mechanically correct worked equation** · a small Python/PyTorch snippet · the
corresponding nanoGPT repo reference · short explanation and a static knowledge
check.

*Tests:* matrices, equations, identity, heat, and code-to-concept composition.

### 2. nanoGPT — Transformer Block

Input · LayerNorm · attention · residual path · LayerNorm · MLP · residual path ·
tensor-shape annotations · a matching `model.py` excerpt.

*Tests:* architecture flow, residual connections, repetition and continuity, code
plus visual composition.

### 3. VLM — Image to Patches to Projector to LLM

An actual local image · patch grid · vision encoder · visual-token row ·
projector · language-token row · dimensional annotation such as `1152 -> 4096` ·
a small Python implementation reference.

*Tests:* multimodal composition, and whether the visual language generalises
beyond pure LLM diagrams.

### 4. World Model — Branching Futures

Observation or current state · 3–4 candidate actions · predicted future states
and trajectories · costs and rewards · the chosen action · a small pseudocode or
model snippet · a visible distinction between **prediction** and **observed**.

*Tests:* branching, categorical identity, quantitative values, comparison.

### 5. Large Codebase — Architecture Orientation

Whole-system architecture with about four major subsystems · Planning
highlighted as *you are here* · 4–6 relevant files or functions · a subsystem
dependency and flow diagram · one important function excerpt · a breadcrumb such
as `Repo -> Planning -> Cost -> score_trajectory()` · source references.

*Tests:* whether this works as an actual repo-learning product rather than an
ML-visualization demo.

## Constraints

- Use **only** capabilities already completed in the static visual system.
- Do **not** add new primitives, animation, learner inputs, Plan B features, dynamic behaviour, or bespoke scene-specific renderer code.
- Entirely Learn-native. **Do not optimise these against benchmark screenshots** — the benchmark is over; this is the product.
- If a vocabulary limitation prevents one from working, **record the gap** rather than expanding scope to route around it.

## When all five render

**Stop.** Do not begin dynamic visuals, Diffusion Explainer, Plan B, coordinated
views, ONNX, GSAP, or any interactive work. The human reviews these five in the
running application and decides what happens next.

This gallery is the app-review finish line after the critic and regression pass.
