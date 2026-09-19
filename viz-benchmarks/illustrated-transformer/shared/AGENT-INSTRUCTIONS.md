# What to Tell the Agent

Use this benchmark to improve the reusable Learn visualization system.

## Benchmark phase

For each static/dynamic target:

1. Read:
   - `README.md`
   - `shared/benchmark-mode.md`
   - `shared/teaching-patterns.json`
   - the scene's `target.json`
   - the scene's `reference-notes.md`
   - the reference PNG(s).

2. Generate the visualization using **only** the existing Learn scene vocabulary.

3. Render the result and save generated keyframes in that scene's `generated/` folder.

4. Evaluate reference vs generated using:
   - `shared/evaluator-notes.md`
   - `evaluation-rubric.json`
   - `shared/failure-taxonomy.json`.

5. Optimize for:
   - technical correctness;
   - conceptual completeness;
   - teaching clarity;
   - hierarchy;
   - spatial relationships;
   - readability;
   - progressive disclosure;
   - interaction capability where applicable.

6. **Do not optimize for pixel similarity.**
   Do not copy the reference's exact colors, typography, node shapes, arrows, coordinates, captions,
   artwork, or animation timing.

7. When something is weak, improve the **reusable system** — primitive, template, layout, edge routing,
   typography, semantic-role styling, motion grammar, or coordinated-view capability. Do not patch this
   benchmark with one-off CSS/JSX or reference-specific coordinates.

8. Re-render and re-evaluate until the benchmark reaches the agreed quality bar.

9. Record every iteration in `evaluation.json`.

## Production phase

After the benchmark has taught us which reusable patterns/components are needed:

1. Production lesson generation must **not load the benchmark reference screenshots**.
2. Use:
   - the learner's actual objective;
   - repo/paper/docs evidence;
   - `shared/teaching-patterns.json`;
   - the Learn component/template registry;
   - Learn design tokens and semantic roles;
   - reviewed Learn layout variants.
3. Generate an **original visual realization** of the teaching pattern.
4. Run `shared/production-originality-check.json`.
5. Reject any production scene that depends on external-reference-specific palette, coordinates,
   wording, artwork, or custom styling.

The target is:

> **1:1 conceptual capability, intentionally non-1:1 visual appearance.**
