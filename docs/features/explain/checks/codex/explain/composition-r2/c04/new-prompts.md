# Prompts selecting a new C04 reference

These 19 prompt and reference pairs selected the listed reference at Brief, Balanced, and Detailed.

## `ml-bert-supervised-class-pairs`

- Supervised task adaptation needs examples paired with their correct classes.
- Show adaptation message pairs with supplied Request and Notice classes.
- How does text class supervision attach targets to messages?
- Reorder adaptation message pairs without changing their classes.
- Explain text class supervision without showing model guesses.
- Keep the input and class attached in adaptation message pairs.

## `ml-bert-summary-token-readout`

- A classifier can read the contextual output at the designated summary token.
- A classification head converts one contextual vector into scores for the task classes.
- Show summary row projection from contextual states to class scores.
- How are contextual readout scores computed from a selected CLS row?
- Keep the CLS row fixed while checking summary row projection.
- Explain contextual readout scores without calling logits probabilities.
- Why can summary row projection leave other contextual output rows unused?

## `ml-transfer-learning-modality-feature-classifier`

- A visual backbone can pass a learned vector to a classifier just as a text encoder does.
- Compare the modality classifier pattern for a note and an image.
- Show a feature extractor analogy without merging the feature spaces.
- How does the modality classifier pattern keep separate task heads?
- Explain a feature extractor analogy with different feature widths.
- Keep vision and text parameters separate in the modality classifier pattern.
