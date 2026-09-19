# Pattern coverage

The suite exists to cover reusable visualization patterns. A pattern with no
ready case is an untested capability of the visual language. Counting cases
measures nothing; this table is the measure.

Generated from `patterns.json` and `benchmark-registry.json`. Regenerate rather
than editing by hand.

| pattern | ready cases | skeleton cases | candidate projects |
|---|---|---|---|
| **Flow** | illustrated-transformer/01-self-attention-computation-flow | 5 | brendan-bycroft-llm-visualization, 3blue1brown-transformers, abhik-sarkar-transformer-visualizations, modular-llm-inference-handbook |
| **Matrix operations** | illustrated-transformer/01-self-attention-computation-flow | 5 | transformer-explainer, abhik-sarkar-transformer-visualizations, attention-variants, cnn-explainer |
| **Zoom and drill-down** | illustrated-transformer/01-self-attention-computation-flow | — | brendan-bycroft-llm-visualization, cnn-explainer |
| **Parameter exploration** | — | — | transformer-explainer, tensorflow-playground, google-pair-explorables, distill, diffusion-explainer, seeing-theory, gan-lab |
| **Coordinated views** | — | 1 | transformer-explainer, google-pair-explorables, distill, neuronpedia |
| **Routing** | — | 1 | attention-variants, mixture-of-experts-visual-guide |
| **Process scrubbing** | illustrated-transformer/01-self-attention-computation-flow | — | transformer-explainer, modular-llm-inference-handbook, diffusion-explainer |
| **Live computation** | — | 2 | 3blue1brown-transformers, tensorflow-playground, diffusion-explainer, seeing-theory, cnn-explainer, gan-lab |
| **Graphs and networks** | — | 1 | tensorflow-playground |
| **Embeddings and high-dimensional spaces** | — | — | 3blue1brown-transformers, apple-embedding-atlas, neuronpedia |
| **3D and spatial systems** | — | — | brendan-bycroft-llm-visualization |

**4 of 11 patterns have a case with real reference material.**

## What is blocked, and by what

Two uncovered patterns cannot be benchmarked yet for a reason that is not about
reference material: **parameter exploration** and **coordinated views** both need a
learner input that changes the picture. The runtime has no input axis until Plan B
lands, so a benchmark for either would be measuring something that does not exist.
Capturing their references early is still useful; running them is not.

The rest are uncovered only because no reference has been captured. They are the
queue, one project at a time.
