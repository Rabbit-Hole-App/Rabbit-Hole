# illustrated-transformer

Visualization benchmark project. Read the root `AGENT-INSTRUCTIONS.md` first,
then `PROJECT-AGENT-INSTRUCTIONS.md` here.

The article teaches several distinct capabilities, and **each is its own
benchmark case** under `cases/`. Nothing benchmark-specific lives at this root:
a case owns its own reference material, generated output and evaluation.

```text
project -> case -> mode -> iteration
```

`illustrated-transformer -> 05-causal-masking -> dynamic -> v003` names one run.

## Cases

| case | status |
|---|---|
| `01-self-attention-computation-flow` | ready — `reference/synthetic/` is a declared internal fixture (see `target.json`'s `referenceType` and `syntheticReferenceFiles`); `reference/external/` catalogues the real capture per REFERENCE-LICENSING.md, images in `.local-benchmark-cache/` |
| `02-qkv-projection` | skeleton |
| `03-attention-score-matrix` | skeleton |
| `04-softmax-attention-weights` | skeleton |
| `05-causal-masking` | skeleton |
| `06-matrix-self-attention` | skeleton |
| `07-multi-head-attention` | skeleton |
| `08-transformer-block` | skeleton |
| `09-encoder-decoder-attention` | skeleton |
| `10-positional-encoding` | skeleton |

A skeleton has the full folder contract and an empty `reference/`. It cannot be
run until reference material is extracted from the source.

## Modes are not cases

Static, dynamic and interactive are **modes of one conceptual case**. The same
idea taught in one frame and taught over time is the same idea, and splitting it
into separate cases hides whether the visual language can do both. Modes are
distinguished by filename — `static-00.png`, `dynamic-50.png` — inside a single
case's `reference/` and `generated/latest/`.

## Layout

```text
README.md  SOURCE.md  PROJECT-AGENT-INSTRUCTIONS.md
shared/    project-wide only: teaching-patterns.json, evaluator-notes.md,
           project-notes.md, benchmark-mode.md, failure-taxonomy.json and the
           production guardrails
cases/NN-name/
           README.md  target.json  reference-notes.md  evaluation-rubric.json
           reference/            the benchmark's own images
           generated/latest/     the current run
           generated/history/    archived runs, vNNN
           evaluation/current.json  evaluation/history/
```

Target: **conceptual parity, original Learn-native visual realization.**
