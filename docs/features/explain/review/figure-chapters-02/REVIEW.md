# Figure-chapter references, live /explain, review pack figure-chapters-01

Set: scripts/explain-bench/sets/figure-chapters.json (48 prompts, 6 per chapter, seed figure-chapters-2026-11-09). One pass per arm, Balanced (bench depth key standard). Arm R = full reference library; arm 0 = the same code with EXPLANATION_EXCLUDE_FIGURE_CHAPTERS=on (the 212 figure-chapter references removed from the selector pool).
Arm R run: 2026-11-09T134313-figchap02-armr-judged; arm 0 run: 2026-11-09T110933-figchap-arm0-judged2. Structure = judge faithful-ref-v1 (faithful-v2 with the reference spec as the Core), first diagram only; fully is the threshold. Per-card files exist for arm R only: card.md, model-spec.json, model-408.svg, reference-408.svg, reference-spec.json.

Figure-chapters-02: arm R was run once on branch explain/figure-chapters-02 (the 118 guards plus the reference-kind override, a port of d8895b9f7; planner column shows the effective kind, with the planner's original kind where the override fired). The arm 0 column and table are the figure-chapters-01 arm 0 (EXPLANATION_EXCLUDE_FIGURE_CHAPTERS=on, no override, no 118 guards), not rerun. Card 28 failed (required_visual_missing); cards 12 and 27 delivered with no diagram (visual fallback after two invalid specs).

## Per-arm numbers

| metric | arm R | arm 0 |
|---|---|---|
| cards delivered | 47/48 | 48/48 |
| selector hit | 48/48 (100%) | 0/48 (0%) |
| kind match (first diagram = reference kind) | 44/48 (91.7%) | 13/48 (27.1%) |
| planner kind match | 46/47 (97.9%) | 15/47 (31.9%) |
| kind misses: planner wrong / author wrong, planner right / no plan | 0 / 3 / 1 | 31 / 3 / 1 |
| structure (judge faithful-ref-v1): fully / partly / not / none | 41 / 3 / 0 / 4 | 3 / 17 / 26 / 2 |
| structure fully | 41/48 (85.4%) | 3/48 (6.3%) |
| factual error (factual-v2) | 7/47 (14.9%) | 6/47 (12.8%) |
| factual mean score | 4.4 | 4.15 |
| repaired cards | 4 | 8 |
| visual fallback cards | 2 | 1 |
| cards authored by a non-Google provider (model fallback) | 0 | 0 |
| planner routed to picture | 0 | 0 |
| cards with a picture | 1 | 2 |
| latency p50 / p90 (ms) | 3227 / 5210 | 2744 / 4580 |
| mean author input tokens | 4307 | 4444 |
| mean author output tokens | 540 | 492 |
| mean references sent | 2 | 1 |
| generation spend (US$) | 0.1535 | 0.1371 |
| judge spend (US$) | 0.3716 | 0.0037 |

**Card 26 (ml-stable-diffusion-clip-two-encoders) is expected behaviour, not a miss.** The learner named "the picture and caption", so a picture is correct and the picture cap rightly yields to a learner-named mix. The table above counts it as kind miss and structure none; without it, arm R is kind match 44/47 (93.6%), structure fully 41/47 (87.2%), structure none 3 (cards 12, 27, 28).

## Factual, not moved by references

Arm R factual errors: 7/47 (14.9%), against 6/48 (12.5%) in figure-chapters-01 arm R and 6/47 (12.8%) in arm 0. The seven cards (judge factual-v2, score 3 each; the one-line claim is the judge's):

- #12 ml-bert-task-heads (3): says the heads train without modifying the lower encoder weights; standard BERT fine-tuning updates all encoder weights with the head, and only the feature-based approach freezes the encoder.
- #14 ml-gpt2-continue-prefix (3): the diagram calls the step "sample" but describes choosing the highest-scoring token (greedy decoding), so the prose and diagram conflict.
- #18 ml-gpt2-tied-output-weights (3): "prevents severe overfitting on smaller text corpora" is an overclaim; GPT-2 trained on the large WebText corpus and tying is mainly a parameter-saving and regularizing choice (the tying, the parameter saving and the toy softmax values are correct).
- #22 ml-word2vec-signed-embedding-heatmap (3): reading across columns compares dimensions within one word row; comparing related words means reading down a column, as the diagram says, so the prose contradicts it.
- #23 ml-word2vec-trait-rescale (3): conflates centering (shifting) with scaling; shifting alone does not stop large-scale dimensions from dominating, which needs rescaling the variance.
- #31 figure-retro-chunk-attention (3): in RETRO chunked cross-attention all tokens from the last token of a chunk through the next chunk attend to that chunk's retrieved neighbors, not a single final token; the "active" vs "completed" chunk wording is also inconsistent.
- #37 d2l-forecast-feedback-error (3): misleading; flattening of recursive forecasts is typically mean reversion or damping of the model, not error accumulation, and the "refreshed" line is conflated with direct forecasting.

## Cards 12, 27 and 28

- #28 ml-stable-diffusion-image-caption-pairs failed `required_visual_missing`. This is a port artifact: the figure-chapters-02 build ports 118's picture cap but not 118's companion rule (c0e8f365a, learn-artifact.js around line 187), which strips implied picture requirements when a JEV plan exists. The cap dropped the author's picture and the required-illustration check then failed.
- #12 (rows without ids) and #27 and #28 (columns written as objects) hit `explanation_bad_diagram` at attempt 0 and again on repair; #12 and #27 were then delivered without a diagram (visual fallback). Input for the matrix coercion task (Q0).

## Arm R

| # | reference id | source | intended kind | planner kind | model kind | selector hit | structure | factual (1-5) |
|---|---|---|---|---|---|---|---|---|
| 01 | [ml-transformer-attention-across-distance](01-ml-transformer-attention-across-distance/card.md) | Transformer | token-links | token-links | token-links | yes | fully | 4 |
| 02 | [ml-transformer-autoregressive-prefix](02-ml-transformer-autoregressive-prefix/card.md) | Transformer | sequence | sequence (override; planner said cycle) | sequence | yes | fully | 5 |
| 03 | [ml-transformer-batched-qkv](03-ml-transformer-batched-qkv/card.md) | Transformer | matrix | matrix (override; planner said transformation) | matrix | yes | fully | 5 |
| 04 | [ml-transformer-one-hot-target](04-ml-transformer-one-hot-target/card.md) | Transformer | matrix | matrix (override; planner said comparison) | matrix | yes | fully | 5 |
| 05 | [ml-transformer-positionwise-feedforward](05-ml-transformer-positionwise-feedforward/card.md) | Transformer | relationship | relationship (override; planner said token-links) | relationship | yes | fully | 5 |
| 06 | [ml-transformer-translation-task](06-ml-transformer-translation-task/card.md) | Transformer | flow | flow (override; planner said block-stack) | flow | yes | fully | 5 |
| 07 | [ml-bert-encoder-depth](07-ml-bert-encoder-depth/card.md) | BERT | block-stack | block-stack (override; planner said comparison) | block-stack | yes | fully | 5 |
| 08 | [ml-bert-fine-tuning](08-ml-bert-fine-tuning/card.md) | BERT | flow | flow (offered flow / layers) | flow | yes | fully | 4 |
| 09 | [ml-bert-gpt-task-inputs](09-ml-bert-gpt-task-inputs/card.md) | BERT | matrix | matrix (override; planner said transformation) | matrix | yes | partly | 4 |
| 10 | [ml-bert-masked-token](10-ml-bert-masked-token/card.md) | BERT | relationship | relationship (override; planner said token-links) | relationship | yes | fully | 5 |
| 11 | [ml-bert-pretraining-families](11-ml-bert-pretraining-families/card.md) | BERT | matrix | matrix (override; planner said comparison) | matrix | yes | fully | 5 |
| 12 | [ml-bert-task-heads](12-ml-bert-task-heads/card.md) | BERT | matrix | matrix (override; planner said comparison) | none | yes | none | 3 ERROR |
| 13 | [ml-gpt2-context-architecture](13-ml-gpt2-context-architecture/card.md) | GPT-2 | matrix | matrix (override; planner said comparison) | matrix | yes | fully | 5 |
| 14 | [ml-gpt2-continue-prefix](14-ml-gpt2-continue-prefix/card.md) | GPT-2 | timeline | timeline (override; planner said cycle) | timeline | yes | fully | 3 ERROR |
| 15 | [ml-gpt2-decode-cache](15-ml-gpt2-decode-cache/card.md) | GPT-2 | sequence | sequence (override; planner said token-links) | sequence | yes | fully | 4 |
| 16 | [ml-gpt2-parameter-counts](16-ml-gpt2-parameter-counts/card.md) | GPT-2 | matrix | matrix (override; planner said comparison) | matrix | yes | fully | 5 |
| 17 | [ml-gpt2-task-separators](17-ml-gpt2-task-separators/card.md) | GPT-2 | matrix | matrix (override; planner said transformation) | matrix | yes | fully | 5 |
| 18 | [ml-gpt2-tied-output-weights](18-ml-gpt2-tied-output-weights/card.md) | GPT-2 | matrix | matrix (override; planner said layers) | matrix | yes | fully | 3 ERROR |
| 19 | [ml-word2vec-positive-only-failure](19-ml-word2vec-positive-only-failure/card.md) | Word2vec | matrix | matrix (override; planner said coordinate-plot) | matrix | yes | fully | 5 |
| 20 | [ml-word2vec-profile-directions](20-ml-word2vec-profile-directions/card.md) | Word2vec | coordinate-plot | coordinate-plot | coordinate-plot | yes | fully | 5 |
| 21 | [ml-word2vec-sampled-training-rows](21-ml-word2vec-sampled-training-rows/card.md) | Word2vec | matrix | matrix (override; planner said sample-set) | matrix | yes | fully | 5 |
| 22 | [ml-word2vec-signed-embedding-heatmap](22-ml-word2vec-signed-embedding-heatmap/card.md) | Word2vec | heatmap | heatmap | heatmap | yes | fully | 3 ERROR |
| 23 | [ml-word2vec-trait-rescale](23-ml-word2vec-trait-rescale/card.md) | Word2vec | number-line | number-line (override; planner said transformation) | number-line | yes | fully | 3 ERROR |
| 24 | [ml-word2vec-vocabulary-versus-pair](24-ml-word2vec-vocabulary-versus-pair/card.md) | Word2vec | comparison | comparison (offered comparison / bar-chart) | comparison | yes | fully | 5 |
| 25 | [ml-stable-diffusion-clip-contrastive-scores](25-ml-stable-diffusion-clip-contrastive-scores/card.md) | Stable Diffusion | matrix | matrix (override; planner said flow) | matrix | yes | fully | 5 |
| 26 | [ml-stable-diffusion-clip-two-encoders](26-ml-stable-diffusion-clip-two-encoders/card.md) | Stable Diffusion | transformation | transformation (override; planner said block-stack) | picture (expected) | yes | none (expected) | 5 |
| 27 | [ml-stable-diffusion-forward-noise](27-ml-stable-diffusion-forward-noise/card.md) | Stable Diffusion | heatmap | heatmap (override; planner said transformation) | none | yes | none | 4 |
| 28 | [ml-stable-diffusion-image-caption-pairs](28-ml-stable-diffusion-image-caption-pairs/card.md) | Stable Diffusion | matrix | matrix (override; planner said sample-set) | FAILED | yes | none | - |
| 29 | [ml-stable-diffusion-unet-text-attention](29-ml-stable-diffusion-unet-text-attention/card.md) | Stable Diffusion | block-stack | block-stack | block-stack | yes | fully | 4 |
| 30 | [ml-stable-diffusion-unet-timestep-and-skips](30-ml-stable-diffusion-unet-timestep-and-skips/card.md) | Stable Diffusion | relationship | relationship (override; planner said block-stack) | relationship | yes | fully | 4 |
| 31 | [figure-retro-chunk-attention](31-figure-retro-chunk-attention/card.md) | Retrieval Transformer | token-links | token-links | token-links | yes | fully | 3 ERROR |
| 32 | [figure-retro-chunk-embedding](32-figure-retro-chunk-embedding/card.md) | Retrieval Transformer | transformation | transformation | transformation | yes | fully | 5 |
| 33 | [figure-retro-encoded-neighbor-rows](33-figure-retro-encoded-neighbor-rows/card.md) | Retrieval Transformer | transformation | transformation (override; planner said flow) | transformation | yes | fully | 5 |
| 34 | [figure-retro-fact-versus-pattern](34-figure-retro-fact-versus-pattern/card.md) | Retrieval Transformer | comparison | comparison (offered comparison / token-links) | comparison | yes | fully | 4 |
| 35 | [figure-retro-index-records](35-figure-retro-index-records/card.md) | Retrieval Transformer | matrix | matrix (override; planner said tree) | matrix | yes | partly | 5 |
| 36 | [figure-retro-layer-placement](36-figure-retro-layer-placement/card.md) | Retrieval Transformer | block-stack | block-stack (override; planner said layers) | block-stack | yes | partly | 5 |
| 37 | [d2l-forecast-feedback-error](37-d2l-forecast-feedback-error/card.md) | D2L | coordinate-plot | coordinate-plot (override; planner said cycle) | coordinate-plot | yes | fully | 3 ERROR |
| 38 | [d2l-newton-convex-curvature-steps](38-d2l-newton-convex-curvature-steps/card.md) | D2L | coordinate-plot | coordinate-plot | coordinate-plot | yes | fully | 4 |
| 39 | [d2l-recurrent-translation-fixed-context](39-d2l-recurrent-translation-fixed-context/card.md) | D2L | relationship | relationship (override; planner said block-stack) | relationship | yes | fully | 5 |
| 40 | [d2l-softmax-affine-class-scores](40-d2l-softmax-affine-class-scores/card.md) | D2L | relationship | relationship (override; planner said layers) | relationship | yes | fully | 4 |
| 41 | [d2l-transformer-encoder-head-weight-grids](41-d2l-transformer-encoder-head-weight-grids/card.md) | D2L | heatmap | comparison | heatmap | yes | fully | 4 |
| 42 | [d2l-weight-decay-heldout-loss](42-d2l-weight-decay-heldout-loss/card.md) | D2L | coordinate-plot | coordinate-plot | coordinate-plot | yes | fully | 4 |
| 43 | [figure-attention-output-gate](43-figure-attention-output-gate/card.md) | Architecture gallery | block-stack | block-stack (override; planner said flow) | block-stack | yes | fully | 5 |
| 44 | [figure-gallery-hybrid-state-and-cache-growth](44-figure-gallery-hybrid-state-and-cache-growth/card.md) | Architecture gallery | matrix | matrix (override; planner said block-stack) | matrix | yes | fully | 5 |
| 45 | [figure-latent-expert-widths](45-figure-latent-expert-widths/card.md) | Architecture gallery | flow | flow (override; planner said transformation) | flow | yes | fully | 4 |
| 46 | [figure-routed-expert-parameter-split](46-figure-routed-expert-parameter-split/card.md) | Architecture gallery | matrix | matrix (override; planner said token-links) | matrix | yes | fully | 5 |
| 47 | [figure-routed-vs-shared-experts](47-figure-routed-vs-shared-experts/card.md) | Architecture gallery | matrix | matrix (override; planner said transformation) | matrix | yes | fully | 4 |
| 48 | [ml-architecture-shared-core](48-ml-architecture-shared-core/card.md) | Architecture gallery | block-stack | block-stack | block-stack | yes | fully | 5 |

## Arm 0 (no per-card files)

| # | reference id | source | intended kind | planner kind | model kind | selector hit | structure | factual (1-5) |
|---|---|---|---|---|---|---|---|---|
| 01 | ml-transformer-attention-across-distance | Transformer | token-links | token-links | token-links | no | partly | 4 |
| 02 | ml-transformer-autoregressive-prefix | Transformer | sequence | cycle | cycle | no | not | 5 |
| 03 | ml-transformer-batched-qkv | Transformer | matrix | transformation (offered transformation / tensor) | transformation | no | not | 4 |
| 04 | ml-transformer-one-hot-target | Transformer | matrix | comparison (offered comparison / bar-chart) | comparison | no | not | - |
| 05 | ml-transformer-positionwise-feedforward | Transformer | relationship | token-links | token-links | no | not | 4 |
| 06 | ml-transformer-translation-task | Transformer | flow | block-stack | block-stack | no | partly | 5 |
| 07 | ml-bert-encoder-depth | BERT | block-stack | comparison | comparison | no | not | 5 |
| 08 | ml-bert-fine-tuning | BERT | flow | flow (offered flow / layers) | flow | no | not | 5 |
| 09 | ml-bert-gpt-task-inputs | BERT | matrix | transformation (offered transformation / flow) | transformation | no | not | 4 |
| 10 | ml-bert-masked-token | BERT | relationship | flow (offered flow / token-links) | flow | no | not | 4 |
| 11 | ml-bert-pretraining-families | BERT | matrix | comparison | comparison | no | partly | 5 |
| 12 | ml-bert-task-heads | BERT | matrix | comparison (offered comparison / block-stack) | comparison | no | partly | 5 |
| 13 | ml-gpt2-context-architecture | GPT-2 | matrix | comparison | comparison | no | partly | 5 |
| 14 | ml-gpt2-continue-prefix | GPT-2 | timeline | cycle (offered cycle / flow) | cycle | no | partly | 5 |
| 15 | ml-gpt2-decode-cache | GPT-2 | sequence | token-links (offered token-links / block-stack) | token-links | no | not | 4 |
| 16 | ml-gpt2-parameter-counts | GPT-2 | matrix | comparison (offered comparison / block-stack) | comparison | no | partly | 3 ERROR |
| 17 | ml-gpt2-task-separators | GPT-2 | matrix | transformation | transformation | no | not | 4 |
| 18 | ml-gpt2-tied-output-weights | GPT-2 | matrix | - | layers | no | not | 3 ERROR |
| 19 | ml-word2vec-positive-only-failure | Word2vec | matrix | token-links (offered token-links / sample-set) | token-links | no | not | 4 |
| 20 | ml-word2vec-profile-directions | Word2vec | coordinate-plot | coordinate-plot | coordinate-plot | no | fully | 4 |
| 21 | ml-word2vec-sampled-training-rows | Word2vec | matrix | sample-set (offered sample-set / flow) | flow | no | not | 5 |
| 22 | ml-word2vec-signed-embedding-heatmap | Word2vec | heatmap | heatmap | heatmap | no | partly | 4 |
| 23 | ml-word2vec-trait-rescale | Word2vec | number-line | transformation (offered transformation / coordinate-plot) | transformation | no | not | 4 |
| 24 | ml-word2vec-vocabulary-versus-pair | Word2vec | comparison | comparison (offered comparison / layers) | comparison | no | fully | 5 |
| 25 | ml-stable-diffusion-clip-contrastive-scores | Stable Diffusion | matrix | flow (offered flow / coordinate-plot) | flow | no | not | 4 |
| 26 | ml-stable-diffusion-clip-two-encoders | Stable Diffusion | transformation | block-stack (offered block-stack / comparison) | picture | no | none | 4 |
| 27 | ml-stable-diffusion-forward-noise | Stable Diffusion | heatmap | transformation (offered transformation / waterfall) | transformation | no | not | 4 |
| 28 | ml-stable-diffusion-image-caption-pairs | Stable Diffusion | matrix | sample-set | picture | no | none | 5 |
| 29 | ml-stable-diffusion-unet-text-attention | Stable Diffusion | block-stack | block-stack | block-stack | no | not | 5 |
| 30 | ml-stable-diffusion-unet-timestep-and-skips | Stable Diffusion | relationship | block-stack | block-stack | no | partly | 3 ERROR |
| 31 | figure-retro-chunk-attention | Retrieval Transformer | token-links | token-links | token-links | no | not | 4 |
| 32 | figure-retro-chunk-embedding | Retrieval Transformer | transformation | transformation | transformation | no | partly | 4 |
| 33 | figure-retro-encoded-neighbor-rows | Retrieval Transformer | transformation | flow (offered flow / transformation) | flow | no | not | 4 |
| 34 | figure-retro-fact-versus-pattern | Retrieval Transformer | comparison | comparison (offered comparison / token-links) | comparison | no | fully | 4 |
| 35 | figure-retro-index-records | Retrieval Transformer | matrix | tree (offered tree / relationship) | tree | no | not | 2 ERROR |
| 36 | figure-retro-layer-placement | Retrieval Transformer | block-stack | layers | layers | no | not | 4 |
| 37 | d2l-forecast-feedback-error | D2L | coordinate-plot | cycle | cycle | no | not | 4 |
| 38 | d2l-newton-convex-curvature-steps | D2L | coordinate-plot | coordinate-plot | coordinate-plot | no | partly | 4 |
| 39 | d2l-recurrent-translation-fixed-context | D2L | relationship | block-stack (offered block-stack / relationship) | block-stack | no | partly | 5 |
| 40 | d2l-softmax-affine-class-scores | D2L | relationship | layers (offered layers / transformation) | layers | no | partly | 4 |
| 41 | d2l-transformer-encoder-head-weight-grids | D2L | heatmap | comparison | heatmap | no | partly | 4 |
| 42 | d2l-weight-decay-heldout-loss | D2L | coordinate-plot | coordinate-plot | coordinate-plot | no | partly | 4 |
| 43 | figure-attention-output-gate | Architecture gallery | block-stack | flow (offered flow / block-stack) | flow | no | partly | 3 ERROR |
| 44 | figure-gallery-hybrid-state-and-cache-growth | Architecture gallery | matrix | block-stack (offered block-stack / token-links) | block-stack | no | not | 5 |
| 45 | figure-latent-expert-widths | Architecture gallery | flow | transformation (offered transformation / block-stack) | transformation | no | not | 3 ERROR |
| 46 | figure-routed-expert-parameter-split | Architecture gallery | matrix | token-links (offered token-links / comparison) | token-links | no | not | 4 |
| 47 | figure-routed-vs-shared-experts | Architecture gallery | matrix | transformation (offered transformation / block-stack) | transformation | no | not | 4 |
| 48 | ml-architecture-shared-core | Architecture gallery | block-stack | block-stack | block-stack | no | partly | 4 |

## Ten lowest structure scores, arm R (structure, then kind miss, then factual)

- 12 ml-bert-task-heads: structure none, intended matrix, model none, factual 3 ERROR
- 27 ml-stable-diffusion-forward-noise: structure none, intended heatmap, model none, factual 4
- 26 ml-stable-diffusion-clip-two-encoders: structure none (expected: see the note on card 26), intended transformation, model picture, factual 5
- 28 ml-stable-diffusion-image-caption-pairs: structure none, intended matrix, model FAILED, factual -
- 09 ml-bert-gpt-task-inputs: structure partly, intended matrix, model matrix, factual 4
- 35 figure-retro-index-records: structure partly, intended matrix, model matrix, factual 5
- 36 figure-retro-layer-placement: structure partly, intended block-stack, model block-stack, factual 5
- 14 ml-gpt2-continue-prefix: structure fully, intended timeline, model timeline, factual 3 ERROR
- 18 ml-gpt2-tied-output-weights: structure fully, intended matrix, model matrix, factual 3 ERROR
- 22 ml-word2vec-signed-embedding-heatmap: structure fully, intended heatmap, model heatmap, factual 3 ERROR
