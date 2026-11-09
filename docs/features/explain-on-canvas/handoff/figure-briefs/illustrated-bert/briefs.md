# The Illustrated BERT, ELMo, and co. figure briefs

27 figure occurrences in document order. [Source page](https://jalammar.github.io/illustrated-bert/) · [Inventory](manifest.json)

## Figure 01

BERT belongs to a line of work that combines reusable language representations with Transformer encoders.

- **Kinds.** `comparison` · `relationship`
- **Elements.** Contrast the Transformer architecture with independently described pretraining approaches, then place BERT among them without inferring performance from chronology.
- **Sequence.** Illustrated BERT · Transfer learning · step 1
- **Phase 02.** [01](../briefs/01-what-is-machine-learning.md)

## Figure 02

BERT pretrains on a large text corpus and then adapts to a specific task.

- **Kinds.** `flow`
- **Elements.** Unlabelled corpus, a self-supervised objective, saved encoder weights, and task-labelled examples used for adaptation.
- **Sequence.** Illustrated BERT · Transfer learning · step 2
- **Phase 02.** [01](../briefs/01-what-is-machine-learning.md) · [13](../briefs/13-ml-pipelines.md)

## Figure 03

A BERT encoder can supply a text representation to a small classifier.

- **Kinds.** `flow` · `block-stack`
- **Elements.** A new sample text, contextual encoder, one document representation, and candidate classes.
- **Sequence.** Illustrated BERT · Transfer learning · step 3
- **Phase 02.** [01](../briefs/01-what-is-machine-learning.md) · [03](../briefs/03-logistic-regression.md)

## Figure 04

Supervised task adaptation needs examples paired with their correct classes.

- **Kinds.** `sample-set` · `matrix`
- **Elements.** A compact synthetic message table with a short text field and a matching category for each row.
- **Sequence.** Illustrated BERT · Transfer learning · step 4
- **Phase 02.** [01](../briefs/01-what-is-machine-learning.md)

## Figure 05

BERT has base and large configurations that share an encoder design but differ in capacity.

- **Kinds.** `comparison` · `bar-chart`
- **Elements.** Two named configurations, a consistent model size measure and units, and a statement separating capacity from measured task performance.
- **Sequence.** Illustrated BERT · Encoder architecture · step 1

## Figure 06

Deeper BERT configurations repeat the same encoder block type more times.

- **Kinds.** `comparison` · `block-stack`
- **Elements.** Two stacks with repeated encoder recipes, different layer counts, and separate learned parameters per layer.
- **Sequence.** Illustrated BERT · Encoder architecture · step 2

## Figure 07

An encoder produces a contextual vector for each input position, including special positions.

- **Kinds.** `block-stack` · `transformation`
- **Elements.** Token-order input, sequence-start and separator tokens as applicable, and matching output slots.
- **Sequence.** Illustrated BERT · Encoder architecture · step 3

## Figure 08

Each successive BERT layer updates every token with self-attention and a positionwise network.

- **Kinds.** `block-stack` · `relationship`
- **Elements.** Two encoder stages, context exchange across positions, and positionwise processing within each stage.
- **Sequence.** Illustrated BERT · Encoder architecture · step 4
- **Existing reference.** `ml-transformer-encoder-stack`

## Figure 09

A classifier can read the contextual output at the designated summary token.

- **Kinds.** `transformation` · `tensor`
- **Elements.** All token positions, the summary position marked, and the vector selected from that position.
- **Sequence.** Illustrated BERT · Encoder architecture · step 5
- **Phase 02.** [01](../briefs/01-what-is-machine-learning.md)

## Figure 10

A classification head converts one contextual vector into scores for the task classes.

- **Kinds.** `transformation` · `bar-chart`
- **Elements.** Selected summary vector, learned linear classifier, sample class scores, and their interpretation.
- **Sequence.** Illustrated BERT · Encoder architecture · step 6
- **Phase 02.** [03](../briefs/03-logistic-regression.md)

## Figure 11

A visual backbone can pass a learned vector to a classifier just as a text encoder does.

- **Kinds.** `comparison` · `flow`
- **Elements.** Two modalities, their distinct feature extractors, and one feature-vector-to-classifier pattern.
- **Sequence.** Illustrated BERT · Encoder architecture · step 7
- **Phase 02.** [01](../briefs/01-what-is-machine-learning.md) · [08](../briefs/08-feature-engineering.md)

## Figure 12

A static word embedding is a list of learned real-valued features.

- **Kinds.** `tensor`
- **Elements.** One new word, a few invented vector entries, and the fact that the complete vector can be wider.
- **Sequence.** Illustrated BERT · From static to contextual embeddings · step 1
- **Phase 02.** [08](../briefs/08-feature-engineering.md)

## Figure 13

A vector strip can stand for all the coordinates of a word representation.

- **Kinds.** `tensor`
- **Elements.** A compact set of cells and a dimension annotation separating displayed entries from full width.
- **Sequence.** Illustrated BERT · From static to contextual embeddings · step 2
- **Phase 02.** [08](../briefs/08-feature-engineering.md)

## Figure 14

The same surface word can have different contextual representations in sentences that mean different things.

- **Kinds.** `comparison` · `block-stack`
- **Elements.** An independently chosen ambiguous word in two short contexts, its two contextual vector strips, and one cue distinguishing the contexts.
- **Sequence.** Illustrated BERT · From static to contextual embeddings · step 3
- **Phase 02.** [08](../briefs/08-feature-engineering.md)

## Figure 15

ELMo maps a whole sentence to a sequence of contextual vectors with one vector aligned to each token.

- **Kinds.** `transformation` · `block-stack`
- **Elements.** An independently chosen sentence in token order, contextual processing, and a matching output position for each input token.
- **Sequence.** Illustrated BERT · From static to contextual embeddings · step 4
- **Phase 02.** [08](../briefs/08-feature-engineering.md)

## Figure 16

A next-token objective can teach a recurrent text model useful internal representations.

- **Kinds.** `flow` · `sequence`
- **Elements.** A prefix, recurrent state per token, expected next token, and a prediction target.
- **Sequence.** Illustrated BERT · From static to contextual embeddings · step 5
- **Phase 02.** [01](../briefs/01-what-is-machine-learning.md) · [15](../briefs/15-time-series.md)

## Figure 17

Forward and backward language models supply complementary context states at the same token position.

- **Kinds.** `sequence` · `relationship`
- **Elements.** Aligned sentence positions, independent left-to-right and right-to-left state streams, and a selected token's two states.
- **Sequence.** Illustrated BERT · From static to contextual embeddings · step 6

## Figure 18

ELMo concatenates the forward and backward states at each depth and combines the layer representations with task-specific weights.

- **Kinds.** `block-stack` · `transformation`
- **Elements.** Base embedding, paired directional states concatenated by depth, compatible layer-vector widths, and a weighted componentwise sum.
- **Sequence.** Illustrated BERT · From static to contextual embeddings · step 7
- **Phase 02.** [08](../briefs/08-feature-engineering.md)

## Figure 19

A decoder-only language model can pretrain without the source-reading stack used for translation.

- **Kinds.** `block-stack`
- **Elements.** An input embedding path, repeated causal decoder blocks, and a vocabulary output.
- **Sequence.** Illustrated BERT · Decoder pretraining and task adaptation · step 1

## Figure 20

A causal language model learns by predicting each next token from earlier tokens.

- **Kinds.** `matrix` · `flow`
- **Elements.** A few prefixes, the corresponding observed continuations, and a separation between pretraining targets and downstream task labels.
- **Sequence.** Illustrated BERT · Decoder pretraining and task adaptation · step 2
- **Phase 02.** [01](../briefs/01-what-is-machine-learning.md) · [15](../briefs/15-time-series.md)

## Figure 21

A pretrained decoder representation can be adapted to a labelled classification task.

- **Kinds.** `flow`
- **Elements.** Pretrained weights, task examples, one selected sequence representation and a trainable head.
- **Sequence.** Illustrated BERT · Decoder pretraining and task adaptation · step 3
- **Phase 02.** [01](../briefs/01-what-is-machine-learning.md) · [13](../briefs/13-ml-pipelines.md)

## Figure 22

The original GPT wraps different task inputs in token sequences that share one pretrained decoder.

- **Kinds.** `transformation` · `comparison`
- **Elements.** A single text and a sentence pair with markers, reversed orderings combined for similarity, and one encoded sequence per multiple-choice candidate.
- **Sequence.** Illustrated BERT · Decoder pretraining and task adaptation · step 4
- **Phase 02.** [08](../briefs/08-feature-engineering.md) · [13](../briefs/13-ml-pipelines.md)

## Figure 23

Masked language modelling recovers a selected missing token from the rest of a bidirectional context.

- **Kinds.** `token-links` · `flow`
- **Elements.** A new sentence with one hidden position, allowed cues on each side, and the observed token as its target.
- **Sequence.** Illustrated BERT · BERT objectives and uses · step 1
- **Phase 02.** [01](../briefs/01-what-is-machine-learning.md) · [08](../briefs/08-feature-engineering.md)

## Figure 24

The original BERT training setup includes deciding whether a second passage follows a first passage.

- **Kinds.** `comparison` · `flow`
- **Elements.** A true next passage, an unrelated alternative, sequence separators and a binary prediction at the summary position.
- **Sequence.** Illustrated BERT · BERT objectives and uses · step 2
- **Phase 02.** [01](../briefs/01-what-is-machine-learning.md) · [03](../briefs/03-logistic-regression.md)

## Figure 25

Different BERT tasks read different positions in the same encoder outputs or attach different task heads.

- **Kinds.** `relationship` · `matrix`
- **Elements.** Connect document classification to a summary position, tagging to token labels, and extractive question answering to two positions marking an answer span.
- **Sequence.** Illustrated BERT · BERT objectives and uses · step 3
- **Phase 02.** [01](../briefs/01-what-is-machine-learning.md) · [13](../briefs/13-ml-pipelines.md)

## Figure 26

Frozen BERT layers expose multiple contextual features for each token to a separate learner.

- **Kinds.** `flow` · `block-stack`
- **Elements.** An independently chosen text, a frozen encoder, vectors aligned to positions at multiple depths, and a downstream model reading selected features.
- **Sequence.** Illustrated BERT · BERT objectives and uses · step 4
- **Phase 02.** [08](../briefs/08-feature-engineering.md) · [13](../briefs/13-ml-pipelines.md)

## Figure 27

Layer selection and layer combination can change the quality of frozen text features for a downstream task.

- **Kinds.** `matrix` · `bar-chart`
- **Elements.** Distinct layer-pooling choices, the same evaluation setup, and only independently chosen illustrative scores or measured values with provenance.
- **Sequence.** Illustrated BERT · BERT objectives and uses · step 5
- **Phase 02.** [08](../briefs/08-feature-engineering.md) · [09](../briefs/09-model-evaluation.md)
