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
