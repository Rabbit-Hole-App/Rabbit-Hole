# Reading a Word2vec Embedding Heatmap

- Prompt (reference.prompts[0]): How do I read the colored cells of a Word2vec embedding heatmap?
- Reference id: ml-word2vec-signed-embedding-heatmap (source: Word2vec)
- Intended kind (reference.spec.diagram.kind): heatmap
- Planner kind: heatmap (fixed); planner routed to picture: no
- Model kind (first diagram): heatmap; all diagrams: heatmap
- Selector hit (intended reference among the references sent): yes
- References sent to the author (attempt 0): ml-word2vec-signed-embedding-heatmap
- Structure (faithful-ref-v1, reference vs model spec): fully - The diagram matches the reference exactly. It is a heatmap with the same four rows, three columns, cell values, and a shared -1 to 1 range.
- Factual (factual-v2): 4/5, error no - Claims are broadly accurate. Minor imprecision: individual word2vec dimensions are not interpretable on their own, and the 'compare cells in the same column' advice is a simplification.
- Repaired: no; visual fallback: no; authored by google / gemini-3.5-flash-lite
- Time 3873 ms; author tokens in/out 3759/507; cost US$0.002396

| model (408 px) | reference (408 px) |
|---|---|
| ![model](model-408.svg) | ![reference](reference-408.svg) |

## Card body (as saved)

Word2vec embeddings represent words as numeric vectors. Each cell in a heatmap shows the signed coordinate value for a specific dimension.

```rh-diagram
{"version":1,"diagram":{"title":"One signed scale for word vectors","caption":"Compare cells in the same column. One shared scale makes opposite signs distinguishable.","kind":"heatmap","columns":["First entry","Second entry","Third entry"],"rows":[{"label":"seed","cells":[0.8,0.1,-0.2]},{"label":"seeds","cells":[0.8,0.4,-0.1]},{"label":"bulb","cells":[0.6,-0.2,-0.25]},{"label":"bulbs","cells":[0.63,0.08,-0.16]}],"range":{"min":-1,"max":1}}}
```

Positive numbers use one color shade while negative numbers use another. By sharing a single scale, you can easily compare magnitude across different words.
