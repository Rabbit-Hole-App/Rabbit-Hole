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
| `02-qkv-projection` | ready — real capture, `reference/reference-manifest.json` |
| `03-attention-score-matrix` | ready — real capture, `reference/reference-manifest.json` |
| `04-softmax-attention-weights` | ready — real capture, `reference/reference-manifest.json` |
| `05-causal-masking` | ready, text-only — this source has no masking diagram, only a quoted passage; see the case's `target.json` scope |
| `06-matrix-self-attention` | ready — real capture, `reference/reference-manifest.json` |
| `07-multi-head-attention` | ready — real capture, `reference/reference-manifest.json` |
| `08-transformer-block` | ready — real capture, `reference/reference-manifest.json` |
| `09-encoder-decoder-attention` | ready — real capture, `reference/reference-manifest.json` |
| `10-positional-encoding` | ready — real capture, `reference/reference-manifest.json` |

Every case now has real reference material captured per REFERENCE-LICENSING.md:
images cached in `.local-benchmark-cache/` (gitignored), `SOURCE.md` and
`reference-manifest.json` committed under each case's `reference/`. No scene
has been generated for any case - which cases run against the engine is a
separate decision, not made here.

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
