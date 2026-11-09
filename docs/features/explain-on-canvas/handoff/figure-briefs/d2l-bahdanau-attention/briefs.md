# 11.4. The Bahdanau Attention Mechanism figure briefs

10 figure occurrences in document order. [Source page](https://d2l.ai/chapter_attention-mechanisms-and-transformers/bahdanau-attention.html) · [Inventory](manifest.json)

## Figure 01

An encoder–decoder without attention has one fixed summary of the source for every decoder step.

- **Kinds.** `relationship`
- **Elements.** A new short source and target example, encoder states feeding one context bottleneck, and multiple decoder steps using that same context.
- **Sequence.** Bahdanau attention 1/4. Establish the fixed-summary baseline

## Figure 02

The decoder can retrieve a different context at each step by querying the encoder states with its previous state.

- **Kinds.** `relationship` · `token-links`
- **Elements.** Two target steps, separate attention distributions over an invented source and weighted context entering each next recurrent update.
- **Sequence.** Bahdanau attention 2/4. Change the context as the target evolves

## Figure 03

Training loss can keep falling after an attention-equipped model stops improving on held-out examples.

- **Kinds.** `coordinate-plot`
- **Elements.** Invent train and validation loss traces that improve together early but diverge later. Mark the validation minimum and show that a lower training loss need not improve translation on held-out examples.
- **Sequence.** Bahdanau attention 3/4. Read the training trace. Implementation rendering 1/4
- **Phase 02.** [09](../briefs/09-model-evaluation.md) · [10](../briefs/10-bias-variance.md)

## Figure 04

Training loss can keep falling after an attention-equipped model stops improving on held-out examples.

- **Kinds.** `coordinate-plot`
- **Elements.** Invent train and validation loss traces that improve together early but diverge later. Mark the validation minimum and show that a lower training loss need not improve translation on held-out examples.
- **Sequence.** Bahdanau attention 3/4. Read the training trace. Implementation rendering 2/4
- **Phase 02.** [09](../briefs/09-model-evaluation.md) · [10](../briefs/10-bias-variance.md)

## Figure 05

Training loss can keep falling after an attention-equipped model stops improving on held-out examples.

- **Kinds.** `coordinate-plot`
- **Elements.** Invent train and validation loss traces that improve together early but diverge later. Mark the validation minimum and show that a lower training loss need not improve translation on held-out examples.
- **Sequence.** Bahdanau attention 3/4. Read the training trace. Implementation rendering 3/4
- **Phase 02.** [09](../briefs/09-model-evaluation.md) · [10](../briefs/10-bias-variance.md)

## Figure 06

Training loss can keep falling after an attention-equipped model stops improving on held-out examples.

- **Kinds.** `coordinate-plot`
- **Elements.** Invent train and validation loss traces that improve together early but diverge later. Mark the validation minimum and show that a lower training loss need not improve translation on held-out examples.
- **Sequence.** Bahdanau attention 3/4. Read the training trace. Implementation rendering 4/4
- **Phase 02.** [09](../briefs/09-model-evaluation.md) · [10](../briefs/10-bias-variance.md)

## Figure 07

An alignment grid reveals which source positions are emphasized for successive target tokens.

- **Kinds.** `heatmap`
- **Elements.** Invent a short source/target pair and label both token axes. Normalize every row and vary the strongest source position across target steps.
- **Sequence.** Bahdanau attention 4/4. Inspect an example alignment. Implementation rendering 1/4

## Figure 08

An alignment grid reveals which source positions are emphasized for successive target tokens.

- **Kinds.** `heatmap`
- **Elements.** Invent a short source/target pair and label both token axes. Normalize every row and vary the strongest source position across target steps.
- **Sequence.** Bahdanau attention 4/4. Inspect an example alignment. Implementation rendering 2/4

## Figure 09

An alignment grid reveals which source positions are emphasized for successive target tokens.

- **Kinds.** `heatmap`
- **Elements.** Invent a short source/target pair and label both token axes. Normalize every row and vary the strongest source position across target steps.
- **Sequence.** Bahdanau attention 4/4. Inspect an example alignment. Implementation rendering 3/4

## Figure 10

An alignment grid reveals which source positions are emphasized for successive target tokens.

- **Kinds.** `heatmap`
- **Elements.** Invent a short source/target pair and label both token axes. Normalize every row and vary the strongest source position across target steps.
- **Sequence.** Bahdanau attention 4/4. Inspect an example alignment. Implementation rendering 4/4
