# AGENT INSTRUCTIONS — Visualization Benchmark Suite

You are working on the Learn visualization benchmark suite.

Your job is **not** to imitate external artwork.

Your job is to determine whether the reusable Learn visualization system can express the same
technical idea with comparable or better teaching clarity.

# 1. Two modes: never confuse them

## Benchmark mode

You may inspect the reference material in a benchmark folder.

Optimize for:

- technical correctness;
- conceptual completeness;
- teaching clarity;
- visual hierarchy;
- spatial relationships;
- information density;
- progressive disclosure;
- readability;
- interaction capability where required;
- motion choreography where required;
- whether the important concept is visually obvious;
- generic composition through the Learn runtime.

Do **not** optimize:

- exact colors;
- exact typography;
- exact block shapes;
- exact arrows or arrowheads;
- exact coordinates;
- exact wording;
- exact decorative artwork;
- exact timing;
- pixel similarity.

A benchmark can score 5/5 while looking clearly different from the reference.

## Production mode

Production lesson generation must **not inspect benchmark screenshots**.

Production receives:

- learner objective;
- repo / paper / docs evidence;
- learner state;
- extracted reusable teaching patterns;
- Learn component and template registry;
- Learn semantic roles;
- Learn typography;
- Learn layout variants;
- Learn motion and sound vocabulary.

It must create an **original Learn-native visualization**.

# 1b. The hierarchy

```text
project -> case -> mode -> iteration
```

A **project** is one external source, such as The Illustrated Transformer. A
**case** is one distinct visualization or teaching capability from that source,
numbered under `cases/`. A **mode** is static, dynamic or interactive — modes are
**not** separate cases or projects, because the same idea taught in one frame and
taught over time is the same idea, and splitting them hides whether the visual
language can do both. Modes are distinguished by filename: `static-00.png`,
`dynamic-50.png`. An **iteration** is one generated run, archived as `vNNN`.

`illustrated-transformer -> 05-causal-masking -> dynamic -> v003` names one run,
and that is the unit the registry tracks and a human approves.

# 2. Required workflow for every benchmark

Work is always scoped to **one case of one project**. A project root holds only
project-wide files and `shared/`; every benchmark artifact lives in a case under
`cases/`.

1. Read the project `README.md`.
2. Read `SOURCE.md`.
3. Pick the case, and read its `README.md` and `target.json`.
4. Read the case's `reference-notes.md`, and the project's `shared/project-notes.md`.
5. Inspect the case's `reference/`. An empty one means the case is a skeleton and
   cannot be run until reference material is extracted.
6. Read the case's `evaluation-rubric.json`.
7. Generate a scene using **only existing Learn primitives / templates / actions / roles / typography / motion / sound**.
8. Do not emit custom React, JSX, SVG, CSS, D3, GSAP, Motion code, or bespoke renderer logic.
9. If the current vocabulary cannot express the idea, return:
   - `NEW_COMPONENT_REQUIRED`, or
   - `VOCABULARY_GAP`
   with a concise description of the missing reusable capability.
10. Render the generated scene.
11. Save all generated artifacts to `generated/latest/`.
12. Run a separate visual critic.
13. Save the critic output to `generated/latest/critic-report.json`.
14. Save short iteration notes to `generated/latest/notes.md`.
15. Before a later iteration overwrites `generated/latest/`, archive the current version under
    `generated/history/vNNN/`.
16. Update `evaluation/current.json`.
17. If the critic finds a problem, fix the **reusable system**, not the benchmark scene.
18. Re-render and re-evaluate.
19. Re-run previously passing benchmarks after a shared runtime/vocabulary change.
20. Human approval is the final quality gate.

# 3. Generated folder is mandatory

Every **case** must maintain its own, at `cases/NN-name/`:

```text
generated/
├── latest/
└── history/
```

A project never has a `generated/`, `reference/` or `evaluation/` of its own. If
you find one, the project has not been migrated to the case hierarchy yet.

`generated/latest/` is the human-review surface.

It must contain the newest screenshots and scene spec.

Static benchmark minimum:

```text
00.png
scene-spec.json
critic-report.json
notes.md
```

Dynamic benchmark minimum:

```text
00.png
25.png
50.png
75.png
100.png
scene-spec.json
critic-report.json
notes.md
```

Interactive benchmark minimum should additionally include:

```text
interaction-01.png
interaction-02.png
interaction-trace.json
```

or another deterministic set of interaction snapshots defined by `target.json`.

# 4. Iteration history

Do not silently destroy useful benchmark history.

Before replacing `generated/latest/`:

```text
generated/latest/
        ↓ archive
generated/history/vNNN/
```

Then write the new run into `generated/latest/`.

Each historical iteration should preserve:

- screenshots;
- `scene-spec.json`;
- `critic-report.json`;
- `notes.md`;
- optional metrics.

# 5. Failure classification

Use the shared failure taxonomy.

When a result is weak, classify the cause as one or more of:

- `TECHNICAL_CORRECTNESS`
- `CONTENT_OMISSION`
- `VISUAL_HIERARCHY`
- `LAYOUT`
- `TYPOGRAPHY`
- `COLOR_CONTRAST`
- `EDGE_ROUTING`
- `MOTION`
- `FOCAL_POINT`
- `MISSING_PRIMITIVE`
- `MISSING_TEMPLATE`
- `COORDINATION`
- `INTERACTION`
- `RUNTIME_BINDING`
- `BESPOKE_CODE`
- `REFERENCE_OVERFIT`
- `ORIGINALITY_RISK`

# 6. Repair policy

Bad repair:

- move this arrow to x=317 only for this benchmark;
- add custom CSS for this scene;
- add custom React for this scene;
- copy the reference palette;
- copy its exact positions.

Good repair:

- improve edge routing;
- add a generic matrix-operation template;
- add a reusable focus-and-expand layout variant;
- improve typography hierarchy;
- improve coordinated selection;
- improve the motion grammar;
- add a missing reusable primitive.

# 7. Reference versus generated comparison

Always compare:

```text
reference/
vs
generated/latest/
```

The critic may inspect both.

The production agent may not inspect the reference.

# 8. Benchmark completion

A benchmark passes only when:

- technical content is correct;
- the intended teaching capability is present;
- the result is clear and production quality;
- no benchmark-specific rendering code was added;
- no external visual identity was copied;
- the human reviewer approves the result.

# 9. Originality rule

Target:

> **1:1 conceptual capability, intentionally non-1:1 visual realization.**

Standard technical vocabulary such as Query, Key, Value, Softmax, attention, Transformer, IoU,
convolution, etc. is normal technical terminology and does not need artificial rewriting.
