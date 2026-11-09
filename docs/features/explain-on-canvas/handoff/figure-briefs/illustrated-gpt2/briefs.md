# The Illustrated GPT-2 figure briefs

65 figure occurrences in document order. [Source page](https://jalammar.github.io/illustrated-gpt2/) · [Inventory](manifest.json)

## Figure 01

GPT-2 continues a text prompt by generating plausible new text.

- **Kinds.** `flow`
- **Elements.** A short independently written seed passage and continuation, with a clear boundary between the two.
- **Sequence.** Illustrated GPT-2 · Language modelling · step 1
- **Phase 02.** [01](../briefs/01-what-is-machine-learning.md)

## Figure 02

Keyboard suggestions illustrate the same basic next-token task as a language model.

- **Kinds.** `bar-chart` · `sequence`
- **Elements.** A new prefix, several possible continuations, and their ranked chances without recreating the keyboard interface.
- **Sequence.** Illustrated GPT-2 · Language modelling · step 2
- **Phase 02.** [01](../briefs/01-what-is-machine-learning.md) · [03](../briefs/03-logistic-regression.md)

## Figure 03

The same model architecture can be trained at substantially different parameter counts.

- **Kinds.** `bar-chart` · `matrix`
- **Elements.** Two or more capacity settings with parameter counts in one unit, and no unsupported inference about capability or throughput.
- **Sequence.** Illustrated GPT-2 · Language modelling · step 3
- **Phase 02.** [19](../briefs/19-ml-system-design.md)

## Figure 04

Translation Transformers pair a source encoder with a target decoder.

- **Kinds.** `relationship` · `block-stack`
- **Elements.** Source text, encoder memory, target prefix, and cross-attention from the decoder to the memory.
- **Sequence.** Illustrated GPT-2 · Language modelling · step 4

## Figure 05

GPT-2, BERT and Transformer-XL repeat different kinds of blocks for different ways of using context.

- **Kinds.** `matrix` · `comparison`
- **Elements.** Causal decoder, bidirectional encoder, and decoder with prior-segment memory, with one distinct context rule per architecture.
- **Sequence.** Illustrated GPT-2 · Language modelling · step 5

## Figure 06

Increasing a model's depth and width increases its parameter count.

- **Kinds.** `matrix` · `bar-chart`
- **Elements.** A small model family with aligned depth, width, and parameter counts on a consistent scale.
- **Sequence.** Illustrated GPT-2 · Language modelling · step 6

## Figure 07

A causal decoder reveals one predicted token at each successive generation step.

- **Kinds.** `timeline` · `sequence`
- **Elements.** Seed prefix, ordered prediction events, and one visible token appended per event.
- **Sequence.** Illustrated GPT-2 · Language modelling · step 7

## Figure 08

The token just predicted becomes part of the next autoregressive input.

- **Kinds.** `timeline` · `transformation`
- **Elements.** Two consecutive prefixes with the newly appended token highlighted and the next call visibly dependent on it.
- **Sequence.** Illustrated GPT-2 · Language modelling · step 8

## Figure 09

An encoder block combines context across tokens and then applies a network at each position.

- **Kinds.** `block-stack`
- **Elements.** Two sublayers, the token stream, and where residuals and normalization enter when included.
- **Sequence.** Illustrated GPT-2 · Transformer block variants · step 1
- **Existing reference.** `ml-transformer-encoder-stack`

## Figure 10

The translation decoder adds cross-attention to causal self-attention and positionwise processing.

- **Kinds.** `block-stack` · `relationship`
- **Elements.** Three sublayers in order, one encoder-memory connection, and target-prefix input kept separate.
- **Sequence.** Illustrated GPT-2 · Transformer block variants · step 2

## Figure 11

Causal self-attention makes a position depend only on itself and positions to its left.

- **Kinds.** `token-links` · `heatmap`
- **Elements.** One interior query, allowed prior and current positions, and no weighted link to any later position.
- **Sequence.** Illustrated GPT-2 · Transformer block variants · step 3
- **Existing reference.** `ml-transformer-causal-mask`

## Figure 12

Bidirectional and causal attention differ in which keys each query can read.

- **Kinds.** `comparison` · `heatmap`
- **Elements.** Same sentence and focus position in both views, a shared axes convention, and a clearly marked future region hidden only on the causal side.
- **Sequence.** Illustrated GPT-2 · Transformer block variants · step 4

## Figure 13

A decoder-only Transformer uses causal blocks and omits cross-attention to a separate encoder.

- **Kinds.** `block-stack`
- **Elements.** A repeated decoder block, masked context exchange, positionwise updates, and vocabulary output.
- **Sequence.** Illustrated GPT-2 · Transformer block variants · step 5

## Figure 14

The representation at each token position passes through a succession of GPT-2 decoder blocks.

- **Kinds.** `block-stack` · `relationship`
- **Elements.** A few aligned token positions, separate parameters across layers, and a sequence of updated vectors for one selected position.
- **Sequence.** Illustrated GPT-2 · Transformer block variants · step 6

## Figure 15

Generation can begin from a special start condition even with no user text.

- **Kinds.** `timeline` · `flow`
- **Elements.** A start condition, first model prediction, and an explicit distinction from continuing a supplied prompt.
- **Sequence.** Illustrated GPT-2 · One pass through GPT-2 · step 1

## Figure 16

The next inference step processes the new token while earlier context remains available.

- **Kinds.** `timeline` · `sequence`
- **Elements.** Two time steps, the new token as the active query, and previous keys and values reused as context.
- **Sequence.** Illustrated GPT-2 · One pass through GPT-2 · step 2
- **Offline example.** `ml-kv-cache-decode`

## Figure 17

An embedding lookup selects a single learned row for an input token.

- **Kinds.** `matrix` · `tensor`
- **Elements.** A toy vocabulary with stable IDs, the selected row, and a compact display of its embedding values.
- **Sequence.** Illustrated GPT-2 · One pass through GPT-2 · step 3
- **Phase 02.** [08](../briefs/08-feature-engineering.md)
- **Existing reference.** `ml-transformer-token-embeddings`

## Figure 18

GPT-2 learns a separate table of position vectors indexed by position.

- **Kinds.** `matrix` · `tensor`
- **Elements.** A few positions and their distinct learned vectors, independent from token identities.
- **Sequence.** Illustrated GPT-2 · One pass through GPT-2 · step 4
- **Phase 02.** [08](../briefs/08-feature-engineering.md)

## Figure 19

A decoder adds the token lookup vector and its position vector before entering the first block.

- **Kinds.** `transformation` · `tensor`
- **Elements.** One position and token, equal-width operands, and their componentwise sum.
- **Sequence.** Illustrated GPT-2 · One pass through GPT-2 · step 5
- **Phase 02.** [08](../briefs/08-feature-engineering.md)

## Figure 20

The context update and feed-forward update happen in sequence within each decoder block.

- **Kinds.** `block-stack`
- **Elements.** Causal attention, positionwise network, one token stream, and matching input and output widths.
- **Sequence.** Illustrated GPT-2 · One pass through GPT-2 · step 6

## Figure 21

A decoder can give a current token strong weight on an earlier contextual cue.

- **Kinds.** `token-links`
- **Elements.** One independently chosen ambiguous token, an earlier informative token, allowed preceding positions and illustrative weights.
- **Sequence.** Illustrated GPT-2 · One pass through GPT-2 · step 7
- **Existing reference.** `ml-self-attention-token-links`

## Figure 22

A query is matched against keys and the associated values are the material returned.

- **Kinds.** `relationship` · `transformation`
- **Elements.** A request vector, labelled key-value pairs, and a semantic distinction between matching and retrieving content.
- **Sequence.** Illustrated GPT-2 · One pass through GPT-2 · step 8

## Figure 23

Key matches turn into weights used to blend the values.

- **Kinds.** `matrix` · `token-links`
- **Elements.** One query, keys in sequence order, raw scores and normalized weights for the same positions.
- **Sequence.** Illustrated GPT-2 · One pass through GPT-2 · step 9
- **Existing reference.** `ml-transformer-scaled-attention-scores` · `ml-transformer-attention-softmax`

## Figure 24

A weighted sum of values creates the new context for one token position.

- **Kinds.** `transformation` · `block-stack`
- **Elements.** Matching coefficients and vectors in one order, componentwise products, and their summed vector.
- **Sequence.** Illustrated GPT-2 · One pass through GPT-2 · step 10
- **Existing reference.** `ml-transformer-weighted-values`

## Figure 25

The output layer projects a hidden vector to one score per token in the vocabulary.

- **Kinds.** `transformation` · `tensor`
- **Elements.** Hidden state, shared embedding weights when discussing GPT-2, and scores aligned with vocabulary slots.
- **Sequence.** Illustrated GPT-2 · One pass through GPT-2 · step 11
- **Phase 02.** [03](../briefs/03-logistic-regression.md)
- **Existing reference.** `ml-transformer-vocabulary-softmax`

## Figure 26

A single forward pass yields competing scores for possible next tokens.

- **Kinds.** `bar-chart`
- **Elements.** Candidate tokens, one score per token and stable rank ordering, with logits distinguished from probabilities.
- **Sequence.** Illustrated GPT-2 · One pass through GPT-2 · step 12
- **Phase 02.** [03](../briefs/03-logistic-regression.md)
- **Existing reference.** `ml-transformer-vocabulary-softmax`

## Figure 27

Greedy selection and sampling can choose different next tokens from the same distribution.

- **Kinds.** `bar-chart` · `comparison`
- **Elements.** Same normalized weights, the highest-probability token, and a labelled example draw selecting a different candidate.
- **Sequence.** Illustrated GPT-2 · One pass through GPT-2 · step 13
- **Phase 02.** [03](../briefs/03-logistic-regression.md)

## Figure 28

An architecture overview intentionally leaves out lower-level details like residuals and normalization.

- **Kinds.** `block-stack` · `comparison`
- **Elements.** A high-level block and an expanded view, with both omitted connections labelled explicitly.
- **Sequence.** Illustrated GPT-2 · One pass through GPT-2 · step 14

## Figure 29

Masked attention lets a token collect context from allowed positions inside a single decoder layer.

- **Kinds.** `token-links` · `heatmap`
- **Elements.** Focus position, allowed earlier keys and values, current key when allowed, and hidden future tokens.
- **Sequence.** Illustrated GPT-2 · Attention arithmetic · step 1
- **Existing reference.** `ml-transformer-causal-mask`

## Figure 30

Self-attention can be broken into projections, scoring, and a value mix.

- **Kinds.** `flow`
- **Elements.** One data stream through the three conceptual stages and the distinct role of each projected vector.
- **Sequence.** Illustrated GPT-2 · Attention arithmetic · step 2

## Figure 31

Each token's hidden representation has separate query, key and value projections.

- **Kinds.** `transformation` · `tensor`
- **Elements.** One input row, three different learned projections, and consistently labelled outputs.
- **Sequence.** Illustrated GPT-2 · Attention arithmetic · step 3
- **Existing reference.** `ml-transformer-qkv-projections`

## Figure 32

Each query compares with all eligible keys before weights are computed.

- **Kinds.** `matrix` · `tensor`
- **Elements.** A single query, several keys, and scores derived from the displayed components.
- **Sequence.** Illustrated GPT-2 · Attention arithmetic · step 4
- **Existing reference.** `ml-transformer-scaled-attention-scores`

## Figure 33

Values contribute to the result in proportion to their attention weights.

- **Kinds.** `transformation` · `block-stack`
- **Elements.** Value strips, normalized coefficients, matching componentwise products, and the resulting sum.
- **Sequence.** Illustrated GPT-2 · Attention arithmetic · step 5
- **Existing reference.** `ml-transformer-weighted-values`

## Figure 34

Repeating the same attention stages for each query gives one contextual vector per position.

- **Kinds.** `flow` · `heatmap`
- **Elements.** Query rows, a common set of keys, per-row weights, and position-aligned outputs.
- **Sequence.** Illustrated GPT-2 · Attention arithmetic · step 6

## Figure 35

Masking future positions leaves their weights at zero without changing how scores for eligible positions are computed.

- **Kinds.** `flow` · `heatmap`
- **Elements.** One interior query, eligible positions including itself, blocked future logits before softmax, and row weights that sum to one.
- **Sequence.** Illustrated GPT-2 · Attention arithmetic · step 7
- **Existing reference.** `ml-transformer-causal-mask`

## Figure 36

A next-token training example aligns each prefix with its immediate continuation.

- **Kinds.** `matrix` · `timeline`
- **Elements.** Overlapping prefixes from one new sentence, one target each, and no information from beyond the target.
- **Sequence.** Illustrated GPT-2 · Attention arithmetic · step 8
- **Phase 02.** [01](../briefs/01-what-is-machine-learning.md) · [15](../briefs/15-time-series.md)

## Figure 37

Packing queries and keys lets the model compute every pairwise score in one matrix operation.

- **Kinds.** `heatmap` · `matrix`
- **Elements.** Query-position rows, key-position columns, shared score calculation, and a dimensions check.
- **Sequence.** Illustrated GPT-2 · Attention arithmetic · step 9

## Figure 38

The causal mask replaces scores to the right of a query with a blocked value before softmax.

- **Kinds.** `heatmap`
- **Elements.** Same ordered tokens on each axis, a visible triangular blocked region, and an explanation of the blocked-cell sentinel.
- **Sequence.** Illustrated GPT-2 · Attention arithmetic · step 10
- **Existing reference.** `ml-transformer-causal-mask`

## Figure 39

Rowwise softmax gives blocked future keys zero probability while visible weights still sum to one.

- **Kinds.** `heatmap`
- **Elements.** Score grid after masking, normalized grid with the same labels, and an independently checked row sum.
- **Sequence.** Illustrated GPT-2 · Attention arithmetic · step 11
- **Phase 02.** [03](../briefs/03-logistic-regression.md)
- **Existing reference.** `ml-transformer-causal-mask`

## Figure 40

GPT-2 computes a separate query, key and value for the current token at every decoder layer.

- **Kinds.** `transformation` · `block-stack`
- **Elements.** One active token, its distinct projections at two layers, and matching position labels before the key and value are kept.
- **Sequence.** Illustrated GPT-2 · Cached inference and multiple heads · step 1
- **Offline example.** `ml-kv-cache-decode`

## Figure 41

The cache keeps a layer's earlier keys and values for future token queries.

- **Kinds.** `matrix` · `relationship`
- **Elements.** One cache row per earlier position, labelled key and value entries, and a selected layer.
- **Sequence.** Illustrated GPT-2 · Cached inference and multiple heads · step 2
- **Offline example.** `ml-kv-cache-decode`

## Figure 42

A new token query can score cached earlier keys without recomputing their projections.

- **Kinds.** `sequence` · `relationship`
- **Elements.** Cached earlier keys and values, new query and new cache entries, then a read of old and current rows.
- **Sequence.** Illustrated GPT-2 · Cached inference and multiple heads · step 3
- **Offline example.** `ml-kv-cache-decode`

## Figure 43

Attention projections consume one hidden vector for the current position at the current layer.

- **Kinds.** `tensor` · `block-stack`
- **Elements.** Focus token, layer-specific input vector and width, and the difference between the initial embedding and a later layer state.
- **Sequence.** Illustrated GPT-2 · Cached inference and multiple heads · step 4

## Figure 44

A combined learned matrix can project one input into the components for queries, keys, and values.

- **Kinds.** `transformation` · `tensor`
- **Elements.** A small input vector, a joint projection with bias if shown, and the combined output divided into three named ranges.
- **Sequence.** Illustrated GPT-2 · Cached inference and multiple heads · step 5

## Figure 45

The joint projection result is sliced into the separate vectors used by attention.

- **Kinds.** `transformation` · `tensor`
- **Elements.** The joint output, ordered slice boundaries, the three named vectors and their widths.
- **Sequence.** Illustrated GPT-2 · Cached inference and multiple heads · step 6

## Figure 46

Splitting into heads partitions the projected coordinates into independent smaller groups.

- **Kinds.** `transformation` · `tensor`
- **Elements.** A projected set of query, key and value coordinates, identical head slices across all three, and dimensional bookkeeping.
- **Sequence.** Illustrated GPT-2 · Cached inference and multiple heads · step 7

## Figure 47

Each head can process the same positions using its own coordinate slices.

- **Kinds.** `comparison` · `token-links`
- **Elements.** Two head inputs or resulting weight views with the same query and key positions, and one clear contrast between heads.
- **Sequence.** Illustrated GPT-2 · Cached inference and multiple heads · step 8
- **Existing reference.** `ml-transformer-parallel-attention-heads`

## Figure 48

A selected attention head reads only its own query, key and value slices for the current position.

- **Kinds.** `block-stack` · `tensor`
- **Elements.** A named head, a current token, and aligned slices of equal head width before scoring.
- **Sequence.** Illustrated GPT-2 · Cached inference and multiple heads · step 9
- **Existing reference.** `ml-transformer-parallel-attention-heads`

## Figure 49

A decoder head uses stored earlier keys as well as the newly computed key when scoring context.

- **Kinds.** `matrix` · `token-links`
- **Elements.** New query, origin of each key, and weights normalized across the same allowed positions.
- **Sequence.** Illustrated GPT-2 · Cached inference and multiple heads · step 10
- **Offline example.** `ml-kv-cache-decode`

## Figure 50

A head mixes its values using the corresponding normalized weights.

- **Kinds.** `transformation` · `tensor`
- **Elements.** Matching keys and value positions, the same weights, and the output vector for that head.
- **Sequence.** Illustrated GPT-2 · Cached inference and multiple heads · step 11
- **Existing reference.** `ml-transformer-weighted-values`

## Figure 51

Concatenation places the individual head outputs end to end without averaging them.

- **Kinds.** `transformation` · `tensor`
- **Elements.** Distinct head outputs, their stable order, and an output width equal to the sum of head widths.
- **Sequence.** Illustrated GPT-2 · Cached inference and multiple heads · step 12
- **Existing reference.** `ml-transformer-parallel-attention-heads`

## Figure 52

The attention output projection learns how to combine coordinates from the joined heads.

- **Kinds.** `transformation` · `tensor`
- **Elements.** Concatenated input, learned output weights, and one resulting vector per position.
- **Sequence.** Illustrated GPT-2 · Cached inference and multiple heads · step 13
- **Existing reference.** `ml-transformer-parallel-attention-heads`

## Figure 53

The projected attention result restores the width expected by the residual stream.

- **Kinds.** `transformation` · `block-stack`
- **Elements.** Joined head widths, projection, compatible stream width, and the ensuing feed-forward sublayer.
- **Sequence.** Illustrated GPT-2 · Cached inference and multiple heads · step 14
- **Existing reference.** `ml-transformer-parallel-attention-heads`

## Figure 54

The first feed-forward projection expands a token's feature vector before the activation.

- **Kinds.** `block-stack` · `tensor`
- **Elements.** One position, small input and larger hidden shapes, a learned linear map, and a pointwise activation.
- **Sequence.** Illustrated GPT-2 · Feed-forward computation and parameters · step 1

## Figure 55

The second feed-forward projection returns the intermediate features to the model width.

- **Kinds.** `block-stack` · `tensor`
- **Elements.** Activated hidden vector, output weights, original stream width, and a residual-compatible result.
- **Sequence.** Illustrated GPT-2 · Feed-forward computation and parameters · step 2

## Figure 56

A GPT-2 block uses separate learned matrices for attention and the positionwise feed-forward network.

- **Kinds.** `block-stack` · `matrix`
- **Elements.** A joint query/key/value projection, an attention output projection, two feed-forward projections, and shape labels reflecting their distinct jobs.
- **Sequence.** Illustrated GPT-2 · Feed-forward computation and parameters · step 3

## Figure 57

Token and position embeddings are model-level tables used before the block stack.

- **Kinds.** `relationship` · `matrix`
- **Elements.** Two lookup tables outside the repeated layer group and one combined vector feeding the stack.
- **Sequence.** Illustrated GPT-2 · Feed-forward computation and parameters · step 4

## Figure 58

A model's total parameter count sums the sizes of lookup tables and the independently learned matrices in each layer.

- **Kinds.** `waterfall` · `matrix`
- **Elements.** A consistently sized toy model, separate table and block terms, repeat count and independently checked total.
- **Sequence.** Illustrated GPT-2 · Feed-forward computation and parameters · step 5

## Figure 59

A decoder-only model can learn translation by reading source and target in one delimited sequence.

- **Kinds.** `flow` · `transformation`
- **Elements.** Independent source phrase, separator, target prefix and next-token training, with source kept visible to the decoder.
- **Sequence.** Illustrated GPT-2 · Applying decoder-only models · step 1

## Figure 60

A document and its lead summary can provide a paired example for supervised summarization.

- **Kinds.** `sample-set` · `transformation`
- **Elements.** A short independently written summary and body, separate source and target fields, and a clear boundary before model input formatting.
- **Sequence.** Illustrated GPT-2 · Applying decoder-only models · step 2
- **Phase 02.** [01](../briefs/01-what-is-machine-learning.md)

## Figure 61

A decoder can generate a summary after a prompt containing the document and a delimiter.

- **Kinds.** `timeline` · `transformation`
- **Elements.** A synthetic document prefix, summary boundary, and incremental generation of an original short summary.
- **Sequence.** Illustrated GPT-2 · Applying decoder-only models · step 3

## Figure 62

Music can be tokenized into a vocabulary that encodes changes in pitch, timing and loudness.

- **Kinds.** `matrix` · `timeline`
- **Elements.** New event IDs grouped by note onset, note release, velocity and elapsed time, with the fact that an event can change timing without adding a note.
- **Sequence.** Illustrated GPT-2 · Applying decoder-only models · step 4
- **Phase 02.** [08](../briefs/08-feature-engineering.md) · [15](../briefs/15-time-series.md)

## Figure 63

Note onset, elapsed time and note release events reconstruct a performed phrase with overlapping notes.

- **Kinds.** `coordinate-plot` · `timeline`
- **Elements.** A new phrase with a few pitch-duration segments, matching event order and cumulative time, and unambiguous simultaneous note changes.
- **Sequence.** Illustrated GPT-2 · Applying decoder-only models · step 5
- **Phase 02.** [08](../briefs/08-feature-engineering.md) · [15](../briefs/15-time-series.md)

## Figure 64

Each musical event maps to an index in a shared vocabulary before it enters the Transformer.

- **Kinds.** `block-stack` · `tensor`
- **Elements.** A few event tokens in order, fixed event IDs, and one-hot slots that identify an event without assigning geometric similarity.
- **Sequence.** Illustrated GPT-2 · Applying decoder-only models · step 6
- **Phase 02.** [08](../briefs/08-feature-engineering.md)

## Figure 65

A music attention head can give substantial weight to earlier peaks of a repeated pitch contour.

- **Kinds.** Source navigation or incidental visual.
- **Elements.** A new pitch-over-time phrase with recurring peaks, one later query at a peak, and head-labelled weighted links anchored to earlier notes at their actual times and pitches.
- **Sequence.** Illustrated GPT-2 · Applying decoder-only models · step 7
- **Phase 02.** [15](../briefs/15-time-series.md)
- **Missing kind.** Weighted links would need to attach to event positions on a time and pitch plot.
