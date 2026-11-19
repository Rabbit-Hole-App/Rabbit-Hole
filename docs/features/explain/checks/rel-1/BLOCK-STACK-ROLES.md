# Block stacks: what a block draws with and without a `role` (read-only answer, 2026-11-19)

The lead read this on release 166's tree (ab40f5dc9); no change made. Script: C:/s/gen1-prep/blockstack-roles.mjs (library walk).

## What an unroled block draws
`paintBlock(shape, role)` (block-stack-layout.js:33) returns the plain `box(x, top, width, height)` when the block has no role. `box()` (primitives.js:224) defaults to role 'plain' and `PALETTE['plain']` does not exist, so the fill is 'none': a transparent rectangle, the card ground shows through, with the ink outline (1.5 px). So an unroled block has NO colour. (Inside a block's child flow, an unroled step is drawn as 'process', i.e. blue: block-stack-layout.js:46.)

## Fill of each role (STACK_PAINT, block-stack-layout.js:24-31; the fills are palette A's)
| role | fill | outline |
|---|---|---|
| norm | none (transparent: outline only, by design) | outline 1.5 |
| attention | blue #8DBFEF (palette 'process') | outline 1.5 |
| feedforward | mustard #E5AA46 (palette 'decision') | outline 1.5 |
| embedding | teal #67B9A0 (palette 'outcome') | outline 1.5 |
| output | teal #67B9A0 | outline 2.5 (heavier) |
| changed | blue #8DBFEF | blue stroke 3 (the highlight) |
The role enum is at block-stack-spec.js:3: norm, attention, feedforward, embedding, output, changed: transformer words.

## Library count (39 references hold a block-stack; 112 distinct block-stack specs counting depth variants)
- No block of any spec has a role: 7 references: ml-transformer-token-embeddings, ml-transformer-weighted-values, ml-architecture-hybrid-routing, ml-what-is-machine-learning-dataset-split, ml-linear-regression-linear-unit, ml-neural-networks-hidden-layer, ml-regularization-regularized-objective. These draw uncoloured blocks. Four of them are not transformer subjects (dataset split, linear unit, hidden layer, regularized objective).
- Some blocks roled, others not: 5 references: ml-dense-vs-moe-architecture (only `changed`), ml-gemma-decoder-stack, ml-transformer-vocabulary-softmax (only `output`), d2l-cnn-shape-through-classifier (only `output`), figure-vocabulary-interface-width.
- Every block has a role: 27 references.
So an unroled or `norm` block is transparent in 12 references' pictures (7 entirely, 5 in part). The role names do not fit other subjects (a dataset split has no attention or feedforward); a default fill for an unroled block (for example palette 'process', as an unroled step in a child flow already gets) would colour all 7 uncoloured references without a schema change; `norm` stays transparent on purpose.
