# Prompts selecting a new C06 reference

These 28 prompt and reference pairs selected the listed reference at Brief, Balanced, and Detailed.

## `ml-language-training-vocabulary-target-slots`

- The output vocabulary defines a fixed ordering of slots in the prediction vector.
- A one-hot target identifies the observed next token by marking only its vocabulary slot.
- How do indexed output slots keep the stop entry identifiable?
- Show the observed token indicator for bring in a fixed vocabulary.
- Change an observed token indicator while preserving indexed output slots.
- Which indexed output slots are active for the observed stop target?
- Explain an observed token indicator without changing vocabulary order.

## `ml-language-training-target-probability-and-loss`

- Training compares the model's next-token distribution with the observed target token.
- Assigning greater probability to observed next tokens reduces their cross-entropy loss.
- Show paired token distributions with the same observed bring target.
- How do illustrative distribution losses change after the target logit rises?
- Compare full paired token distributions against the fixed one-hot target.
- Compute illustrative distribution losses before rounding their labels.
- Keep vocabulary and true target fixed in paired token distributions.

## `ml-language-training-prefix-target-alignment`

- A target sentence supplies a different next-token label at each prefix position during training.
- A next-token training example aligns each prefix with its immediate continuation.
- A causal language model learns by predicting each next token from earlier tokens.
- Show observed prefix labels including the final stop target.
- Which training continuation rows change after a later observed token is edited?
- Explain observed prefix labels without generated-token feedback.
- Align overlapping training continuation rows from one sentence.
- Keep pretraining token targets separate from class labels in observed prefix labels.

## `ml-summarization-supervised-summary-pair`

- A document and its lead summary can provide a paired example for supervised summarization.
- Show raw summarization pairs before adding a task marker.
- Keep source bodies attached to supplied leads in body lead supervision.
- Reorder raw summarization pairs without swapping their target summaries.
- Which fields are supplied in body lead supervision?
- Show body lead supervision without claiming generated summaries.
