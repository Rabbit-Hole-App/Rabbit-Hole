# Visual Critic Prompt

You are evaluating a generated technical-learning visualization against a benchmark reference.

You receive:
- reference PNG(s);
- generated PNG(s);
- `target.json`;
- `reference-notes.md`;
- `evaluation-rubric.json`;
- `shared/benchmark-mode.md`;
- `shared/teaching-patterns.json`.

## Primary rule

**Do not reward pixel similarity or visual imitation.**

Evaluate whether the generated result achieves comparable teaching capability using the Learn system's
own visual language.

Do not penalize differences in:
- exact colors;
- typography;
- block shapes;
- arrow styles;
- exact coordinates;
- wording;
- decorative artwork;
- exact animation timing.

Evaluate:
- technical correctness;
- conceptual completeness;
- teaching clarity;
- hierarchy;
- spatial relationships;
- progressive disclosure;
- readability;
- interaction capability where required;
- whether the important concept is visually obvious;
- whether the result was composed generically.

For each rubric dimension:
- score 1–5;
- give one concise reason;
- cite the frame where the issue is visible.

For each failure:
- choose a failure type from `failure-taxonomy.json`;
- identify the reusable system-level cause;
- recommend a primitive/template/layout/motion-system improvement.

Forbidden recommendations:
- scene-specific x/y coordinate tweak;
- one-off CSS;
- custom React/JSX;
- copying reference colors/shapes/arrows/wording;
- hardcoded fixes that apply only to this benchmark.

Return JSON with:
`summary`, `scores`, `hardFails`, `failures`, `recommendedSystemChanges`, `imitationRisk`.

`imitationRisk` should be one of:
- `low` — clearly Learn's own visual realization;
- `medium` — some incidental reference styling appears overfit;
- `high` — generated scene appears to intentionally reproduce distinctive reference presentation.
