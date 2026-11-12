# The Illustrated Word2vec figure briefs

61 figure occurrences in document order. [Source page](https://jalammar.github.io/illustrated-word2vec/) · [Inventory](manifest.json)

## Figure 01

A learned embedding table assigns different vectors to different words through the same lookup operation.

- **Kinds.** `transformation`
- **Elements.** Several words, a shared lookup step, and a short strip per word; consistent dimension across all strips.
- **Sequence.** Embedding intuition · step 1

## Figure 02

A profile can be recorded as several independent measurements instead of a single label.

- **Kinds.** `bar-chart`
- **Elements.** Several clearly different traits on a common scale; one person's value per trait.
- **Sequence.** Embedding intuition · step 2

## Figure 03

One trait puts a person at a specific position between two endpoints.

- **Kinds.** `number-line`
- **Elements.** Named ends and one highlighted score on a bounded axis; use that value to fill the first coordinate of a profile.
- **Sequence.** Embedding intuition · step 3

## Figure 04

Changing the units of a score can preserve its meaning and order.

- **Kinds.** `number-line`
- **Elements.** Mark the equivalent position on a centered scale and label the midpoint; explain the original units in the caption.
- **Sequence.** Embedding intuition · step 4
- **Phase 02.** [08](../briefs/08-feature-engineering.md)

## Figure 05

A second trait turns the scalar profile into a point and a direction from the origin.

- **Kinds.** `coordinate-plot`
- **Elements.** Two trait axes and a vector ending at one person's point; distinguish the two coordinates.
- **Sequence.** Embedding intuition · step 5

## Figure 06

Representing two profiles on the same axes lets their directions be compared.

- **Kinds.** `coordinate-plot`
- **Elements.** Shared origin, two trait axes, multiple labeled profile arrows and a direction comparison.
- **Sequence.** Embedding intuition · step 6

## Figure 07

Cosine similarity ranks candidates by how closely their vector directions match the anchor.

- **Kinds.** `matrix`
- **Elements.** One anchor and two candidate vectors; calculate both normalized dot products and mark the higher score.
- **Sequence.** Embedding intuition · step 7
- **Phase 02.** [06](../briefs/06-knn-and-distances.md)

## Figure 08

Adding traits extends a profile vector beyond what two plotted axes show.

- **Kinds.** `matrix`
- **Elements.** Same people with one row per profile; a new column for each added trait; preserve the first coordinates.
- **Sequence.** Embedding intuition · step 8

## Figure 09

Cosine similarity can compare every coordinate even when the vectors cannot be plotted in the plane.

- **Kinds.** `matrix`
- **Elements.** Show a target vector, candidate vectors, and scores from the full dot product and norms.
- **Sequence.** Embedding intuition · step 9
- **Phase 02.** [06](../briefs/06-knn-and-distances.md)

## Figure 10

A list of measured traits can become a numeric vector that supports similarity comparisons.

- **Kinds.** `transformation`
- **Elements.** Original trait values, vector entries in a fixed order, and one example similarity result.
- **Sequence.** Embedding intuition · step 10

## Figure 11

A word embedding is stored as one vector whose individual entries may have no human names.

- **Kinds.** `tensor`
- **Elements.** One word and a few example entries with the full dimension declared separately.
- **Sequence.** Word vectors · step 1
- **Phase 02.** [08](../briefs/08-feature-engineering.md)

## Figure 12

A signed color scale makes the magnitude and sign of vector entries easy to scan.

- **Kinds.** `heatmap`
- **Elements.** One short vector with a centered color scale; positive, near-zero and negative cells.
- **Sequence.** Word vectors · step 2
- **Phase 02.** [08](../briefs/08-feature-engineering.md)

## Figure 13

Comparable word vectors share a coordinate order, so patterns can be compared cell by cell.

- **Kinds.** `heatmap`
- **Elements.** Rows for multiple related terms, aligned feature columns and one shared signed scale.
- **Sequence.** Word vectors · step 3

## Figure 14

Scanning the same columns across rows can reveal both matching and differing coordinates.

- **Kinds.** `heatmap`
- **Elements.** Use a separate semantic group, fixed column order, and highlight at least one similarity and one difference.
- **Sequence.** Word vectors · step 4

## Figure 15

A vector analogy is answered by retrieving a real vocabulary entry near a calculated direction.

- **Kinds.** `matrix`
- **Elements.** Provide two word offsets, the combined query vector, and a ranked list of candidate vocabulary matches.
- **Sequence.** Word vectors · step 5
- **Phase 02.** [06](../briefs/06-knn-and-distances.md)

## Figure 16

Adding and subtracting word vectors yields a nearby search point rather than an exact dictionary vector.

- **Kinds.** `transformation`
- **Elements.** Show operands and computed vector with independently chosen values; compare to the nearest candidate and retain their numerical difference.
- **Sequence.** Word vectors · step 6

## Figure 17

A keyboard's completions illustrate ranked guesses for what may follow a typed prefix.

- **Kinds.** `bar-chart`
- **Elements.** Show the same prefix above several next-token candidates and highlight the largest score.
- **Sequence.** Predicting text · step 1

## Figure 18

The tokens that are already present supply evidence while the next position is still unknown.

- **Kinds.** `sample-set`
- **Elements.** A short prefix, a visibly unfilled next slot, and multiple candidates kept separate from the input.
- **Sequence.** Predicting text · step 2

## Figure 19

A next-word model maps observed context to a forecast for the following position.

- **Kinds.** `flow`
- **Elements.** Use a short context, a prediction step and an output slot; do not put the answer in the input.
- **Sequence.** Predicting text · step 3

## Figure 20

The model predicts a distribution over vocabulary items before a word is selected.

- **Kinds.** `bar-chart`
- **Elements.** A small vocabulary with one nonnegative probability per item, normalized to one.
- **Sequence.** Predicting text · step 4
- **Phase 02.** [03](../briefs/03-logistic-regression.md)
- **Existing reference.** `ml-transformer-vocabulary-softmax`

## Figure 21

A basic neural language model looks up context vectors, processes them, and scores vocabulary items.

- **Kinds.** `block-stack`
- **Elements.** Inputs, embedding lookup, prediction layers and a score vector arranged in computation order.
- **Sequence.** Predicting text · step 5

## Figure 22

An embedding lookup replaces each word ID with the vector in its corresponding table row.

- **Kinds.** `transformation`
- **Elements.** One context ID matched to its table row and output vector; keep neighboring words distinct.
- **Sequence.** Predicting text · step 6
- **Phase 02.** [08](../briefs/08-feature-engineering.md)
- **Existing reference.** `ml-transformer-token-embeddings`

## Figure 23

A sliding context window creates supervised examples from ordinary text.

- **Kinds.** `sample-set`
- **Elements.** A token stream, adjacent visible context slots and a held-out next word marked as the label.
- **Sequence.** Creating training rows · step 1
- **Phase 02.** [01](../briefs/01-what-is-machine-learning.md)

## Figure 24

The initial sliding window identifies a context and target before either is written to the dataset.

- **Kinds.** `sample-set`
- **Elements.** Display the initial short window, separate feature and target roles, and a blank output row.
- **Sequence.** Creating training rows · step 2

## Figure 25

Writing the first window to the dataset creates one supervised training row.

- **Kinds.** `sample-set`
- **Elements.** Show its selected input tokens and target in their own columns; the rest of the sentence stays out of the row.
- **Sequence.** Creating training rows · step 3

## Figure 26

After a shift, the next example shares some of the preceding context.

- **Kinds.** `sample-set`
- **Elements.** Two successive window positions on the same token IDs; show the new target and overlapping context.
- **Sequence.** Creating training rows · step 4

## Figure 27

Collecting the windows yields a table of context features and target words.

- **Kinds.** `matrix`
- **Elements.** Rows extracted from one sentence, fixed context width and a separate target column.
- **Sequence.** Creating training rows · step 5
- **Phase 02.** [01](../briefs/01-what-is-machine-learning.md)

## Figure 28

Earlier words can make a missing word plausible without uniquely determining it.

- **Kinds.** `sample-set`
- **Elements.** An original short context and a blank with competing completions; keep the unknown slot separate.
- **Sequence.** Creating training rows · step 6

## Figure 29

Evidence after a blank can make an otherwise ambiguous completion easier to infer.

- **Kinds.** `sample-set`
- **Elements.** Keep the same blank and earlier context, reveal a following clue, and explain which completions it makes more plausible.
- **Sequence.** Creating training rows · step 7

## Figure 30

A context-prediction task can use neighbors on both sides of a hidden word.

- **Kinds.** `sample-set`
- **Elements.** A centered unknown token with left and right context visibly separate.
- **Sequence.** Context windows and skip-gram · step 1

## Figure 31

Continuous bag-of-words examples group surrounding words into the input for each center target.

- **Kinds.** `matrix`
- **Elements.** Use several center positions from one sentence and keep the grouped features distinct from the target column.
- **Sequence.** Context windows and skip-gram · step 2

## Figure 32

Skip-gram reverses the prediction direction by using one center word to predict its neighbors.

- **Kinds.** `sample-set`
- **Elements.** One center token and several nearby target tokens; indicate direction from center to each neighbor.
- **Sequence.** Context windows and skip-gram · step 3

## Figure 33

Each neighbor yields a separate positive training pair for the same center.

- **Kinds.** `relationship`
- **Elements.** One center node, labeled links to separate target entries and a note that these are distinct rows.
- **Sequence.** Context windows and skip-gram · step 4

## Figure 34

The first skip-gram window assigns the center and neighbor roles before any pair rows have been written.

- **Kinds.** `sample-set`
- **Elements.** One highlighted center and distinct nearby targets within the window, with an empty output row.
- **Sequence.** Context windows and skip-gram · step 5

## Figure 35

A single window expands into several center-to-neighbor rows.

- **Kinds.** `matrix`
- **Elements.** Repeated center ID, one different neighbor per row, and no concatenation into one joint target.
- **Sequence.** Context windows and skip-gram · step 6

## Figure 36

Moving the window changes which words are eligible neighbors.

- **Kinds.** `sample-set`
- **Elements.** Same token IDs after a shift, with outgoing and newly included neighbors made visible.
- **Sequence.** Context windows and skip-gram · step 7

## Figure 37

The shifted center contributes a new batch of pairs without invalidating earlier rows.

- **Kinds.** `matrix`
- **Elements.** One group for the previous center and another for the new center; retain row identities.
- **Sequence.** Context windows and skip-gram · step 8

## Figure 38

Applying the pairing rule across a corpus accumulates a dataset with repeated words and pairs.

- **Kinds.** `matrix`
- **Elements.** Show pairs from several positions and note that repeated occurrences are meaningful training examples.
- **Sequence.** Context windows and skip-gram · step 9

## Figure 39

The model learns from the input and observed neighbor recorded in each skip-gram row.

- **Kinds.** `matrix`
- **Elements.** Center feature, context target and row selector leading to one worked update.
- **Sequence.** Learning from predictions · step 1
- **Phase 02.** [01](../briefs/01-what-is-machine-learning.md)

## Figure 40

Before learning, the model can score many possible context words for one center.

- **Kinds.** `bar-chart`
- **Elements.** One center and a toy vocabulary of unequal initial scores, with the observed neighbor highlighted.
- **Sequence.** Learning from predictions · step 2

## Figure 41

A one-hot target represents the observed word as one positive entry in an aligned vocabulary.

- **Kinds.** `tensor`
- **Elements.** Fixed vocabulary order and exactly one active target cell.
- **Sequence.** Learning from predictions · step 3

## Figure 42

Prediction and target vectors can be compared coordinate by coordinate to obtain a learning signal.

- **Kinds.** `transformation`
- **Elements.** Show aligned probability and target entries, and the signed difference for one or more coordinates.
- **Sequence.** Learning from predictions · step 4

## Figure 43

An error-driven update improves future predictions by changing trainable parameters.

- **Kinds.** `cycle`
- **Elements.** Predict, compare, update, repeat; one adjustable embedding row and its later score.
- **Sequence.** Learning from predictions · step 5

## Figure 44

Scoring a whole vocabulary for every training pair makes the output layer expensive.

- **Kinds.** `block-stack`
- **Elements.** Compare the small input vector with a large output dimension and indicate work that scales with vocabulary.
- **Sequence.** Negative sampling · step 1

## Figure 45

Predicting a neighbor from the center alone requires choosing from the vocabulary.

- **Kinds.** `flow`
- **Elements.** Keep the center as the only input, score many alternatives, and show one resulting candidate; prepare the comparison with a pair classifier.
- **Sequence.** Negative sampling · step 2

## Figure 46

A pair classifier assigns one score to a proposed center and neighbor.

- **Kinds.** `flow`
- **Elements.** Look up the two words, compare their vectors and predict whether the pair belongs together.
- **Sequence.** Negative sampling · step 3
- **Phase 02.** [03](../briefs/03-logistic-regression.md)

## Figure 47

The binary objective changes the dataset from one target word to a pair plus a label.

- **Kinds.** `matrix`
- **Elements.** Show center column, candidate column and positive or negative label; keep input and output roles distinct.
- **Sequence.** Negative sampling · step 4
- **Phase 02.** [01](../briefs/01-what-is-machine-learning.md)

## Figure 48

If every training pair is positive, a constant affirmative answer can appear perfect while learning no contrast.

- **Kinds.** `matrix`
- **Elements.** Positive-only rows, constant predicted labels and a missing counterexample; distinguish measured accuracy from usefulness.
- **Sequence.** Negative sampling · step 5
- **Phase 02.** [09](../briefs/09-model-evaluation.md) · [17](../briefs/17-imbalanced-data.md)

## Figure 49

Adding negative rows means the pair classifier must learn to tell a true neighbor from an unrelated candidate.

- **Kinds.** `matrix`
- **Elements.** Reserve several negative rows next to genuine context pairs and hold the center fixed; fill the candidates in the next step.
- **Sequence.** Negative sampling · step 6
- **Phase 02.** [17](../briefs/17-imbalanced-data.md)

## Figure 50

Sampled negatives come from the vocabulary, so they need not represent adjacent words in the sentence.

- **Kinds.** `matrix`
- **Elements.** Show eligible candidates and independently labeled pair rows with no adjacency claim.
- **Sequence.** Negative sampling · step 7

## Figure 51

Skip-gram with negative sampling combines sliding-window positive pairs with contrasting sampled pairs.

- **Kinds.** `flow`
- **Elements.** Collect context pairs, draw candidate negatives, assemble binary examples and train the pair scorer.
- **Sequence.** Negative sampling · step 8

## Figure 52

Training uses separate lookup tables for words when they act as centers and when they act as contexts.

- **Kinds.** `matrix`
- **Elements.** Two named tables with matching vocabulary IDs but different trainable entries; show selected rows.
- **Sequence.** Updating embedding tables · step 1

## Figure 53

One update starts from a center paired with a genuine context word and sampled alternatives.

- **Kinds.** `sample-set`
- **Elements.** One center, its positive pair and separately labeled negative pairs; preserve identities for later steps.
- **Sequence.** Updating embedding tables · step 2

## Figure 54

Each pair retrieves its input and context vectors before scoring.

- **Kinds.** `transformation`
- **Elements.** Select one center row and several context rows with a fixed vector dimension; leave other rows unselected.
- **Sequence.** Updating embedding tables · step 3

## Figure 55

Each dot product reduces two vectors to a single compatibility score.

- **Kinds.** `matrix`
- **Elements.** One center strip, short context strips and correctly recomputed dot-product outputs.
- **Sequence.** Updating embedding tables · step 4

## Figure 56

A sigmoid converts a pair's real-valued compatibility score to a number between zero and one.

- **Kinds.** `coordinate-plot`
- **Elements.** Mark example negative, zero and positive inputs; show sigmoid output approaching both bounds.
- **Sequence.** Updating embedding tables · step 5
- **Phase 02.** [03](../briefs/03-logistic-regression.md)
- **Existing reference.** `sigmoid-threshold`

## Figure 57

Positive and negative labels determine the direction of each pair's score error.

- **Kinds.** `transformation`
- **Elements.** Compare observed binary labels with probabilities in the same order; display the signed label-minus-prediction values.
- **Sequence.** Updating embedding tables · step 6
- **Phase 02.** [03](../briefs/03-logistic-regression.md)

## Figure 58

The update changes the selected center and context rows according to the prediction errors.

- **Kinds.** `transformation`
- **Elements.** Before and after rows from both tables, small original gradients and explicit changed entries; unchanged vocabulary rows stay fixed.
- **Sequence.** Updating embedding tables · step 7

## Figure 59

After one update, the learner moves on to a fresh group of candidate pairs.

- **Kinds.** `matrix`
- **Elements.** Mark the completed group and the newly selected group for the same center, with a different positive target and independently sampled negatives.
- **Sequence.** Updating embedding tables · step 8

## Figure 60

A larger window includes more distant words, changing which positive contexts the model sees.

- **Kinds.** `sample-set`
- **Elements.** Same center with narrow and wide eligible regions; label the newly added words and explain the local-versus-topical tendency.
- **Sequence.** Choosing the sampling window · step 1

## Figure 61

Increasing the negative-sample count adds comparisons and work per observed pair.

- **Kinds.** `matrix`
- **Elements.** Same positive pair with two sampling budgets; show which additional pair rows are scored and separate this from window size.
- **Sequence.** Choosing the sampling window · step 2
