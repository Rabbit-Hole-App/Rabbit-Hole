# Visualization benchmarks

**What this suite measures: which reusable visualization patterns the Learn visual
language can actually carry.** Not how many cases exist, and not how closely a
generated scene resembles someone else's artwork.

- `patterns.json` — the eleven reusable patterns the program exists to cover
- `COVERAGE.md` — which patterns have a case with real reference material, and
  which are still untested. This is the scoreboard
- `benchmark-registry.json` — projects, their cases, and the patterns each exercises
- `AGENT-INSTRUCTIONS.md` — read before doing anything

## Hierarchy

```text
project -> case -> mode -> iteration
```

A **project** is one external source. A **case** is one distinct visualization or
teaching capability from it. A **mode** is static, dynamic or interactive, told
apart by filename rather than by folder, because the same idea taught in one
frame and taught over time is the same idea. An **iteration** is one generated run.

## How this grows

Start from cases that already have real reference material, and add external
references **one project at a time**, choosing the project that closes the largest
gap in `COVERAGE.md`. A case is worth adding because it exercises a pattern that
nothing else covers - never because it appears in an article's table of contents.

Reference material must be real and legitimately obtainable. Prefer sources that
can be run locally under a permissive licence over artwork that cannot be
redistributed; where neither is possible, document the reference in writing rather
than copying it.

---

# viz-benchmarks

Benchmark suite for evaluating and improving the Learn visualization runtime.

## Core principle

External explainers are used to benchmark **teaching capability**, not to create visual clones.

> **Target: 1:1 conceptual / pedagogical capability, intentionally non-1:1 visual appearance.**

The benchmark loop should improve reusable Learn primitives, templates, layouts, motion rules,
interaction patterns, and coordinated-view mechanisms.

Production lesson generation must not depend on external reference screenshots.

## Every benchmark project must contain

- `reference/` — benchmark reference material and notes.
- `generated/latest/` — the current generated output for direct human comparison.
- `generated/history/` — prior iterations, never silently overwritten.
- `evaluation/` — current and historical evaluation reports.
- `target.json` — the benchmark objective and hard constraints.
- `reference-notes.md` — what makes the reference educationally effective.
- `evaluation-rubric.json` — how the generated result is judged.
- `README.md` — project-specific instructions.
- `SOURCE.md` — canonical external source(s).

## Required generated artifacts

After every benchmark generation, the agent must save:

- rendered PNG(s);
- generated scene spec as `scene-spec.json`;
- critic report as `critic-report.json`;
- iteration notes as `notes.md`;
- optional machine-readable metrics as `metrics.json`.

For a static benchmark, save at least:

```text
generated/latest/
├── 00.png
├── scene-spec.json
├── critic-report.json
└── notes.md
```

For a dynamic benchmark, save at least:

```text
generated/latest/
├── 00.png
├── 25.png
├── 50.png
├── 75.png
├── 100.png
├── scene-spec.json
├── critic-report.json
└── notes.md
```

Before replacing `generated/latest/`, copy the previous latest run into:

```text
generated/history/v001/
generated/history/v002/
...
```

The benchmark folder must always make `reference/` versus `generated/latest/` easy for a human to inspect.
