# Prompts selecting a new C09 reference

These 25 prompt and reference pairs selected the listed reference at Brief, Balanced, and Detailed.

## `ml-contextual-embeddings-contextual-word-vectors`

- The same surface word can have different contextual representations in sentences that mean different things.
- ELMo maps a whole sentence to a sequence of contextual vectors with one vector aligned to each token.
- Show ambiguous token output rows for seal in animal and gasket contexts.
- How does contextual sequence alignment give one vector to every input token?
- Keep every input position visible while comparing ambiguous token output rows.
- Change only the right cue and recompute contextual sequence alignment.
- Compare ambiguous token output rows without averaging the whole sentence.

## `ml-contextual-embeddings-two-directional-states`

- Forward and backward language models supply complementary context states at the same token position.
- Show independent directional states at each position of a seal glides.
- How do opposite read streams reach the selected seal position?
- Change the right cue while keeping independent directional states separate.
- Compare opposite read streams without treating them as BERT self-attention.
- Which independent directional states stay fixed before an edited suffix?

## `ml-contextual-embeddings-weighted-layer-states`

- ELMo concatenates the forward and backward states at each depth and combines the layer representations with task-specific weights.
- Show task layer mixture products after concatenating forward and backward states.
- Explain the direction concat layer sum with compatible base and layer widths.
- Keep token states fixed and change the task layer mixture products.
- Which coefficients in a direction concat layer sum index depths rather than tokens?
- Recompute task layer mixture products before adding their output coordinates.

## `ml-contextual-embeddings-layer-pooling-evaluation`

- Layer selection and layer combination can change the quality of frozen text features for a downstream task.
- Show a frozen pooling F1 comparison with supplied untrained readouts.
- How do fixed cohort layer readouts turn frozen features into predictions?
- Reorder samples and recompute a frozen pooling F1 comparison.
- Keep feature widths and fixed cohort layer readouts aligned for last, sum and join.
- Explain why a frozen pooling F1 comparison does not prove a general best layer.
