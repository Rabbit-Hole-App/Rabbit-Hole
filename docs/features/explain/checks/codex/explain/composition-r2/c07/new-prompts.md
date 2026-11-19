# Prompts selecting a new C07 reference

These 76 prompt and reference pairs selected the listed reference at Brief, Balanced, and Detailed.

## `ml-attention-additive-attention`

- Additive attention can compare unlike input widths by projecting queries and keys into the same hidden space.
- Explain additive projection branches using the displayed toy operands.
- Show unlike width matching without changing the example.
- Recompute the implicit probe for additive projection branches.
- Keep row and position identities clear in unlike width matching.
- Trace the actual mechanism for additive projection branches.

## `ml-attention-query-key-value-roles`

- A query uses keys to determine how strongly each associated value contributes to the result.
- Attention converts query-to-key scores into weights and then uses those weights to combine values.
- A query is matched against keys and the associated values are the material returned.
- Explain matching retrieved content using the displayed toy operands.
- Show paired value retrieval without changing the example.
- Recompute the implicit probe for matching retrieved content.
- Keep row and position identities clear in paired value retrieval.
- Trace the actual mechanism for matching retrieved content.

## `ml-attention-connectivity-and-path-length`

- The communication path between distant positions is different in a local convolution, recurrence and global self-attention.
- Explain position communication hops using the displayed toy operands.
- Show local global hops without changing the example.
- Recompute the implicit probe for position communication hops.
- Keep row and position identities clear in local global hops.
- Trace the actual mechanism for position communication hops.

## `ml-attention-causal-mask-and-weights`

- Causal self-attention makes a position depend only on itself and positions to its left.
- Masked attention lets a token collect context from allowed positions inside a single decoder layer.
- Masking future positions leaves their weights at zero without changing how scores for eligible positions are computed.
- Explain masked row normalization using the displayed toy operands.
- Show interior causal query without changing the example.
- Recompute the implicit probe for masked row normalization.
- Keep row and position identities clear in interior causal query.
- Trace the actual mechanism for masked row normalization.

## `ml-attention-packed-query-key-value-projections`

- A token's hidden vector is projected separately into a query, key, and value.
- Packing token vectors into rows computes all query, key, and value rows with three matrix products.
- Each token's hidden representation has separate query, key and value projections.
- GPT-2 computes a separate query, key and value for the current token at every decoder layer.
- A combined learned matrix can project one input into the components for queries, keys, and values.
- The joint projection result is sliced into the separate vectors used by attention.
- Explain packed projection identity using the displayed toy operands.
- Show joint slice boundaries without changing the example.
- Recompute the implicit probe for packed projection identity.
- Keep row and position identities clear in joint slice boundaries.
- Trace the actual mechanism for packed projection identity.

## `ml-attention-query-key-dot-products`

- A query scores each candidate key by multiplying corresponding components and summing them.
- Each query compares with all eligible keys before weights are computed.
- Explain component match products using the displayed toy operands.
- Show unnormalized key sums without changing the example.
- Recompute the implicit probe for component match products.
- Keep row and position identities clear in unnormalized key sums.
- Trace the actual mechanism for component match products.

## `ml-attention-weighted-vector-pooling`

- Attention forms the output for one token by weighting every value vector and adding corresponding entries.
- A weighted sum of values creates the new context for one token position.
- Values contribute to the result in proportion to their attention weights.
- A head mixes its values using the corresponding normalized weights.
- Explain value contribution products using the displayed toy operands.
- Show coordinate weighted pooling without changing the example.
- Recompute the implicit probe for value contribution products.
- Keep row and position identities clear in coordinate weighted pooling.
- Trace the actual mechanism for value contribution products.

## `ml-attention-all-query-attention`

- The same attention calculation processes all query positions by scoring a query-by-key matrix and normalizing each query row before mixing values.
- Repeating the same attention stages for each query gives one contextual vector per position.
- Packing queries and keys lets the model compute every pairwise score in one matrix operation.
- Explain query row normalization using the displayed toy operands.
- Show position aligned outputs without changing the example.
- Recompute the implicit probe for query row normalization.
- Keep row and position identities clear in position aligned outputs.
- Trace the actual mechanism for query row normalization.

## `ml-attention-pooling-kernel-weight-concentration`

- The weight grid reveals whether predictions rely on nearby examples or spread weight over the whole training set.
- A narrower bandwidth concentrates normalized weight nearer each query and a broader one spreads it farther.
- Compare kernel control grids without changing key coordinates.
- How do bandwidth concentration rows differ from a uniform control?
- Show local and uniform kernel control grids on the same keys.
- Keep query normalization fixed in bandwidth concentration rows.
- Compare narrow and broad kernel control grids without an infinite-bandwidth claim.

## `ml-recurrent-attention-decoder-context`

- The decoder can retrieve a different context at each step by querying the encoder states with its previous state.
- Show recurrent context handoff into both decoder updates.
- Trace decoder context recurrence from the actual previous state.
- Why does recurrent context handoff change with the decoder state?
- Keep encoder values fixed during decoder context recurrence.
- Recompute both steps of recurrent context handoff after an initial-state change.
