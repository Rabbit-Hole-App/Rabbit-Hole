# Prompts selecting a new C03 reference

Each listed prompt selected this reference at all three depths. The planner can send the context-rules matrix single to the author.

## `ml-transformer-cross-attention-alignment`

- Decoder cross-attention aligns target queries with encoder keys, so the two axes describe different sequences.
- Read target source alignment with the unavailable source padding excluded.
- Show cross attention axes for different translation sequences.
- How does target source alignment produce a weighted source context?
- Keep source keys fixed and broaden target source alignment weights.
- Trace cross attention axes from target query to source values.

## `ml-transformer-context-rules`

- GPT-2, BERT and Transformer-XL repeat different kinds of blocks for different ways of using context.
- Bidirectional and causal attention differ in which keys each query can read.
- Compare architecture context rules for GPT-2, BERT and Transformer-XL.
- How do architecture context rules hide future current words?
- Show prior segment context without revealing future current keys.
- Compare architecture context rules on the same words and focus position.
- What changes when prior segment context is added to a causal decoder?

## `ml-transformer-contextual-layer-states`

- Successive encoder layers consume the prior layer's vector at every position.
- The representation at each token position passes through a succession of GPT-2 decoder blocks.
- An encoder produces a contextual vector for each input position, including special positions.
- Each successive BERT layer updates every token with self-attention and a positionwise network.
- Trace successive contextual states at the same token positions.
- How do position aligned states retain special-token slots?
- Show successive contextual states without confusing them with embedding lookups.
- Do position aligned states keep the same feature width across layers?
- Compare successive contextual states with causal and bidirectional context.

## New prompts routed to existing references

### `ml-transformer-encoder-decoder-memory`

- The encoder prepares source representations that the decoder can consult while producing the target.
- Separate encoder and decoder stacks repeat their layer recipes while keeping learned parameters distinct.
- An encoder–decoder Transformer lets masked target states read encoded source information before producing the next token.
- Translation Transformers pair a source encoder with a target decoder.

### `ml-transformer-original-decoder-sublayers`

- The original decoder repeats the residual-add-and-normalize pattern around all three of its sublayers.
- The translation decoder adds cross-attention to causal self-attention and positionwise processing.

### `ml-transformer-positionwise-feedforward`

- Attention exchanges information across positions while the feed-forward sublayer updates each position separately.
