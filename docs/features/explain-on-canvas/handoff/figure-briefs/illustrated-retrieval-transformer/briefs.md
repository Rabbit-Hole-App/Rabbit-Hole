# The Illustrated Retrieval Transformer figure briefs

15 figure occurrences in document order. [Source page](https://jalammar.github.io/illustrated-retrieval-transformer/) · [Inventory](manifest.json)

## Figure 01

A retrieval-enhanced language model can consult a separate searchable collection when predicting text.

- **Kinds.** `relationship`
- **Elements.** Two distinct components, a query that travels to the store and evidence that returns to the model.
- **Sequence.** Why attach a retrieval store · step 1
- **Phase 02.** [19](../briefs/19-ml-system-design.md)

## Figure 02

Some plausible text completions require a fact that the wording alone cannot identify.

- **Kinds.** `sample-set`
- **Elements.** An original short factual prompt, an unfilled answer slot and a separate evidence entry that resolves it.
- **Sequence.** Why attach a retrieval store · step 2

## Figure 03

Common phrases sometimes supply enough linguistic evidence to fill a blank without a lookup.

- **Kinds.** `sample-set`
- **Elements.** An original incomplete familiar phrase and the decisive words near the blank; contrast its evidence requirement with the previous example.
- **Sequence.** Why attach a retrieval store · step 3

## Figure 04

Retrieval moves some factual recall outside the language model while leaving language generation in its parameters.

- **Kinds.** `comparison`
- **Elements.** Compare a standalone model and a model with a searchable store; keep shared language modeling and the different sources of factual evidence explicit.
- **Sequence.** Why attach a retrieval store · step 4
- **Phase 02.** [19](../briefs/19-ml-system-design.md)

## Figure 05

A factual question can be answered by retrieving evidence and using it in the language model's prediction.

- **Kinds.** `sequence`
- **Elements.** One original prompt, a retrieval request, a short evidence result and a completion supported by that result.
- **Sequence.** Why attach a retrieval store · step 5
- **Phase 02.** [19](../briefs/19-ml-system-design.md)
- **Offline example.** `ml-rag-retrieval`

## Figure 06

A retrieval index can store an embedding key with both the matched text chunk and the text that follows it.

- **Kinds.** `matrix`
- **Elements.** At least two independently written entries; one short vector key, a matched span and a continuation per row.
- **Sequence.** Building and querying the index · step 1

## Figure 07

Averaging contextual token vectors gives one fixed-length representation for an input chunk.

- **Kinds.** `transformation`
- **Elements.** Original tokens, matching small contextual vectors and an independently computed coordinate-wise mean.
- **Sequence.** Building and querying the index · step 2

## Figure 08

Nearest-neighbor search ranks indexed chunks by their distance from the encoded input.

- **Kinds.** `coordinate-plot`
- **Elements.** Show one query point and several labeled index points, mark two retrieved neighbors and identify the returned text without implying exact search.
- **Sequence.** Building and querying the index · step 3
- **Phase 02.** [06](../briefs/06-knn-and-distances.md)

## Figure 09

The model receives retrieved neighbors and their continuations as evidence alongside the original prompt.

- **Kinds.** `matrix` · `flow`
- **Elements.** Keep the prompt and neighbor streams distinct, include two short evidence entries and show a completion consistent with the intended evidence.
- **Sequence.** Building and querying the index · step 4

## Figure 10

The retrieval encoder processes external text while the causal decoder processes the original input.

- **Kinds.** `comparison`
- **Elements.** Two component stacks with separate inputs and a connection from the encoded retrieval state to the decoder.
- **Sequence.** Where retrieved text joins the model · step 1

## Figure 11

Retrieval-aware decoder layers are interleaved with ordinary decoder layers.

- **Kinds.** `block-stack`
- **Elements.** An original short stack with several standard blocks and at least one retrieval-aware block; encode neighbors on a separate side.
- **Sequence.** Where retrieved text joins the model · step 2

## Figure 12

Encoding the retrieved text supplies key and value tensors for later cross-attention.

- **Kinds.** `transformation`
- **Elements.** Show the retrieved input, a compact encoder and separate key and value outputs kept distinct from the decoder query.
- **Sequence.** Where retrieved text joins the model · step 3

## Figure 13

Ordinary decoder layers use causal self-attention and can process the prompt before any retrieved evidence enters.

- **Kinds.** `block-stack`
- **Elements.** Prompt tokens, early decoder blocks with causal masking and no incoming evidence link.
- **Sequence.** Where retrieved text joins the model · step 4

## Figure 14

A retrieval-aware layer is where encoded neighbor information first enters the decoder stream.

- **Kinds.** `block-stack`
- **Elements.** Earlier ordinary layers, one emphasized retrieval-aware layer and an incoming key/value connection at that layer only.
- **Sequence.** Where retrieved text joins the model · step 5

## Figure 15

Chunked cross-attention lets decoder features weight useful positions in the retrieved passages when predicting the next token.

- **Kinds.** `token-links` · `block-stack`
- **Elements.** One original input span, a causal query formed from available tokens, separate retrieved token positions and illustrative attention weights on relevant evidence.
- **Sequence.** Where retrieved text joins the model · step 6
