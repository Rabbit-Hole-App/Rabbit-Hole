# Rendered reference previews by chapter

Rebuilt from the saved [Rabbit Hole handoff at `952e0e9`](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/952e0e999ffbe64353f0f7098d2bcc9b85a98494/docs/features/explain-on-canvas/handoff/phase02-library/figure-chapters/README.md). This version covers 654 figure occurrences and 212 new worked references. The earlier temporary handoff reported 705 figures and 149 new worked references.

These are the independently authored Rabbit Hole diagrams. The table lists the 408 px SVG for each depth. The renderer also writes natural-width and 960 px SVGs and the reference JSON.

## Open a committed example

- Attention softmax, Brief · [408 px SVG](https://raw.githubusercontent.com/Rabbit-Hole-App/Rabbit-Hole/952e0e999ffbe64353f0f7098d2bcc9b85a98494/docs/features/explain-on-canvas/handoff/phase02-library/illustrations/ml-transformer-attention-softmax-brief/408.svg)
- Attention softmax, Balanced · [408 px SVG](https://raw.githubusercontent.com/Rabbit-Hole-App/Rabbit-Hole/952e0e999ffbe64353f0f7098d2bcc9b85a98494/docs/features/explain-on-canvas/handoff/phase02-library/illustrations/ml-transformer-attention-softmax/408.svg)
- Attention softmax, Detailed · [408 px SVG](https://raw.githubusercontent.com/Rabbit-Hole-App/Rabbit-Hole/952e0e999ffbe64353f0f7098d2bcc9b85a98494/docs/features/explain-on-canvas/handoff/phase02-library/illustrations/ml-transformer-attention-softmax-detailed/408.svg)

## Open the full set locally

Run from the Rabbit Hole repository root at the saved revision with web workspace dependencies installed.

```powershell
$previewRoot = "$env:USERPROFILE\Downloads\rabbit-hole-figure-previews"
node packages/web/scripts/illustration-previews.mjs "$previewRoot"
explorer.exe "$previewRoot"
```

Each path in the tables starts inside `rabbit-hole-figure-previews`. Where a preview is checked in, the table links directly to its SVG.

## Illustrated Transformer figure chapter

[Figure order and mappings](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/952e0e999ffbe64353f0f7098d2bcc9b85a98494/docs/features/explain-on-canvas/handoff/phase02-library/figure-chapters/transformer.md)

| Reference | Brief | Balanced | Detailed |
| --- | --- | --- | --- |
| Machine translation with a Transformer<br>`ml-transformer-translation-task` | `ml-transformer-translation-task-brief/408.svg` | `ml-transformer-translation-task/408.svg` | `ml-transformer-translation-task-detailed/408.svg` |
| Encoder memory feeds the decoder stack<br>`ml-transformer-encoder-decoder-memory` | `ml-transformer-encoder-decoder-memory-brief/408.svg` | `ml-transformer-encoder-decoder-memory/408.svg` | `ml-transformer-encoder-decoder-memory-detailed/408.svg` |
| Original Transformer decoder layer<br>`ml-transformer-original-decoder-sublayers` | `ml-transformer-original-decoder-sublayers-brief/408.svg` | `ml-transformer-original-decoder-sublayers/408.svg` | `ml-transformer-original-decoder-sublayers-detailed/408.svg` |
| Context mixing versus position-wise updates<br>`ml-transformer-positionwise-feedforward` | `ml-transformer-positionwise-feedforward-brief/408.svg` | `ml-transformer-positionwise-feedforward/408.svg` | `ml-transformer-positionwise-feedforward-detailed/408.svg` |
| Attention weight and token distance<br>`ml-transformer-attention-across-distance` | `ml-transformer-attention-across-distance-brief/408.svg` | `ml-transformer-attention-across-distance/408.svg` | `ml-transformer-attention-across-distance-detailed/408.svg` |
| Project every token in one matrix operation<br>`ml-transformer-batched-qkv` | `ml-transformer-batched-qkv-brief/408.svg` | `ml-transformer-batched-qkv/408.svg` | `ml-transformer-batched-qkv-detailed/408.svg` |
| One attention distribution per query<br>`ml-transformer-batched-attention` | `ml-transformer-batched-attention-brief/408.svg` | `ml-transformer-batched-attention/408.svg` | `ml-transformer-batched-attention-detailed/408.svg` |
| Fast and slow position signals<br>`ml-transformer-position-heatmap` | `ml-transformer-position-heatmap-brief/408.svg` | `ml-transformer-position-heatmap/408.svg` | `ml-transformer-position-heatmap-detailed/408.svg` |
| A worked residual add and normalization<br>`ml-transformer-residual-arithmetic` | `ml-transformer-residual-arithmetic-brief/408.svg` | `ml-transformer-residual-arithmetic/408.svg` | `ml-transformer-residual-arithmetic-detailed/408.svg` |
| Autoregressive decoding grows the prefix<br>`ml-transformer-autoregressive-prefix` | `ml-transformer-autoregressive-prefix-brief/408.svg` | `ml-transformer-autoregressive-prefix/408.svg` | `ml-transformer-autoregressive-prefix-detailed/408.svg` |
| Prediction and target share a vocabulary<br>`ml-transformer-one-hot-target` | `ml-transformer-one-hot-target-brief/408.svg` | `ml-transformer-one-hot-target/408.svg` | `ml-transformer-one-hot-target-detailed/408.svg` |
| Shift targets by one position<br>`ml-transformer-shifted-targets` | `ml-transformer-shifted-targets-brief/408.svg` | `ml-transformer-shifted-targets/408.svg` | `ml-transformer-shifted-targets-detailed/408.svg` |
| Probability assigned to the answer controls loss<br>`ml-transformer-vocabulary-cross-entropy` | `ml-transformer-vocabulary-cross-entropy-brief/408.svg` | `ml-transformer-vocabulary-cross-entropy/408.svg` | `ml-transformer-vocabulary-cross-entropy-detailed/408.svg` |

## The Illustrated BERT, ELMo, and co. figure chapter

[Figure order and mappings](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/952e0e999ffbe64353f0f7098d2bcc9b85a98494/docs/features/explain-on-canvas/handoff/phase02-library/figure-chapters/bert.md)

| Reference | Brief | Balanced | Detailed |
| --- | --- | --- | --- |
| BERT and earlier language models<br>`ml-bert-pretraining-families` | `ml-bert-pretraining-families-brief/408.svg` | `ml-bert-pretraining-families/408.svg` | `ml-bert-pretraining-families-detailed/408.svg` |
| Pretrain, then fine-tune BERT<br>`ml-bert-fine-tuning` | `ml-bert-fine-tuning-brief/408.svg` | `ml-bert-fine-tuning/408.svg` | `ml-bert-fine-tuning-detailed/408.svg` |
| BERT classification reads the CLS vector<br>`ml-bert-cls-readout` | `ml-bert-cls-readout-brief/408.svg` | `ml-bert-cls-readout/408.svg` | `ml-bert-cls-readout-detailed/408.svg` |
| A miniature BERT encoder stack<br>`ml-bert-encoder-depth` | `ml-bert-encoder-depth-brief/408.svg` | `ml-bert-encoder-depth/408.svg` | `ml-bert-encoder-depth-detailed/408.svg` |
| Static and contextual embeddings<br>`ml-bert-contextual-vectors` | `ml-bert-contextual-vectors-brief/408.svg` | `ml-bert-contextual-vectors/408.svg` | `ml-bert-contextual-vectors-detailed/408.svg` |
| Two language-model directions in ELMo<br>`ml-bert-elmo-layer-mix` | `ml-bert-elmo-layer-mix-brief/408.svg` | `ml-bert-elmo-layer-mix/408.svg` | `ml-bert-elmo-layer-mix-detailed/408.svg` |
| Shift targets by one position<br>`ml-transformer-shifted-targets` | `ml-transformer-shifted-targets-brief/408.svg` | `ml-transformer-shifted-targets/408.svg` | `ml-transformer-shifted-targets-detailed/408.svg` |
| Task inputs for the original GPT<br>`ml-bert-gpt-task-inputs` | `ml-bert-gpt-task-inputs-brief/408.svg` | `ml-bert-gpt-task-inputs/408.svg` | `ml-bert-gpt-task-inputs-detailed/408.svg` |
| Masked language modelling in BERT<br>`ml-bert-masked-token` | `ml-bert-masked-token-brief/408.svg` | `ml-bert-masked-token/408.svg` | `ml-bert-masked-token-detailed/408.svg` |
| Original BERT next-sentence prediction<br>`ml-bert-next-sentence` | `ml-bert-next-sentence-brief/408.svg` | `ml-bert-next-sentence/408.svg` | `ml-bert-next-sentence-detailed/408.svg` |
| Which BERT positions does each task head read?<br>`ml-bert-task-heads` | `ml-bert-task-heads-brief/408.svg` | `ml-bert-task-heads/408.svg` | `ml-bert-task-heads-detailed/408.svg` |
| Compare frozen BERT layer features<br>`ml-bert-frozen-features` | `ml-bert-frozen-features-brief/408.svg` | `ml-bert-frozen-features/408.svg` | `ml-bert-frozen-features-detailed/408.svg` |

## The Illustrated GPT-2 figure chapter

[Figure order and mappings](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/952e0e999ffbe64353f0f7098d2bcc9b85a98494/docs/features/explain-on-canvas/handoff/phase02-library/figure-chapters/gpt2.md)

| Reference | Brief | Balanced | Detailed |
| --- | --- | --- | --- |
| Autoregressive text generation in GPT-2<br>`ml-gpt2-continue-prefix` | `ml-gpt2-continue-prefix-brief/408.svg` | `ml-gpt2-continue-prefix/408.svg` | `ml-gpt2-continue-prefix-detailed/408.svg` |
| How GPT-2-style model sizes scale<br>`ml-gpt2-parameter-counts` | `ml-gpt2-parameter-counts-brief/408.svg` | `ml-gpt2-parameter-counts/408.svg` | `ml-gpt2-parameter-counts-detailed/408.svg` |
| Encoder memory feeds the decoder stack<br>`ml-transformer-encoder-decoder-memory` | `ml-transformer-encoder-decoder-memory-brief/408.svg` | `ml-transformer-encoder-decoder-memory/408.svg` | `ml-transformer-encoder-decoder-memory-detailed/408.svg` |
| Context in GPT-2, BERT and Transformer-XL<br>`ml-gpt2-context-architecture` | `ml-gpt2-context-architecture-brief/408.svg` | `ml-gpt2-context-architecture/408.svg` | `ml-gpt2-context-architecture-detailed/408.svg` |
| Original Transformer decoder layer<br>`ml-transformer-original-decoder-sublayers` | `ml-transformer-original-decoder-sublayers-brief/408.svg` | `ml-transformer-original-decoder-sublayers/408.svg` | `ml-transformer-original-decoder-sublayers-detailed/408.svg` |
| Reuse keys and values during GPT-2 decoding<br>`ml-gpt2-decode-cache` | `ml-gpt2-decode-cache-brief/408.svg` | `ml-gpt2-decode-cache/408.svg` | `ml-gpt2-decode-cache-detailed/408.svg` |
| Learned token and position lookups in GPT-2<br>`ml-gpt2-learned-position-lookup` | `ml-gpt2-learned-position-lookup-brief/408.svg` | `ml-gpt2-learned-position-lookup/408.svg` | `ml-gpt2-learned-position-lookup-detailed/408.svg` |
| Tied embeddings score the GPT-2 vocabulary<br>`ml-gpt2-tied-output-weights` | `ml-gpt2-tied-output-weights-brief/408.svg` | `ml-gpt2-tied-output-weights/408.svg` | `ml-gpt2-tied-output-weights-detailed/408.svg` |
| One attention distribution per query<br>`ml-transformer-batched-attention` | `ml-transformer-batched-attention-brief/408.svg` | `ml-transformer-batched-attention/408.svg` | `ml-transformer-batched-attention-detailed/408.svg` |
| Shift targets by one position<br>`ml-transformer-shifted-targets` | `ml-transformer-shifted-targets-brief/408.svg` | `ml-transformer-shifted-targets/408.svg` | `ml-transformer-shifted-targets-detailed/408.svg` |
| One packed QKV projection in GPT-2<br>`ml-gpt2-fused-qkv-slices` | `ml-gpt2-fused-qkv-slices-brief/408.svg` | `ml-gpt2-fused-qkv-slices/408.svg` | `ml-gpt2-fused-qkv-slices-detailed/408.svg` |
| GPT-2 positionwise feed-forward network<br>`ml-gpt2-feedforward-expansion` | `ml-gpt2-feedforward-expansion-brief/408.svg` | `ml-gpt2-feedforward-expansion/408.svg` | `ml-gpt2-feedforward-expansion-detailed/408.svg` |
| Task markers organize decoder-only continuations<br>`ml-gpt2-task-separators` | `ml-gpt2-task-separators-brief/408.svg` | `ml-gpt2-task-separators/408.svg` | `ml-gpt2-task-separators-detailed/408.svg` |
| An event vocabulary for a music Transformer<br>`ml-gpt2-music-event-tokens` | `ml-gpt2-music-event-tokens-brief/408.svg` | `ml-gpt2-music-event-tokens/408.svg` | `ml-gpt2-music-event-tokens-detailed/408.svg` |

## The Illustrated Word2vec figure chapter

[Figure order and mappings](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/952e0e999ffbe64353f0f7098d2bcc9b85a98494/docs/features/explain-on-canvas/handoff/phase02-library/figure-chapters/word2vec.md)

| Reference | Brief | Balanced | Detailed |
| --- | --- | --- | --- |
| Look up an embedding by word<br>`ml-word2vec-word-lookup` | `ml-word2vec-word-lookup-brief/408.svg` | `ml-word2vec-word-lookup/408.svg` | `ml-word2vec-word-lookup-detailed/408.svg` |
| Profile traits as fixed coordinates<br>`ml-word2vec-profile-coordinates` | `ml-word2vec-profile-coordinates-brief/408.svg` | `ml-word2vec-profile-coordinates/408.svg` | `ml-word2vec-profile-coordinates-detailed/408.svg` |
| Center the units of one profile trait<br>`ml-word2vec-trait-rescale` | `ml-word2vec-trait-rescale-brief/408.svg` | `ml-word2vec-trait-rescale/408.svg` | `ml-word2vec-trait-rescale-detailed/408.svg` |
| Two-coordinate profile directions<br>`ml-word2vec-profile-directions` | `ml-word2vec-profile-directions-brief/408.svg` | `ml-word2vec-profile-directions/408.svg` | `ml-word2vec-profile-directions-detailed/408.svg` |
| Cosine comparison across three coordinates<br>`ml-word2vec-profile-cosine` | `ml-word2vec-profile-cosine-brief/408.svg` | `ml-word2vec-profile-cosine/408.svg` | `ml-word2vec-profile-cosine-detailed/408.svg` |
| One signed scale for word vectors<br>`ml-word2vec-signed-embedding-heatmap` | `ml-word2vec-signed-embedding-heatmap-brief/408.svg` | `ml-word2vec-signed-embedding-heatmap/408.svg` | `ml-word2vec-signed-embedding-heatmap-detailed/408.svg` |
| A word analogy is a vector search<br>`ml-word2vec-word-offset` | `ml-word2vec-word-offset-brief/408.svg` | `ml-word2vec-word-offset/408.svg` | `ml-word2vec-word-offset-detailed/408.svg` |
| Next-word predictions for a fixed prefix<br>`ml-word2vec-prefix-guesses` | `ml-word2vec-prefix-guesses-brief/408.svg` | `ml-word2vec-prefix-guesses/408.svg` | `ml-word2vec-prefix-guesses-detailed/408.svg` |
| A simple neural word predictor<br>`ml-word2vec-neural-predictor` | `ml-word2vec-neural-predictor-brief/408.svg` | `ml-word2vec-neural-predictor/408.svg` | `ml-word2vec-neural-predictor-detailed/408.svg` |
| Build next-word training rows from text<br>`ml-word2vec-sliding-next-word` | `ml-word2vec-sliding-next-word-brief/408.svg` | `ml-word2vec-sliding-next-word/408.svg` | `ml-word2vec-sliding-next-word-detailed/408.svg` |
| Compare left-only and two-sided clues<br>`ml-word2vec-right-context-clue` | `ml-word2vec-right-context-clue-brief/408.svg` | `ml-word2vec-right-context-clue/408.svg` | `ml-word2vec-right-context-clue-detailed/408.svg` |
| Continuous bag-of-words training examples<br>`ml-word2vec-context-both-sides` | `ml-word2vec-context-both-sides-brief/408.svg` | `ml-word2vec-context-both-sides/408.svg` | `ml-word2vec-context-both-sides-detailed/408.svg` |
| Extract skip-gram pairs from a moving window<br>`ml-word2vec-skipgram-window` | `ml-word2vec-skipgram-window-brief/408.svg` | `ml-word2vec-skipgram-window/408.svg` | `ml-word2vec-skipgram-window-detailed/408.svg` |
| Full-softmax skip-gram training loop<br>`ml-word2vec-full-softmax-training-loop` | `ml-word2vec-full-softmax-training-loop-brief/408.svg` | `ml-word2vec-full-softmax-training-loop/408.svg` | `ml-word2vec-full-softmax-training-loop-detailed/408.svg` |
| Full-softmax skip-gram learning signal<br>`ml-word2vec-full-vocabulary-target` | `ml-word2vec-full-vocabulary-target-brief/408.svg` | `ml-word2vec-full-vocabulary-target/408.svg` | `ml-word2vec-full-vocabulary-target-detailed/408.svg` |
| Full vocabulary versus sampled pair objective<br>`ml-word2vec-vocabulary-versus-pair` | `ml-word2vec-vocabulary-versus-pair-brief/408.svg` | `ml-word2vec-vocabulary-versus-pair/408.svg` | `ml-word2vec-vocabulary-versus-pair-detailed/408.svg` |
| Positive pairs alone cannot teach contrast<br>`ml-word2vec-positive-only-failure` | `ml-word2vec-positive-only-failure-brief/408.svg` | `ml-word2vec-positive-only-failure/408.svg` | `ml-word2vec-positive-only-failure-detailed/408.svg` |
| Assemble skip-gram negative-sampling batches<br>`ml-word2vec-sampled-training-rows` | `ml-word2vec-sampled-training-rows-brief/408.svg` | `ml-word2vec-sampled-training-rows/408.svg` | `ml-word2vec-sampled-training-rows-detailed/408.svg` |
| Look up center and context vectors separately<br>`ml-word2vec-centre-and-context-tables` | `ml-word2vec-centre-and-context-tables-brief/408.svg` | `ml-word2vec-centre-and-context-tables/408.svg` | `ml-word2vec-centre-and-context-tables-detailed/408.svg` |
| Dot product and sigmoid for sampled pairs<br>`ml-word2vec-pair-dot-and-sigmoid` | `ml-word2vec-pair-dot-and-sigmoid-brief/408.svg` | `ml-word2vec-pair-dot-and-sigmoid/408.svg` | `ml-word2vec-pair-dot-and-sigmoid-detailed/408.svg` |
| Score correction for positive and negative pairs<br>`ml-word2vec-pair-score-error` | `ml-word2vec-pair-score-error-brief/408.svg` | `ml-word2vec-pair-score-error/408.svg` | `ml-word2vec-pair-score-error-detailed/408.svg` |
| One simultaneous Word2vec update<br>`ml-word2vec-embedding-row-update` | `ml-word2vec-embedding-row-update-brief/408.svg` | `ml-word2vec-embedding-row-update/408.svg` | `ml-word2vec-embedding-row-update-detailed/408.svg` |
| Rescore the sampled pairs after one update<br>`ml-word2vec-scores-after-update` | `ml-word2vec-scores-after-update-brief/408.svg` | `ml-word2vec-scores-after-update/408.svg` | `ml-word2vec-scores-after-update-detailed/408.svg` |
| Two context radii around the same center<br>`ml-word2vec-window-radius` | `ml-word2vec-window-radius-brief/408.svg` | `ml-word2vec-window-radius/408.svg` | `ml-word2vec-window-radius-detailed/408.svg` |
| Compare two negative-sample budgets<br>`ml-word2vec-negative-sample-budget` | `ml-word2vec-negative-sample-budget-brief/408.svg` | `ml-word2vec-negative-sample-budget/408.svg` | `ml-word2vec-negative-sample-budget-detailed/408.svg` |

## The Illustrated Stable Diffusion figure chapter

[Figure order and mappings](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/952e0e999ffbe64353f0f7098d2bcc9b85a98494/docs/features/explain-on-canvas/handoff/phase02-library/figure-chapters/stable-diffusion.md)

| Reference | Brief | Balanced | Detailed |
| --- | --- | --- | --- |
| Stable Diffusion’s three main stages<br>`ml-stable-diffusion-latent-pipeline` | `ml-stable-diffusion-latent-pipeline-brief/408.svg` | `ml-stable-diffusion-latent-pipeline/408.svg` | `ml-stable-diffusion-latent-pipeline-detailed/408.svg` |
| Follow data shapes through latent diffusion<br>`ml-stable-diffusion-latent-shapes` | `ml-stable-diffusion-latent-shapes-brief/408.svg` | `ml-stable-diffusion-latent-shapes/408.svg` | `ml-stable-diffusion-latent-shapes-detailed/408.svg` |
| Repeat latent denoising before one image decode<br>`ml-stable-diffusion-latent-sampler` | `ml-stable-diffusion-latent-sampler-brief/408.svg` | `ml-stable-diffusion-latent-sampler/408.svg` | `ml-stable-diffusion-latent-sampler-detailed/408.svg` |
| Pixel image, latent and reconstruction<br>`ml-stable-diffusion-image-autoencoder` | `ml-stable-diffusion-image-autoencoder-brief/408.svg` | `ml-stable-diffusion-image-autoencoder/408.svg` | `ml-stable-diffusion-image-autoencoder-detailed/408.svg` |
| Forward diffusion with known noise<br>`ml-stable-diffusion-forward-noise` | `ml-stable-diffusion-forward-noise-brief/408.svg` | `ml-stable-diffusion-forward-noise/408.svg` | `ml-stable-diffusion-forward-noise-detailed/408.svg` |
| Features and targets for the noise predictor<br>`ml-stable-diffusion-noise-target-table` | `ml-stable-diffusion-noise-target-table-brief/408.svg` | `ml-stable-diffusion-noise-target-table/408.svg` | `ml-stable-diffusion-noise-target-table-detailed/408.svg` |
| One noise-prediction training step<br>`ml-stable-diffusion-denoiser-loss` | `ml-stable-diffusion-denoiser-loss-brief/408.svg` | `ml-stable-diffusion-denoiser-loss/408.svg` | `ml-stable-diffusion-denoiser-loss-detailed/408.svg` |
| Unconditioned and text-conditioned denoising<br>`ml-stable-diffusion-denoiser-inputs` | `ml-stable-diffusion-denoiser-inputs-brief/408.svg` | `ml-stable-diffusion-denoiser-inputs/408.svg` | `ml-stable-diffusion-denoiser-inputs-detailed/408.svg` |
| Track one latent through two reverse steps<br>`ml-stable-diffusion-reverse-latent-steps` | `ml-stable-diffusion-reverse-latent-steps-brief/408.svg` | `ml-stable-diffusion-reverse-latent-steps/408.svg` | `ml-stable-diffusion-reverse-latent-steps-detailed/408.svg` |
| Forward training and reverse generation<br>`ml-stable-diffusion-training-versus-generation` | `ml-stable-diffusion-training-versus-generation-brief/408.svg` | `ml-stable-diffusion-training-versus-generation/408.svg` | `ml-stable-diffusion-training-versus-generation-detailed/408.svg` |
| Evaluate encoder choices on two measures<br>`ml-stable-diffusion-encoder-evaluation` | `ml-stable-diffusion-encoder-evaluation-brief/408.svg` | `ml-stable-diffusion-encoder-evaluation/408.svg` | `ml-stable-diffusion-encoder-evaluation-detailed/408.svg` |
| Paired image-caption training examples<br>`ml-stable-diffusion-image-caption-pairs` | `ml-stable-diffusion-image-caption-pairs-brief/408.svg` | `ml-stable-diffusion-image-caption-pairs/408.svg` | `ml-stable-diffusion-image-caption-pairs-detailed/408.svg` |
| Encode one CLIP image-caption pair<br>`ml-stable-diffusion-clip-two-encoders` | `ml-stable-diffusion-clip-two-encoders-brief/408.svg` | `ml-stable-diffusion-clip-two-encoders/408.svg` | `ml-stable-diffusion-clip-two-encoders-detailed/408.svg` |
| Learn image and text matches together<br>`ml-stable-diffusion-clip-contrastive-scores` | `ml-stable-diffusion-clip-contrastive-scores-brief/408.svg` | `ml-stable-diffusion-clip-contrastive-scores/408.svg` | `ml-stable-diffusion-clip-contrastive-scores-detailed/408.svg` |
| A conditional denoising training record<br>`ml-stable-diffusion-conditional-training-rows` | `ml-stable-diffusion-conditional-training-rows-brief/408.svg` | `ml-stable-diffusion-conditional-training-rows/408.svg` | `ml-stable-diffusion-conditional-training-rows-detailed/408.svg` |
| Timestep inputs and skip paths inside a U-Net<br>`ml-stable-diffusion-unet-timestep-and-skips` | `ml-stable-diffusion-unet-timestep-and-skips-brief/408.svg` | `ml-stable-diffusion-unet-timestep-and-skips/408.svg` | `ml-stable-diffusion-unet-timestep-and-skips-detailed/408.svg` |
| Cross-attention routes text into the U-Net<br>`ml-stable-diffusion-unet-text-attention` | `ml-stable-diffusion-unet-text-attention-brief/408.svg` | `ml-stable-diffusion-unet-text-attention/408.svg` | `ml-stable-diffusion-unet-text-attention-detailed/408.svg` |

## The Illustrated Retrieval Transformer figure chapter

[Figure order and mappings](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/952e0e999ffbe64353f0f7098d2bcc9b85a98494/docs/features/explain-on-canvas/handoff/phase02-library/figure-chapters/retrieval-transformer.md)

| Reference | Brief | Balanced | Detailed |
| --- | --- | --- | --- |
| Retrieved evidence before the next word<br>`figure-retro-evidence-loop` | `figure-retro-evidence-loop-brief/408.svg` | `figure-retro-evidence-loop/408.svg` | `figure-retro-evidence-loop-detailed/408.svg` |
| Language patterns and factual evidence<br>`figure-retro-fact-versus-pattern` | `figure-retro-fact-versus-pattern-brief/408.svg` | `figure-retro-fact-versus-pattern/408.svg` | `figure-retro-fact-versus-pattern-detailed/408.svg` |
| Matched text and continuation in the index<br>`figure-retro-index-records` | `figure-retro-index-records-brief/408.svg` | `figure-retro-index-records/408.svg` | `figure-retro-index-records-detailed/408.svg` |
| Mean pooling for the chunk search<br>`figure-retro-chunk-embedding` | `figure-retro-chunk-embedding-brief/408.svg` | `figure-retro-chunk-embedding/408.svg` | `figure-retro-chunk-embedding-detailed/408.svg` |
| Nearest passages to the chunk query<br>`figure-retro-neighbor-search` | `figure-retro-neighbor-search-brief/408.svg` | `figure-retro-neighbor-search/408.svg` | `figure-retro-neighbor-search-detailed/408.svg` |
| Retrieval-aware layers in the decoder<br>`figure-retro-layer-placement` | `figure-retro-layer-placement-brief/408.svg` | `figure-retro-layer-placement/408.svg` | `figure-retro-layer-placement-detailed/408.svg` |
| Neighbor features become attention keys and values<br>`figure-retro-encoded-neighbor-rows` | `figure-retro-encoded-neighbor-rows-brief/408.svg` | `figure-retro-encoded-neighbor-rows/408.svg` | `figure-retro-encoded-neighbor-rows-detailed/408.svg` |
| Chunked attention over both retrieved passages<br>`figure-retro-chunk-attention` | `figure-retro-chunk-attention-brief/408.svg` | `figure-retro-chunk-attention/408.svg` | `figure-retro-chunk-attention-detailed/408.svg` |

## D2L figure chapters

[Figure order and mappings](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/952e0e999ffbe64353f0f7098d2bcc9b85a98494/docs/features/explain-on-canvas/handoff/phase02-library/figure-chapters/d2l.md)

| Reference | Brief | Balanced | Detailed |
| --- | --- | --- | --- |
| Gaussian location and scale<br>`d2l-gaussian-location-scale` | `d2l-gaussian-location-scale-brief/408.svg` | `d2l-gaussian-location-scale/408.svg` | `d2l-gaussian-location-scale-detailed/408.svg` |
| A linear predictor is one output unit<br>`d2l-linear-weighted-inputs` | `d2l-linear-weighted-inputs-brief/408.svg` | `d2l-linear-weighted-inputs/408.svg` | `d2l-linear-weighted-inputs-detailed/408.svg` |
| The neuron signal path as an analogy<br>`d2l-neuron-signal-path-analogy` | `d2l-neuron-signal-path-analogy-brief/408.svg` | `d2l-neuron-signal-path-analogy/408.svg` | `d2l-neuron-signal-path-analogy-detailed/408.svg` |
| Complexity and held-out error<br>`d2l-complexity-heldout-error` | `d2l-complexity-heldout-error-brief/408.svg` | `d2l-complexity-heldout-error/408.svg` | `d2l-complexity-heldout-error-detailed/408.svg` |
| Weight decay changes the fit trade-off<br>`d2l-weight-decay-heldout-loss` | `d2l-weight-decay-heldout-loss-brief/408.svg` | `d2l-weight-decay-heldout-loss/408.svg` | `d2l-weight-decay-heldout-loss-detailed/408.svg` |
| Each class has its own affine score<br>`d2l-softmax-affine-class-scores` | `d2l-softmax-affine-class-scores-brief/408.svg` | `d2l-softmax-affine-class-scores/408.svg` | `d2l-softmax-affine-class-scores-detailed/408.svg` |
| Subtract the maximum for stable softmax<br>`d2l-softmax-shift-for-stability` | `d2l-softmax-shift-for-stability-brief/408.svg` | `d2l-softmax-shift-for-stability/408.svg` | `d2l-softmax-shift-for-stability-detailed/408.svg` |
| A hidden layer learns features<br>`d2l-dense-hidden-layer-activations` | `d2l-dense-hidden-layer-activations-brief/408.svg` | `d2l-dense-hidden-layer-activations/408.svg` | `d2l-dense-hidden-layer-activations-detailed/408.svg` |
| ReLU has a corner at zero<br>`d2l-rectifier-activation-shape` | `d2l-rectifier-activation-shape-brief/408.svg` | `d2l-rectifier-activation-shape/408.svg` | `d2l-rectifier-activation-shape-detailed/408.svg` |
| ReLU derivative away from zero<br>`d2l-rectifier-local-gradient` | `d2l-rectifier-local-gradient-brief/408.svg` | `d2l-rectifier-local-gradient/408.svg` | `d2l-rectifier-local-gradient-detailed/408.svg` |
| Activation slopes near saturation<br>`d2l-sigmoid-tanh-saturation-gradients` | `d2l-sigmoid-tanh-saturation-gradients-brief/408.svg` | `d2l-sigmoid-tanh-saturation-gradients/408.svg` | `d2l-sigmoid-tanh-saturation-gradients-detailed/408.svg` |
| Tanh and sigmoid have different ranges<br>`d2l-tanh-sigmoid-activation-ranges` | `d2l-tanh-sigmoid-activation-ranges-brief/408.svg` | `d2l-tanh-sigmoid-activation-ranges/408.svg` | `d2l-tanh-sigmoid-activation-ranges-detailed/408.svg` |
| Forward graph with a weight penalty<br>`d2l-regularized-forward-graph` | `d2l-regularized-forward-graph-brief/408.svg` | `d2l-regularized-forward-graph/408.svg` | `d2l-regularized-forward-graph-detailed/408.svg` |
| Inverted dropout on hidden activations<br>`d2l-inverted-dropout-mask` | `d2l-inverted-dropout-mask-brief/408.svg` | `d2l-inverted-dropout-mask/408.svg` | `d2l-inverted-dropout-mask-detailed/408.svg` |
| Reading a dropout training run<br>`d2l-dropout-validation-metrics` | `d2l-dropout-validation-metrics-brief/408.svg` | `d2l-dropout-validation-metrics/408.svg` | `d2l-dropout-validation-metrics-detailed/408.svg` |
| Step size changes the descent path<br>`d2l-gradient-descent-rate-regimes` | `d2l-gradient-descent-rate-regimes-brief/408.svg` | `d2l-gradient-descent-rate-regimes/408.svg` | `d2l-gradient-descent-rate-regimes-detailed/408.svg` |
| Descent can settle in a local minimum<br>`d2l-gradient-descent-local-basin` | `d2l-gradient-descent-local-basin-brief/408.svg` | `d2l-gradient-descent-local-basin/408.svg` | `d2l-gradient-descent-local-basin-detailed/408.svg` |
| Newton steps use slope and curvature<br>`d2l-newton-convex-curvature-steps` | `d2l-newton-convex-curvature-steps-brief/408.svg` | `d2l-newton-convex-curvature-steps/408.svg` | `d2l-newton-convex-curvature-steps-detailed/408.svg` |
| Negative curvature can reverse Newton’s step<br>`d2l-newton-negative-curvature-safeguard` | `d2l-newton-negative-curvature-safeguard-brief/408.svg` | `d2l-newton-negative-curvature-safeguard/408.svg` | `d2l-newton-negative-curvature-safeguard-detailed/408.svg` |
| Stochastic descent under three step schedules<br>`d2l-sgd-noise-and-decay` | `d2l-sgd-noise-and-decay-brief/408.svg` | `d2l-sgd-noise-and-decay/408.svg` | `d2l-sgd-noise-and-decay-detailed/408.svg` |
| Loss by data pass at different batch sizes<br>`d2l-minibatch-loss-per-epoch` | `d2l-minibatch-loss-per-epoch-brief/408.svg` | `d2l-minibatch-loss-per-epoch/408.svg` | `d2l-minibatch-loss-per-epoch-detailed/408.svg` |
| Batch size changes elapsed time to a target<br>`d2l-minibatch-loss-by-wall-time` | `d2l-minibatch-loss-by-wall-time-brief/408.svg` | `d2l-minibatch-loss-by-wall-time/408.svg` | `d2l-minibatch-loss-by-wall-time-detailed/408.svg` |
| Momentum in a narrow loss valley<br>`d2l-momentum-in-narrow-valley` | `d2l-momentum-in-narrow-valley-brief/408.svg` | `d2l-momentum-in-narrow-valley/408.svg` | `d2l-momentum-in-narrow-valley-detailed/408.svg` |
| Momentum weights decay with age<br>`d2l-momentum-gradient-memory` | `d2l-momentum-gradient-memory-brief/408.svg` | `d2l-momentum-gradient-memory/408.svg` | `d2l-momentum-gradient-memory-detailed/408.svg` |
| Tune step size and momentum together<br>`d2l-momentum-rate-loss-history` | `d2l-momentum-rate-loss-history-brief/408.svg` | `d2l-momentum-rate-loss-history/408.svg` | `d2l-momentum-rate-loss-history-detailed/408.svg` |
| Adam and Yogi on the same toy regression<br>`d2l-adam-yogi-loss-history` | `d2l-adam-yogi-loss-history-brief/408.svg` | `d2l-adam-yogi-loss-history/408.svg` | `d2l-adam-yogi-loss-history-detailed/408.svg` |
| Adam scales each coordinate separately<br>`d2l-adam-per-coordinate-rescaling` | `d2l-adam-per-coordinate-rescaling-brief/408.svg` | `d2l-adam-per-coordinate-rescaling/408.svg` | `d2l-adam-per-coordinate-rescaling-detailed/408.svg` |
| A schedule can change when accuracy improves<br>`d2l-schedule-heldout-training-outcome` | `d2l-schedule-heldout-training-outcome-brief/408.svg` | `d2l-schedule-heldout-training-outcome/408.svg` | `d2l-schedule-heldout-training-outcome-detailed/408.svg` |
| Inverse-root and factor rate decay<br>`d2l-inverse-root-factor-schedules` | `d2l-inverse-root-factor-schedules-brief/408.svg` | `d2l-inverse-root-factor-schedules/408.svg` | `d2l-inverse-root-factor-schedules-detailed/408.svg` |
| Cosine decay with and without warmup<br>`d2l-cosine-warmup-schedules` | `d2l-cosine-warmup-schedules-brief/408.svg` | `d2l-cosine-warmup-schedules/408.svg` | `d2l-cosine-warmup-schedules-detailed/408.svg` |
| A repeated local patch<br>`d2l-shared-patch-detector` | `d2l-shared-patch-detector-brief/408.svg` | `d2l-shared-patch-detector/408.svg` | `d2l-shared-patch-detector-detailed/408.svg` |
| One filter response<br>`d2l-convolution-window-arithmetic` | `d2l-convolution-window-arithmetic-brief/408.svg` | `d2l-convolution-window-arithmetic/408.svg` | `d2l-convolution-window-arithmetic-detailed/408.svg` |
| One field, two response maps<br>`d2l-convolution-filter-maps` | `d2l-convolution-filter-maps-brief/408.svg` | `d2l-convolution-filter-maps/408.svg` | `d2l-convolution-filter-maps-detailed/408.svg` |
| Coverage by valid windows<br>`d2l-convolution-window-reuse` | `d2l-convolution-window-reuse-brief/408.svg` | `d2l-convolution-window-reuse/408.svg` | `d2l-convolution-window-reuse-detailed/408.svg` |
| A filter window on the padded border<br>`d2l-convolution-zero-border` | `d2l-convolution-zero-border-brief/408.svg` | `d2l-convolution-zero-border/408.svg` | `d2l-convolution-zero-border-detailed/408.svg` |
| Different strides on each axis<br>`d2l-convolution-axis-strides` | `d2l-convolution-axis-strides-brief/408.svg` | `d2l-convolution-axis-strides/408.svg` | `d2l-convolution-axis-strides-detailed/408.svg` |
| Multi-channel filter response<br>`d2l-convolution-input-channel-sum` | `d2l-convolution-input-channel-sum-brief/408.svg` | `d2l-convolution-input-channel-sum/408.svg` | `d2l-convolution-input-channel-sum-detailed/408.svg` |
| Pointwise channel mixing<br>`d2l-pointwise-channel-mixing` | `d2l-pointwise-channel-mixing-brief/408.svg` | `d2l-pointwise-channel-mixing/408.svg` | `d2l-pointwise-channel-mixing-detailed/408.svg` |
| Two pooling windows<br>`d2l-max-pooling-windows` | `d2l-max-pooling-windows-brief/408.svg` | `d2l-max-pooling-windows/408.svg` | `d2l-max-pooling-windows-detailed/408.svg` |
| Shape changes in a small CNN<br>`d2l-cnn-shape-through-classifier` | `d2l-cnn-shape-through-classifier-brief/408.svg` | `d2l-cnn-shape-through-classifier/408.svg` | `d2l-cnn-shape-through-classifier-detailed/408.svg` |
| Training and held-out loss<br>`d2l-cnn-loss-and-accuracy` | `d2l-cnn-loss-and-accuracy-brief/408.svg` | `d2l-cnn-loss-and-accuracy/408.svg` | `d2l-cnn-loss-and-accuracy-detailed/408.svg` |
| Time order exposes recurring structure<br>`d2l-ordered-sequence-readings` | `d2l-ordered-sequence-readings-brief/408.svg` | `d2l-ordered-sequence-readings/408.svg` | `d2l-ordered-sequence-readings-detailed/408.svg` |
| A recurrent state handoff<br>`d2l-recurrent-state-handoff` | `d2l-recurrent-state-handoff-brief/408.svg` | `d2l-recurrent-state-handoff/408.svg` | `d2l-recurrent-state-handoff-detailed/408.svg` |
| The ordered readings<br>`d2l-lag-regression-training-examples` | `d2l-lag-regression-training-examples-brief/408.svg` | `d2l-lag-regression-training-examples/408.svg` | `d2l-lag-regression-training-examples-detailed/408.svg` |
| Fit loss and held-out loss for a lag model<br>`d2l-lag-regression-training-loss` | `d2l-lag-regression-training-loss-brief/408.svg` | `d2l-lag-regression-training-loss/408.svg` | `d2l-lag-regression-training-loss-detailed/408.svg` |
| Rolling one-step forecasts<br>`d2l-forecast-one-step-refresh` | `d2l-forecast-one-step-refresh-brief/408.svg` | `d2l-forecast-one-step-refresh/408.svg` | `d2l-forecast-one-step-refresh-detailed/408.svg` |
| Recursive forecast feedback<br>`d2l-forecast-feedback-error` | `d2l-forecast-feedback-error-brief/408.svg` | `d2l-forecast-feedback-error/408.svg` | `d2l-forecast-feedback-error-detailed/408.svg` |
| Forecasts compared at the same target times<br>`d2l-forecast-damping-by-horizon` | `d2l-forecast-damping-by-horizon-brief/408.svg` | `d2l-forecast-damping-by-horizon/408.svg` | `d2l-forecast-damping-by-horizon-detailed/408.svg` |
| Next-character supervision<br>`d2l-recurrent-next-character-targets` | `d2l-recurrent-next-character-targets-brief/408.svg` | `d2l-recurrent-next-character-targets/408.svg` | `d2l-recurrent-next-character-targets-detailed/408.svg` |
| Gradient reach under three truncation rules<br>`d2l-backpropagation-through-time-cutoffs` | `d2l-backpropagation-through-time-cutoffs-brief/408.svg` | `d2l-backpropagation-through-time-cutoffs/408.svg` | `d2l-backpropagation-through-time-cutoffs-detailed/408.svg` |
| A shared recurrent weight gets one summed gradient<br>`d2l-recurrent-weight-gradient-sum` | `d2l-recurrent-weight-gradient-sum-brief/408.svg` | `d2l-recurrent-weight-gradient-sum/408.svg` | `d2l-recurrent-weight-gradient-sum-detailed/408.svg` |
| Attention with diagonal weights<br>`d2l-attention-identity-weights` | `d2l-attention-identity-weights-brief/408.svg` | `d2l-attention-identity-weights/408.svg` | `d2l-attention-identity-weights-detailed/408.svg` |
| Distance kernels before normalization<br>`d2l-attention-distance-kernel-shapes` | `d2l-attention-distance-kernel-shapes-brief/408.svg` | `d2l-attention-distance-kernel-shapes/408.svg` | `d2l-attention-distance-kernel-shapes-detailed/408.svg` |
| Local attention pooling versus a global mean<br>`d2l-attention-pooling-local-prediction` | `d2l-attention-pooling-local-prediction-brief/408.svg` | `d2l-attention-pooling-local-prediction/408.svg` | `d2l-attention-pooling-local-prediction-detailed/408.svg` |
| Local weight by query and key<br>`d2l-attention-pooling-neighbor-weight-grid` | `d2l-attention-pooling-neighbor-weight-grid-brief/408.svg` | `d2l-attention-pooling-neighbor-weight-grid/408.svg` | `d2l-attention-pooling-neighbor-weight-grid-detailed/408.svg` |
| Two bandwidths on the same observations<br>`d2l-attention-bandwidth-changes-fit` | `d2l-attention-bandwidth-changes-fit-brief/408.svg` | `d2l-attention-bandwidth-changes-fit/408.svg` | `d2l-attention-bandwidth-changes-fit-detailed/408.svg` |
| Normalized weights with a narrow width<br>`d2l-attention-bandwidth-weight-spread` | `d2l-attention-bandwidth-weight-spread-brief/408.svg` | `d2l-attention-bandwidth-weight-spread/408.svg` | `d2l-attention-bandwidth-weight-spread-detailed/408.svg` |
| Attention over valid keys only<br>`d2l-attention-valid-length-padding` | `d2l-attention-valid-length-padding-brief/408.svg` | `d2l-attention-valid-length-padding/408.svg` | `d2l-attention-valid-length-padding-detailed/408.svg` |
| Project unlike query and key widths<br>`d2l-attention-additive-score-projection` | `d2l-attention-additive-score-projection-brief/408.svg` | `d2l-attention-additive-score-projection/408.svg` | `d2l-attention-additive-score-projection-detailed/408.svg` |
| Translation with a fixed encoder summary<br>`d2l-recurrent-translation-fixed-context` | `d2l-recurrent-translation-fixed-context-brief/408.svg` | `d2l-recurrent-translation-fixed-context/408.svg` | `d2l-recurrent-translation-fixed-context-detailed/408.svg` |
| The recurrent decoder retrieves fresh context<br>`d2l-bahdanau-changing-decoder-context` | `d2l-bahdanau-changing-decoder-context-brief/408.svg` | `d2l-bahdanau-changing-decoder-context/408.svg` | `d2l-bahdanau-changing-decoder-context-detailed/408.svg` |
| Train and validation loss diverge<br>`d2l-translation-train-validation-loss` | `d2l-translation-train-validation-loss-brief/408.svg` | `d2l-translation-train-validation-loss/408.svg` | `d2l-translation-train-validation-loss-detailed/408.svg` |
| Source alignment in recurrent translation<br>`d2l-bahdanau-read-translation-alignment` | `d2l-bahdanau-read-translation-alignment-brief/408.svg` | `d2l-bahdanau-read-translation-alignment/408.svg` | `d2l-bahdanau-read-translation-alignment-detailed/408.svg` |
| Paths between positions in a sequence<br>`d2l-cnn-rnn-attention-path-length` | `d2l-cnn-rnn-attention-path-length-brief/408.svg` | `d2l-cnn-rnn-attention-path-length/408.svg` | `d2l-cnn-rnn-attention-path-length-detailed/408.svg` |
| Faster position features<br>`d2l-transformer-position-signal-frequency` | `d2l-transformer-position-signal-frequency-brief/408.svg` | `d2l-transformer-position-signal-frequency/408.svg` | `d2l-transformer-position-signal-frequency-detailed/408.svg` |
| Fast and slow position signals<br>`ml-transformer-position-heatmap` | `ml-transformer-position-heatmap-brief/408.svg` | `ml-transformer-position-heatmap/408.svg` | `ml-transformer-position-heatmap-detailed/408.svg` |
| Encoder memory feeds the decoder stack<br>`ml-transformer-encoder-decoder-memory` | `ml-transformer-encoder-decoder-memory-brief/408.svg` | `ml-transformer-encoder-decoder-memory/408.svg` | `ml-transformer-encoder-decoder-memory-detailed/408.svg` |
| Original Transformer decoder layer<br>`ml-transformer-original-decoder-sublayers` | `ml-transformer-original-decoder-sublayers-brief/408.svg` | `ml-transformer-original-decoder-sublayers/408.svg` | `ml-transformer-original-decoder-sublayers-detailed/408.svg` |
| Encoder head A weights<br>`d2l-transformer-encoder-head-weight-grids` | `d2l-transformer-encoder-head-weight-grids-brief/408.svg` | `d2l-transformer-encoder-head-weight-grids/408.svg` | `d2l-transformer-encoder-head-weight-grids-detailed/408.svg` |
| Cross-attention masks source padding<br>`d2l-transformer-cross-attention-grid-padding` | `d2l-transformer-cross-attention-grid-padding-brief/408.svg` | `d2l-transformer-cross-attention-grid-padding/408.svg` | `d2l-transformer-cross-attention-grid-padding-detailed/408.svg` |

## LLM architecture gallery figure chapter

[Figure order and mappings](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/952e0e999ffbe64353f0f7098d2bcc9b85a98494/docs/features/explain-on-canvas/handoff/phase02-library/figure-chapters/architecture-gallery.md)

| Reference | Brief | Balanced | Detailed |
| --- | --- | --- | --- |
| A word and its position get separate rows<br>`figure-gpt2-learned-position-decoder` | `figure-gpt2-learned-position-decoder-brief/408.svg` | `figure-gpt2-learned-position-decoder/408.svg` | `figure-gpt2-learned-position-decoder-detailed/408.svg` |
| Two ways to choose a position row<br>`figure-fixed-vs-learned-positions` | `figure-fixed-vs-learned-positions-brief/408.svg` | `figure-fixed-vs-learned-positions/408.svg` | `figure-fixed-vs-learned-positions-detailed/408.svg` |
| Grouped-query attention shares key and value heads<br>`figure-grouped-query-heads` | `figure-grouped-query-heads-brief/408.svg` | `figure-grouped-query-heads/408.svg` | `figure-grouped-query-heads-detailed/408.svg` |
| Decoder depth, state width and feed-forward width<br>`figure-decoder-depth-and-width-knobs` | `figure-decoder-depth-and-width-knobs-brief/408.svg` | `figure-decoder-depth-and-width-knobs/408.svg` | `figure-decoder-depth-and-width-knobs-detailed/408.svg` |
| Two places to normalize a residual branch<br>`figure-olmo-residual-norm-placement` | `figure-olmo-residual-norm-placement-brief/408.svg` | `figure-olmo-residual-norm-placement/408.svg` | `figure-olmo-residual-norm-placement-detailed/408.svg` |
| Rescaling queries and keys can change the ranking<br>`figure-query-key-score-normalization` | `figure-query-key-score-normalization-brief/408.svg` | `figure-query-key-score-normalization/408.svg` | `figure-query-key-score-normalization-detailed/408.svg` |
| Compact attention memory, separate expert routes<br>`figure-deepseek-latent-cache-experts` | `figure-deepseek-latent-cache-experts-brief/408.svg` | `figure-deepseek-latent-cache-experts/408.svg` | `figure-deepseek-latent-cache-experts-detailed/408.svg` |
| Dense feed-forward prefix and routed tail<br>`figure-gallery-dense-to-expert-depth` | `figure-gallery-dense-to-expert-depth-brief/408.svg` | `figure-gallery-dense-to-expert-depth/408.svg` | `figure-gallery-dense-to-expert-depth-detailed/408.svg` |
| One inference layout across specialized checkpoints<br>`figure-shared-decoder-checkpoint-specialization` | `figure-shared-decoder-checkpoint-specialization-brief/408.svg` | `figure-shared-decoder-checkpoint-specialization/408.svg` | `figure-shared-decoder-checkpoint-specialization-detailed/408.svg` |
| Windowed layers with periodic global reach<br>`figure-gallery-window-layer-schedule` | `figure-gallery-window-layer-schedule-brief/408.svg` | `figure-gallery-window-layer-schedule/408.svg` | `figure-gallery-window-layer-schedule-detailed/408.svg` |
| Attention reach and token updates<br>`figure-decoder-independent-schedules` | `figure-decoder-independent-schedules-brief/408.svg` | `figure-decoder-independent-schedules/408.svg` | `figure-decoder-independent-schedules-detailed/408.svg` |
| Experts available and experts used<br>`figure-routed-vs-shared-experts` | `figure-routed-vs-shared-experts-brief/408.svg` | `figure-routed-vs-shared-experts/408.svg` | `figure-routed-vs-shared-experts-detailed/408.svg` |
| The vocabulary interface around a decoder<br>`figure-vocabulary-interface-width` | `figure-vocabulary-interface-width-brief/408.svg` | `figure-vocabulary-interface-width/408.svg` | `figure-vocabulary-interface-width-detailed/408.svg` |
| Position rules can differ by layer<br>`figure-selective-rotary-position` | `figure-selective-rotary-position-brief/408.svg` | `figure-selective-rotary-position/408.svg` | `figure-selective-rotary-position-detailed/408.svg` |
| Query heads and expert-bank capacity vary separately<br>`figure-latent-attention-and-expert-bank-knobs` | `figure-latent-attention-and-expert-bank-knobs-brief/408.svg` | `figure-latent-attention-and-expert-bank-knobs/408.svg` | `figure-latent-attention-and-expert-bank-knobs-detailed/408.svg` |
| Three levels of attention head sharing<br>`figure-attention-head-sharing-counts` | `figure-attention-head-sharing-counts-brief/408.svg` | `figure-attention-head-sharing-counts/408.svg` | `figure-attention-head-sharing-counts-detailed/408.svg` |
| Attention interleaved with carried state<br>`figure-decoder-hybrid-mixer-schedule` | `figure-decoder-hybrid-mixer-schedule-brief/408.svg` | `figure-decoder-hybrid-mixer-schedule/408.svg` | `figure-decoder-hybrid-mixer-schedule-detailed/408.svg` |
| Only part of the head carries the rotation<br>`figure-partial-rotary-head-width` | `figure-partial-rotary-head-width-brief/408.svg` | `figure-partial-rotary-head-width/408.svg` | `figure-partial-rotary-head-width-detailed/408.svg` |
| Local filtering before the recurrent state write<br>`figure-gallery-convolution-before-recurrent-state` | `figure-gallery-convolution-before-recurrent-state-brief/408.svg` | `figure-gallery-convolution-before-recurrent-state/408.svg` | `figure-gallery-convolution-before-recurrent-state-detailed/408.svg` |
| Weighted reads across layer depth<br>`figure-gallery-depth-attention` | `figure-gallery-depth-attention-brief/408.svg` | `figure-gallery-depth-attention/408.svg` | `figure-gallery-depth-attention-detailed/408.svg` |
| Carried state and cached history during decoding<br>`figure-gallery-hybrid-state-and-cache-growth` | `figure-gallery-hybrid-state-and-cache-growth-brief/408.svg` | `figure-gallery-hybrid-state-and-cache-growth/408.svg` | `figure-gallery-hybrid-state-and-cache-growth-detailed/408.svg` |
| Position extension for global attention<br>`figure-global-only-position-extension` | `figure-global-only-position-extension-brief/408.svg` | `figure-global-only-position-extension/408.svg` | `figure-global-only-position-extension-detailed/408.svg` |
| Shortlist tokens before computing attention<br>`figure-deepseek-sparse-attention-shortlist` | `figure-deepseek-sparse-attention-shortlist-brief/408.svg` | `figure-deepseek-sparse-attention-shortlist/408.svg` | `figure-deepseek-sparse-attention-shortlist-detailed/408.svg` |
| Total and active weights in a routed layer<br>`figure-routed-expert-parameter-split` | `figure-routed-expert-parameter-split-brief/408.svg` | `figure-routed-expert-parameter-split/408.svg` | `figure-routed-expert-parameter-split-detailed/408.svg` |
| An auxiliary later-token prediction<br>`figure-gallery-future-token-head` | `figure-gallery-future-token-head-brief/408.svg` | `figure-gallery-future-token-head/408.svg` | `figure-gallery-future-token-head-detailed/408.svg` |
| Only selected experts use the smaller state<br>`figure-latent-expert-widths` | `figure-latent-expert-widths-brief/408.svg` | `figure-latent-expert-widths/408.svg` | `figure-latent-expert-widths-detailed/408.svg` |
| Shared projection in the global layer<br>`figure-gallery-global-tied-key-value-projection` | `figure-gallery-global-tied-key-value-projection-brief/408.svg` | `figure-gallery-global-tied-key-value-projection/408.svg` | `figure-gallery-global-tied-key-value-projection-detailed/408.svg` |
| Direct media tokens in a shared text decoder<br>`figure-direct-media-token-projection` | `figure-direct-media-token-projection-brief/408.svg` | `figure-direct-media-token-projection/408.svg` | `figure-direct-media-token-projection-detailed/408.svg` |
| One word table can do two jobs<br>`figure-tied-input-output-embeddings` | `figure-tied-input-output-embeddings-brief/408.svg` | `figure-tied-input-output-embeddings/408.svg` | `figure-tied-input-output-embeddings-detailed/408.svg` |
| Modality front ends feed a shared text decoder<br>`figure-modality-frontends-text-decoder` | `figure-modality-frontends-text-decoder-brief/408.svg` | `figure-modality-frontends-text-decoder/408.svg` | `figure-modality-frontends-text-decoder-detailed/408.svg` |
| A verifier checks the draft in order<br>`figure-speculative-prefix-verification` | `figure-speculative-prefix-verification-brief/408.svg` | `figure-speculative-prefix-verification/408.svg` | `figure-speculative-prefix-verification-detailed/408.svg` |
| Parallel sublayers read the same input<br>`figure-parallel-residual-sublayers` | `figure-parallel-residual-sublayers-brief/408.svg` | `figure-parallel-residual-sublayers/408.svg` | `figure-parallel-residual-sublayers-detailed/408.svg` |
| A recurrent decoder carries a matrix memory<br>`figure-recurrent-decoder-matrix-memory` | `figure-recurrent-decoder-matrix-memory-brief/408.svg` | `figure-recurrent-decoder-matrix-memory/408.svg` | `figure-recurrent-decoder-matrix-memory-detailed/408.svg` |
| Scale a dense-to-routed decoder family<br>`figure-compare-sparse-decoder-family` | `figure-compare-sparse-decoder-family-brief/408.svg` | `figure-compare-sparse-decoder-family/408.svg` | `figure-compare-sparse-decoder-family-detailed/408.svg` |
| The same decoder blocks can run again<br>`figure-decoder-reused-layer-weights` | `figure-decoder-reused-layer-weights-brief/408.svg` | `figure-decoder-reused-layer-weights/408.svg` | `figure-decoder-reused-layer-weights-detailed/408.svg` |
| Mix a learned expert and an identity route<br>`figure-learned-and-identity-shortcut` | `figure-learned-and-identity-shortcut-brief/408.svg` | `figure-learned-and-identity-shortcut/408.svg` | `figure-learned-and-identity-shortcut-detailed/408.svg` |
| Small token lookups at separate depths<br>`figure-gallery-layer-specific-token-lookup` | `figure-gallery-layer-specific-token-lookup-brief/408.svg` | `figure-gallery-layer-specific-token-lookup/408.svg` | `figure-gallery-layer-specific-token-lookup-detailed/408.svg` |
| State width and key/value groups can grow together<br>`figure-layer-local-inputs-and-group-counts` | `figure-layer-local-inputs-and-group-counts-brief/408.svg` | `figure-layer-local-inputs-and-group-counts/408.svg` | `figure-layer-local-inputs-and-group-counts-detailed/408.svg` |
| Recent-window attention and two compressed history reads<br>`figure-gallery-fine-and-coarse-history-compression` | `figure-gallery-fine-and-coarse-history-compression-brief/408.svg` | `figure-gallery-fine-and-coarse-history-compression/408.svg` | `figure-gallery-fine-and-coarse-history-compression-detailed/408.svg` |
| Read, transform, and write parallel residual streams<br>`figure-gallery-multistream-residual` | `figure-gallery-multistream-residual-brief/408.svg` | `figure-gallery-multistream-residual/408.svg` | `figure-gallery-multistream-residual-detailed/408.svg` |
| Short convolution and learned relative attention bias<br>`figure-gallery-convolution-relative-bias` | `figure-gallery-convolution-relative-bias-brief/408.svg` | `figure-gallery-convolution-relative-bias/408.svg` | `figure-gallery-convolution-relative-bias-detailed/408.svg` |
| Separate query and key/value bottlenecks<br>`figure-gallery-latent-query-and-kv` | `figure-gallery-latent-query-and-kv-brief/408.svg` | `figure-gallery-latent-query-and-kv/408.svg` | `figure-gallery-latent-query-and-kv-detailed/408.svg` |
| Two mixers, same kind of expert routing<br>`ml-architecture-hybrid-routing` | `ml-architecture-hybrid-routing-brief/408.svg` | `ml-architecture-hybrid-routing/408.svg` | `ml-architecture-hybrid-routing-detailed/408.svg` |
| Parallel attention and expert updates<br>`ml-architecture-parallel-attention-experts` | `ml-architecture-parallel-attention-experts-brief/408.svg` | `ml-architecture-parallel-attention-experts/408.svg` | `ml-architecture-parallel-attention-experts-detailed/408.svg` |
| Convolution and attention at different depths<br>`figure-gallery-convolution-layer-schedule` | `figure-gallery-convolution-layer-schedule-brief/408.svg` | `figure-gallery-convolution-layer-schedule/408.svg` | `figure-gallery-convolution-layer-schedule-detailed/408.svg` |
| Sliding-window and indexed attention masks<br>`figure-gallery-window-vs-index-mask` | `figure-gallery-window-vs-index-mask-brief/408.svg` | `figure-gallery-window-vs-index-mask/408.svg` | `figure-gallery-window-vs-index-mask-detailed/408.svg` |
| One search, two attention reads<br>`ml-architecture-sparse-index-reuse` | `ml-architecture-sparse-index-reuse-brief/408.svg` | `ml-architecture-sparse-index-reuse/408.svg` | `ml-architecture-sparse-index-reuse-detailed/408.svg` |
| A larger context cap with the same decoder<br>`raschka-context-cap-same-experts` | `raschka-context-cap-same-experts-brief/408.svg` | `raschka-context-cap-same-experts/408.svg` | `raschka-context-cap-same-experts-detailed/408.svg` |
| An uneven state-space and attention schedule<br>`raschka-uneven-mixer-macroblocks` | `raschka-uneven-mixer-macroblocks-brief/408.svg` | `raschka-uneven-mixer-macroblocks/408.svg` | `raschka-uneven-mixer-macroblocks-detailed/408.svg` |
| A low-rank side path updates a projection<br>`figure-gallery-low-rank-adapter` | `figure-gallery-low-rank-adapter-brief/408.svg` | `figure-gallery-low-rank-adapter/408.svg` | `figure-gallery-low-rank-adapter-detailed/408.svg` |
| One core, multiple passes<br>`ml-architecture-shared-core` | `ml-architecture-shared-core-brief/408.svg` | `ml-architecture-shared-core/408.svg` | `ml-architecture-shared-core-detailed/408.svg` |
| Channel-wise carry before a recurrent write<br>`figure-recurrent-channel-decay` | `figure-recurrent-channel-decay-brief/408.svg` | `figure-recurrent-channel-decay/408.svg` | `figure-recurrent-channel-decay-detailed/408.svg` |
| Gate the attention read before projecting it<br>`figure-attention-output-gate` | `figure-attention-output-gate-brief/408.svg` | `figure-attention-output-gate/408.svg` | `figure-attention-output-gate-detailed/408.svg` |
| Selected blocks with a causal current block<br>`figure-gallery-partial-block-mask` | `figure-gallery-partial-block-mask-brief/408.svg` | `figure-gallery-partial-block-mask/408.svg` | `figure-gallery-partial-block-mask-detailed/408.svg` |
| Encoder global memory and decoder-local context<br>`figure-gallery-encoder-global-kv` | `figure-gallery-encoder-global-kv-brief/408.svg` | `figure-gallery-encoder-global-kv/408.svg` | `figure-gallery-encoder-global-kv-detailed/408.svg` |
| Shared sparse index and shared key/value state<br>`figure-gallery-shared-kv-and-index` | `figure-gallery-shared-kv-and-index-brief/408.svg` | `figure-gallery-shared-kv-and-index/408.svg` | `figure-gallery-shared-kv-and-index-detailed/408.svg` |
| Normalize latent expert outputs before mixing<br>`figure-latent-expert-output-normalization` | `figure-latent-expert-output-normalization-brief/408.svg` | `figure-latent-expert-output-normalization/408.svg` | `figure-latent-expert-output-normalization-detailed/408.svg` |
| Residual gain and output soft capping<br>`raschka-residual-gain-and-soft-logit-cap` | `raschka-residual-gain-and-soft-logit-cap-brief/408.svg` | `raschka-residual-gain-and-soft-logit-cap/408.svg` | `raschka-residual-gain-and-soft-logit-cap-detailed/408.svg` |
| A fixed input enters every pass of a shared core<br>`figure-gallery-shared-core-reinjection` | `figure-gallery-shared-core-reinjection-brief/408.svg` | `figure-gallery-shared-core-reinjection/408.svg` | `figure-gallery-shared-core-reinjection-detailed/408.svg` |
| A learned sink changes weight within the same window<br>`figure-gallery-learned-sink-weight` | `figure-gallery-learned-sink-weight-brief/408.svg` | `figure-gallery-learned-sink-weight/408.svg` | `figure-gallery-learned-sink-weight-detailed/408.svg` |
| Indexed attention in the same hybrid backbone<br>`raschka-indexed-attention-only-diff` | `raschka-indexed-attention-only-diff-brief/408.svg` | `raschka-indexed-attention-only-diff/408.svg` | `raschka-indexed-attention-only-diff-detailed/408.svg` |
