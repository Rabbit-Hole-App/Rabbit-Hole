# Prompts selecting a new C11 reference

These 35 prompt and reference pairs selected the listed reference at Brief, Balanced, and Detailed.

## `ml-language-generation-vocabulary-score-probabilities`

- A learned projection produces one score for each vocabulary entry and softmax turns those scores into next-token probabilities.
- The output layer projects a hidden vector to one score per token in the vocabulary.
- Compute tied vocabulary head scores from the given hidden state and table.
- Keep candidate logit probability slots aligned with the input lookup rows.
- Show the numeric operands behind tied vocabulary head scores.
- Add the same score offset to candidate logit probability slots and renormalize.
- Why are tied vocabulary head scores different from attention scores over positions?

## `ml-language-generation-key-value-cache`

- The cache keeps a layer's earlier keys and values for future token queries.
- A decoder head uses stored earlier keys as well as the newly computed key when scoring context.
- Show layer cache row origins for old and current positions.
- Normalize attention for the current query cached positions only.
- Keep K and V coordinates attached to their layer cache row origins.
- Append one pair and recompute current query cached positions.
- Compare layer cache row origins with full-prefix reprojection on the same inputs.

## `ml-language-generation-greedy-versus-sampling`

- Greedy selection and sampling can choose different next tokens from the same distribution.
- Compare same distribution selection rules without changing the probabilities.
- Show the greedy maximum sampled draw choosing different tokens.
- Locate a labelled draw in all intervals of the same distribution selection rules.
- Move only the draw while keeping the greedy maximum sampled draw comparison fixed.
- Explain why same distribution selection rules do not rank sample quality.

## `ml-language-generation-autoregressive-feedback`

- The encoder computes source memory before the decoder begins to predict target tokens.
- Autoregressive generation appends each predicted token to the prefix and repeats until a stop token or limit.
- A causal decoder reveals one predicted token at each successive generation step.
- Generation can begin from a special start condition even with no user text.
- Trace an encode once generation trace through an explicit stop token.
- Show each growing prefix stop event from the actual appended token arrays.
- Distinguish an empty start from a supplied prompt in an encode once generation trace.
- Keep source memory fixed while comparing the growing prefix stop event with a token limit.
- Show the emitted token and exact next-call prefix in an encode once generation trace.

## `ml-music-tokenization-music-events-and-time`

- Note onset, elapsed time and note release events reconstruct a performed phrase with overlapping notes.
- Trace music event clock reconstruction from ids to overlapping notes.
- Which simultaneous note changes occur at the same accumulated clock?
- Keep every wait in music event clock reconstruction.
- Swap the two distinct-pitch simultaneous note changes and recompute intervals.
- Match music event clock reconstruction to every onset and release.
