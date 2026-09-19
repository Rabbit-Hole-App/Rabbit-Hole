# 01 — Self-attention computation flow

The full unmasked self-attention computation, end to end:

```text
tokens → Q/K/V → QKᵀ scores → softmax weights → weighted V → output
```

## Scope

This case owns the computation flow itself. It does **not** cover causal masking —
the reference material here shows unmasked encoder self-attention, and nothing in
it visualises a mask. Causal masking is case `05-causal-masking`.

Cases `02`, `03` and `04` zoom in on single steps of this same flow. They exist
separately because a step taught alone has different clarity demands than the
same step taught as one beat of a longer sequence.

## Modes

Both modes teach the same case and are evaluated against the same rubric.

| mode | reference | what it must do |
|---|---|---|
| static | `reference/static-00.png` | explain the whole flow in one readable frame |
| dynamic | `reference/dynamic-{00,25,50,75,100}.png` | build the flow as a progressive sequence with play, pause, replay and scrub |

`reference/contact-sheet.png` shows the reference frames together.

## Files

- `target.json` — the case requirements, with per-mode detail under `modes`
- `reference-notes.md` — what makes the reference succeed, merged from the project, static and dynamic notes it was split across before the restructure
- `evaluation-rubric.json` — scoring weights and hard fails
- `agent-prompt.static.md`, `agent-prompt.dynamic.md` — the visual-director prompt per mode
- `storyboard.dynamic.json`, `scene-spec.example.*.json` — authoring material
- `generated/latest/` — the current run; archive to `generated/history/vNNN/` before replacing it
- `evaluation/current.json` — the current score, with prior runs in `evaluation/history/`
