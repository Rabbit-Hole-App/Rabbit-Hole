# Prompts selecting a new C10 reference

These 38 prompt and reference pairs selected the listed reference at Brief, Balanced, and Detailed.

## `ml-model-capacity-depth-width-allocation`

- Deeper BERT configurations repeat the same encoder block type more times.
- A compact decoder can shrink its layer stack while keeping grouped-query attention and a dense token update.
- Small decoder capacity can be allocated to more narrow layers instead of fewer wide layers.
- Matching depth and attention grouping does not imply matching token-state or feed-forward widths.
- Compare matched recipe depth widths without sharing layers' learned weights.
- Show independent layer stack allocation for two encoder depths.
- How do matched recipe depth widths differ for narrow and wide grouped decoders?
- Hold grouped heads fixed while changing matched recipe depth widths.
- Separate temporary FFN width from token-state width in independent layer stack allocation.

## `ml-model-capacity-capacity-profiles`

- The same model architecture can be trained at substantially different parameter counts.
- Increasing a model's depth and width increases its parameter count.
- BERT has base and large configurations that share an encoder design but differ in capacity.
- Show same recipe parameter magnitudes with the counted scope named.
- Compare depth width count profiles for the declared four toy decoders.
- How does one extra layer change same recipe parameter magnitudes?
- Contrast reported BERT size bars with computed depth width count profiles.
- Which same recipe parameter magnitudes are rounded paper totals?

## `ml-model-capacity-block-parameter-accounting`

- A GPT-2 block uses separate learned matrices for attention and the positionwise feed-forward network.
- A model's total parameter count sums the sizes of lookup tables and the independently learned matrices in each layer.
- Show projection shape accounting for QKV, attention output, expansion and restoration.
- Build the lookup block sum from the declared toy matrix dimensions.
- Why must projection shape accounting include biases and both normalization stages?
- What changes in the lookup block sum when the output table is untied?
- Check the lookup block sum after adding an independent layer.

## `ml-gpt2-task-input-format`

- The original GPT wraps different task inputs in token sequences that share one pretrained decoder.
- A decoder-only model can learn translation by reading source and target in one delimited sequence.
- A decoder can generate a summary after a prompt containing the document and a delimiter.
- Show serialized task wrapper fields for single texts and sentence pairs.
- Compare observed versus chosen prefixes for translation labels and summary choices.
- Serialize both similarity orders and combine their independent readouts.
- Keep each candidate separate in the serialized task wrapper fields.
- Append an illustrative summary token while preserving observed versus chosen prefixes.

## `ml-gpt2-overview-and-expanded-block`

- An architecture overview intentionally leaves out lower-level details like residuals and normalization.
- Open collapsed decoder detail without changing the underlying block recipe.
- Show omitted normalization shortcuts in a pre-LayerNorm GPT-2-style cell.
- Where are the two residual joins hidden by collapsed decoder detail?
- Keep causal full attention distinct from omitted normalization shortcuts.
- Why does opening collapsed decoder detail leave the model definition unchanged?
