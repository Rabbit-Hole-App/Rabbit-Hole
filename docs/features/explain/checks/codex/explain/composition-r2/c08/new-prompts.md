# Prompts selecting a new C08 reference

These 31 prompt and reference pairs selected the listed reference at Brief, Balanced, and Detailed.

## `ml-normalization-residual-then-normalize`

- A small numeric example separates adding the residual from normalizing the resulting vector.
- Show computed residual moments after adding a supplied update.
- Normalize residual sums with the declared population variance.
- Keep the supplied update fixed in a computed residual moments shift probe.
- Which mean and variance normalize residual sums?
- Show the unchanged normalized result after shifting inputs in computed residual moments.

## `ml-positional-encoding-token-plus-position`

- Adding a position vector to each token embedding makes order available to attention.
- GPT-2 learns a separate table of position vectors indexed by position.
- A decoder adds the token lookup vector and its position vector before entering the first block.
- Token and position embeddings are model-level tables used before the block stack.
- Show repeated token addition with separate token and position ids.
- Keep model lookup inputs outside the repeated decoder group.
- Which learned rows change repeated token addition at another position?
- Compare named fixed and learned model lookup inputs.
- Change one learned position row in repeated token addition.

## `ml-positional-encoding-sinusoidal-positions`

- Sinusoidal position features give each position a distinct combination of slow and fast coordinates.
- Interleaving each sine channel with its cosine partner keeps the positional signals paired by frequency.
- Show paired position frequencies and their matching selected row.
- Keep numeric values attached during a channel display permutation.
- Compare both sine and cosine in paired position frequencies.
- Why is channel display permutation different from changing the model basis?
- Match all four paired position frequencies at the selected sampled position.

## `ml-embeddings-embedding-table-lookups`

- An embedding lookup selects a single learned row for an input token.
- An embedding lookup replaces each word ID with the vector in its corresponding table row.
- A learned embedding table assigns different vectors to different words through the same lookup operation.
- Each pair retrieves its input and context vectors before scoring.
- Show indexed vector retrieval with stable vocabulary ids.
- Select a center and two context rows from independent lookup tables.
- Why do independent lookup tables give different vectors for the same id?
- Keep selected outputs fixed when unselected rows change in indexed vector retrieval.
- Show several returned strips through shared indexed vector retrieval.
