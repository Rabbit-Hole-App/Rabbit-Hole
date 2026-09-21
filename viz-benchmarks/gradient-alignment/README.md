# gradient-alignment

Visualization benchmark project. Read the root `AGENT-INSTRUCTIONS.md` first.

No single external article anchors this project - it covers small, general
optimization-signal visualizations (starting with reading a dot product
between two vectors as an alignment signal) rather than one source's figures.

```text
project -> case -> mode -> iteration
```

## Cases

| case | status |
|---|---|
| `01-dot-product-alignment` | ready - originally authored, no external reference image |

## Layout

```text
README.md  SOURCE.md
cases/NN-name/
           README.md  target.json  reference-notes.md  evaluation-rubric.json
           reference/            the benchmark's own images, if any
           generated/latest/     the current run
           generated/history/    archived runs, vNNN
           evaluation/current.json  evaluation/history/
```

Target: **conceptual parity, original Learn-native visual realization.**
