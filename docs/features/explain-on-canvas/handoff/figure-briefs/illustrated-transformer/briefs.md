# The Illustrated Transformer figure briefs

36 figure occurrences in document order. [Source page](https://jalammar.github.io/illustrated-transformer/) · [Inventory](manifest.json)

## Figure 01

A sequence-to-sequence Transformer can translate a source sentence into a target sentence.

- **Kinds.** `flow`
- **Elements.** Source phrase, one transformation boundary, and an independently chosen translation.
- **Sequence.** Illustrated Transformer · Architecture · step 1
- **Phase 02.** [01](../briefs/01-what-is-machine-learning.md)

## Figure 02

The encoder prepares source representations that the decoder can consult while producing the target.

- **Kinds.** `relationship` · `flow`
- **Elements.** Encoder, decoder, source input, target prefix, and a directed connection carrying encoder memory.
- **Sequence.** Illustrated Transformer · Architecture · step 2
- **Phase 02.** [01](../briefs/01-what-is-machine-learning.md)

## Figure 03

Separate encoder and decoder stacks repeat their layer recipes while keeping learned parameters distinct.

- **Kinds.** `block-stack` · `relationship`
- **Elements.** Two repeat groups, independent layer parameters, and the path from encoder memory to decoder attention.
- **Sequence.** Illustrated Transformer · Architecture · step 3

## Figure 04

The original encoder applies attention before its positionwise feed-forward sublayer.

- **Kinds.** `block-stack`
- **Elements.** Ordered sublayers, one repeated encoder block, and a per-position representation entering and leaving.
- **Sequence.** Illustrated Transformer · Architecture · step 4
- **Existing reference.** `ml-transformer-encoder-stack`

## Figure 05

The original decoder adds a source-reading sublayer between masked self-attention and its positionwise feed-forward sublayer.

- **Kinds.** `block-stack`
- **Elements.** Three sublayers in order, a target-prefix stream, and a separate encoder-memory input at cross-attention.
- **Sequence.** Illustrated Transformer · Architecture · step 5

## Figure 06

Each token position starts with a vector looked up from its token identity.

- **Kinds.** `block-stack` · `tensor`
- **Elements.** A sentence-order strip of token vectors, shared lookup for repeated tokens, and the distinction between toy entries and model width.
- **Sequence.** Illustrated Transformer · Representations · step 1
- **Phase 02.** [08](../briefs/08-feature-engineering.md)
- **Existing reference.** `ml-transformer-token-embeddings`

## Figure 07

Successive encoder layers consume the prior layer's vector at every position.

- **Kinds.** `block-stack` · `relationship`
- **Elements.** Token vectors feeding the first layer, equally shaped output vectors entering a later layer, and a distinction between lookup and contextual states.
- **Sequence.** Illustrated Transformer · Representations · step 2

## Figure 08

Attention exchanges information across positions while the feed-forward sublayer updates each position separately.

- **Kinds.** `relationship` · `flow`
- **Elements.** Two or more token positions, a cross-position attention dependency, and position-specific streams using the same feed-forward weights.
- **Sequence.** Illustrated Transformer · Representations · step 3

## Figure 09

Attention can give a token more context from a relevant distant word than from nearby words.

- **Kinds.** `token-links`
- **Elements.** One query, a few plausible targets, and stronger weight on the contextually relevant one rather than a claim that attention proves a grammatical link.
- **Sequence.** Illustrated Transformer · One attention query · step 1
- **Existing reference.** `ml-self-attention-token-links`

## Figure 10

A token's hidden vector is projected separately into a query, key, and value.

- **Kinds.** `transformation` · `tensor`
- **Elements.** One displayed input vector, three distinct learned projections, and their numeric outputs with dimensions.
- **Sequence.** Illustrated Transformer · One attention query · step 2
- **Phase 02.** [08](../briefs/08-feature-engineering.md)
- **Existing reference.** `ml-transformer-qkv-projections`

## Figure 11

A query scores each candidate key by multiplying corresponding components and summing them.

- **Kinds.** `matrix` · `tensor`
- **Elements.** One query, the sequence keys, and one dot product for each key before any normalization.
- **Sequence.** Illustrated Transformer · One attention query · step 3
- **Existing reference.** `ml-transformer-scaled-attention-scores`

## Figure 12

Scaling and softmax convert raw matches into a comparable distribution over positions.

- **Kinds.** `matrix` · `token-links`
- **Elements.** Raw scores, the square-root scale from head width, normalized weights, and all weights summing to one.
- **Sequence.** Illustrated Transformer · One attention query · step 4
- **Phase 02.** [03](../briefs/03-logistic-regression.md)
- **Existing reference.** `ml-transformer-scaled-attention-scores` · `ml-transformer-attention-softmax`

## Figure 13

Attention forms the output for one token by weighting every value vector and adding corresponding entries.

- **Kinds.** `transformation` · `block-stack`
- **Elements.** One value per key, each coefficient, the resulting componentwise sum, and exact agreement between displayed operands and result.
- **Sequence.** Illustrated Transformer · One attention query · step 5
- **Existing reference.** `ml-transformer-weighted-values`

## Figure 14

Packing token vectors into rows computes all query, key, and value rows with three matrix products.

- **Kinds.** `matrix` · `transformation`
- **Elements.** Token positions in row order, shared projection matrices, output shapes, and the same per-token result as a single-row calculation.
- **Sequence.** Illustrated Transformer · Attention for a full sequence · step 1

## Figure 15

The same attention calculation processes all query positions by scoring a query-by-key matrix and normalizing each query row before mixing values.

- **Kinds.** `heatmap` · `matrix`
- **Elements.** Query and key axes, a score matrix and weight matrix on the same positions, rowwise sums of one, and output vectors with the correct shape.
- **Sequence.** Illustrated Transformer · Attention for a full sequence · step 2

## Figure 16

Each head learns its own projections, so heads can score a sequence differently.

- **Kinds.** `comparison` · `token-links`
- **Elements.** Identical input positions, separate projection sets, and a visible difference in the resulting score or weight patterns.
- **Sequence.** Illustrated Transformer · Parallel attention heads · step 1
- **Existing reference.** `ml-transformer-parallel-attention-heads`

## Figure 17

A full attention head returns a context vector at each query position.

- **Kinds.** `matrix` · `block-stack`
- **Elements.** The same query positions in two heads, one output vector per head per query, and no concatenation yet.
- **Sequence.** Illustrated Transformer · Parallel attention heads · step 2
- **Existing reference.** `ml-transformer-parallel-attention-heads`

## Figure 18

The output projection mixes concatenated head vectors into the width used by the next sublayer.

- **Kinds.** `transformation` · `tensor`
- **Elements.** Head outputs at one position, their ordered concatenation, the learned output matrix, and its projected vector.
- **Sequence.** Illustrated Transformer · Parallel attention heads · step 3
- **Existing reference.** `ml-transformer-parallel-attention-heads`

## Figure 19

Multi-head attention repeats the score-and-mix computation in parallel, then joins the head outputs.

- **Kinds.** `block-stack` · `transformation`
- **Elements.** Shared token input, parallel head stages, ordered concatenation, and one projected result for the feed-forward sublayer.
- **Sequence.** Illustrated Transformer · Parallel attention heads · step 4
- **Existing reference.** `ml-transformer-parallel-attention-heads`

## Figure 20

Two heads can weigh different tokens highly even when they process the same query.

- **Kinds.** `comparison` · `token-links`
- **Elements.** Identical query and targets, two independently normalized distributions, and different strongest targets.
- **Sequence.** Illustrated Transformer · Parallel attention heads · step 5
- **Existing reference.** `ml-transformer-parallel-attention-heads`

## Figure 21

A combined view of many attention heads can obscure which head produced an edge.

- **Kinds.** `heatmap` · `comparison`
- **Elements.** A shared query and target order, per-head values shown on a common scale, and a demonstration of why separate rows aid inspection.
- **Sequence.** Illustrated Transformer · Parallel attention heads · step 6

## Figure 22

Adding a position vector to each token embedding makes order available to attention.

- **Kinds.** `transformation` · `block-stack`
- **Elements.** Token and position vectors of the same width, elementwise addition, and distinct combined states for repeated tokens at different positions.
- **Sequence.** Illustrated Transformer · Token positions · step 1
- **Phase 02.** [08](../briefs/08-feature-engineering.md)
- **Existing reference.** `ml-transformer-token-embeddings`

## Figure 23

Sinusoidal position features give each position a distinct combination of slow and fast coordinates.

- **Kinds.** `coordinate-plot` · `heatmap`
- **Elements.** Two frequencies over positions, paired sine and cosine coordinates, and a selected row that matches the plot.
- **Sequence.** Illustrated Transformer · Token positions · step 2
- **Phase 02.** [08](../briefs/08-feature-engineering.md)
- **Existing reference.** `ml-transformer-token-embeddings`

## Figure 24

A position-by-feature heatmap shows how phase changes across token positions and feature channels.

- **Kinds.** `heatmap`
- **Elements.** Ordered positions, a few low- and high-frequency coordinates, symmetric signed scale, and positional values computed from the shared toy data.
- **Sequence.** Illustrated Transformer · Token positions · step 3
- **Phase 02.** [08](../briefs/08-feature-engineering.md)

## Figure 25

Interleaving each sine channel with its cosine partner keeps the positional signals paired by frequency.

- **Kinds.** `heatmap` · `matrix`
- **Elements.** Column pairs with distinct frequencies, token positions along rows, and a distinction between a feature-order convention and the values themselves.
- **Sequence.** Illustrated Transformer · Token positions · step 4
- **Phase 02.** [08](../briefs/08-feature-engineering.md)

## Figure 26

A post-norm encoder adds the unchanged sublayer input to the sublayer result before normalizing.

- **Kinds.** `block-stack`
- **Elements.** Original stream, a skip around each sublayer, an addition at each join, and normalization after each join.
- **Sequence.** Illustrated Transformer · Residuals and normalization · step 1
- **Existing reference.** `ml-transformer-encoder-stack`

## Figure 27

A small numeric example separates adding the residual from normalizing the resulting vector.

- **Kinds.** `transformation` · `tensor`
- **Elements.** Aligned input and attention output values, their componentwise sum, then the mean and variance used for normalization.
- **Sequence.** Illustrated Transformer · Residuals and normalization · step 2
- **Phase 02.** [08](../briefs/08-feature-engineering.md)

## Figure 28

The original decoder repeats the residual-add-and-normalize pattern around all three of its sublayers.

- **Kinds.** `block-stack` · `relationship`
- **Elements.** Decoder target stream, source memory entering cross-attention, and a residual join followed by normalization for each decoder sublayer.
- **Sequence.** Illustrated Transformer · Residuals and normalization · step 3

## Figure 29

The encoder computes source memory before the decoder begins to predict target tokens.

- **Kinds.** `sequence` · `timeline`
- **Elements.** Source encoding once, encoder keys and values held fixed, the first target prefix, and one prediction feeding the next step.
- **Sequence.** Illustrated Transformer · Generation · step 1

## Figure 30

Autoregressive generation appends each predicted token to the prefix and repeats until a stop token or limit.

- **Kinds.** `timeline` · `sequence`
- **Elements.** Ordered inference steps, the same fixed source memory, visibly growing target prefix, and a labelled stopping event.
- **Sequence.** Illustrated Transformer · Generation · step 2

## Figure 31

A learned projection produces one score for each vocabulary entry and softmax turns those scores into next-token probabilities.

- **Kinds.** `bar-chart` · `tensor`
- **Elements.** Decoder state, fixed vocabulary order, one logit and normalized probability per candidate, and the maximum marked.
- **Sequence.** Illustrated Transformer · Generation · step 3
- **Phase 02.** [03](../briefs/03-logistic-regression.md)
- **Existing reference.** `ml-transformer-vocabulary-softmax`

## Figure 32

The output vocabulary defines a fixed ordering of slots in the prediction vector.

- **Kinds.** `matrix` · `block-stack`
- **Elements.** Independent toy vocabulary, indexed entries, a special stopping entry if used, and a stable label-to-slot mapping.
- **Sequence.** Illustrated Transformer · Training targets · step 1
- **Phase 02.** [08](../briefs/08-feature-engineering.md)

## Figure 33

A one-hot target identifies the observed next token by marking only its vocabulary slot.

- **Kinds.** `transformation` · `tensor`
- **Elements.** Chosen next token, vocabulary ordering, one active entry, and zeros in other entries.
- **Sequence.** Illustrated Transformer · Training targets · step 2
- **Phase 02.** [08](../briefs/08-feature-engineering.md)

## Figure 34

Training compares the model's next-token distribution with the observed target token.

- **Kinds.** `bar-chart` · `transformation`
- **Elements.** Predicted and target distributions on the same vocabulary order, selected correct-token probability, and its negative log loss.
- **Sequence.** Illustrated Transformer · Training targets · step 3
- **Phase 02.** [03](../briefs/03-logistic-regression.md) · [09](../briefs/09-model-evaluation.md)

## Figure 35

A target sentence supplies a different next-token label at each prefix position during training.

- **Kinds.** `matrix` · `timeline`
- **Elements.** A few related prefixes, the observed continuation for each, and separate aligned target rows including a stop token if present.
- **Sequence.** Illustrated Transformer · Training targets · step 4
- **Phase 02.** [01](../briefs/01-what-is-machine-learning.md) · [03](../briefs/03-logistic-regression.md)

## Figure 36

Assigning greater probability to observed next tokens reduces their cross-entropy loss.

- **Kinds.** `comparison` · `bar-chart`
- **Elements.** Two independently labelled illustrative distributions, a shared vocabulary and true target, and the exact change in its negative log probability.
- **Sequence.** Illustrated Transformer · Training targets · step 5
- **Phase 02.** [03](../briefs/03-logistic-regression.md) · [09](../briefs/09-model-evaluation.md)
