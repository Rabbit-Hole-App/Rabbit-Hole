# Illustrated Transformer Benchmark — Agent Instructions

Read the root `AGENT-INSTRUCTIONS.md` first.

**Everything happens inside one case.** Pick the case, work only in its folder,
and never write benchmark artifacts to this project root.

## Workflow, per case

1. Read the case's `target.json`, `reference-notes.md` and `evaluation-rubric.json`.
2. Read `shared/teaching-patterns.json` for the reusable teaching structure, and
   `shared/project-notes.md` for what holds across cases.
3. Inspect the case's `reference/`. A case whose `reference/` is empty is a
   skeleton: extract the material first, or pick another case.
4. Generate with the Learn runtime only — no bespoke React, CSS, SVG or renderer
   branches, and no scene-specific styling or layout arithmetic.
5. Before writing output, archive any useful `generated/latest/` into
   `generated/history/vNNN/`. Do not silently overwrite a run.
6. Save the new output to the case's `generated/latest/`.
7. Evaluate with `shared/evaluator-notes.md`, scoring failures against
   `shared/failure-taxonomy.json`, and write `generated/latest/critic-report.json`.
8. Update the case's `evaluation/current.json`, moving the previous one into
   `evaluation/history/`.
9. Improve the reusable Learn system, never this benchmark with one-off code. A
   gap in the visual language is the finding; working around it destroys it.
10. Human review is the final gate.

## Expected output filenames

Modes are filenames, not folders.

Static mode:
- `static-00.png`

Dynamic mode:
- `dynamic-00.png`, `dynamic-25.png`, `dynamic-50.png`, `dynamic-75.png`, `dynamic-100.png`

Always also:
- `scene-spec.json`
- `critic-report.json`
- `notes.md`

## Which case is which

`01-self-attention-computation-flow` is the full unmasked flow: tokens to Q/K/V
to QK scores to softmax to weighted V to output. It is the only case that
currently has reference material.

Causal masking is `05-causal-masking`, and it is **not** part of case 01 — the
case 01 reference images show unmasked encoder self-attention and visualise no
mask at all. Do not conflate them.
