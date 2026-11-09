# 08 · Feature Engineering & Selection

[Curriculum lesson](https://raw.githubusercontent.com/rohitg00/ai-engineering-from-scratch/e7db050e64bde3be17a9381476f748da26d85692/phases/02-ml-fundamentals/08-feature-engineering/docs/en.md) · [Source inventory](../08-feature-engineering/manifest.json)

## Matching figures

| Figure | Teaching point |
| --- | --- |
| [The Illustrated Transformer · 06](../illustrated-transformer/briefs.md#figure-06) | Each token position starts with a vector looked up from its token identity. |
| [The Illustrated Transformer · 10](../illustrated-transformer/briefs.md#figure-10) | A token's hidden vector is projected separately into a query, key, and value. |
| [The Illustrated Transformer · 22](../illustrated-transformer/briefs.md#figure-22) | Adding a position vector to each token embedding makes order available to attention. |
| [The Illustrated Transformer · 23](../illustrated-transformer/briefs.md#figure-23) | Sinusoidal position features give each position a distinct combination of slow and fast coordinates. |
| [The Illustrated Transformer · 24](../illustrated-transformer/briefs.md#figure-24) | A position-by-feature heatmap shows how phase changes across token positions and feature channels. |
| [The Illustrated Transformer · 25](../illustrated-transformer/briefs.md#figure-25) | Interleaving each sine channel with its cosine partner keeps the positional signals paired by frequency. |
| [The Illustrated Transformer · 27](../illustrated-transformer/briefs.md#figure-27) | A small numeric example separates adding the residual from normalizing the resulting vector. |
| [The Illustrated Transformer · 32](../illustrated-transformer/briefs.md#figure-32) | The output vocabulary defines a fixed ordering of slots in the prediction vector. |
| [The Illustrated Transformer · 33](../illustrated-transformer/briefs.md#figure-33) | A one-hot target identifies the observed next token by marking only its vocabulary slot. |
| [The Illustrated BERT, ELMo, and co. · 11](../illustrated-bert/briefs.md#figure-11) | A visual backbone can pass a learned vector to a classifier just as a text encoder does. |
| [The Illustrated BERT, ELMo, and co. · 12](../illustrated-bert/briefs.md#figure-12) | A static word embedding is a list of learned real-valued features. |
| [The Illustrated BERT, ELMo, and co. · 13](../illustrated-bert/briefs.md#figure-13) | A vector strip can stand for all the coordinates of a word representation. |
| [The Illustrated BERT, ELMo, and co. · 14](../illustrated-bert/briefs.md#figure-14) | The same surface word can have different contextual representations in sentences that mean different things. |
| [The Illustrated BERT, ELMo, and co. · 15](../illustrated-bert/briefs.md#figure-15) | ELMo maps a whole sentence to a sequence of contextual vectors with one vector aligned to each token. |
| [The Illustrated BERT, ELMo, and co. · 18](../illustrated-bert/briefs.md#figure-18) | ELMo concatenates the forward and backward states at each depth and combines the layer representations with task-specific weights. |
| [The Illustrated BERT, ELMo, and co. · 22](../illustrated-bert/briefs.md#figure-22) | The original GPT wraps different task inputs in token sequences that share one pretrained decoder. |
| [The Illustrated BERT, ELMo, and co. · 23](../illustrated-bert/briefs.md#figure-23) | Masked language modelling recovers a selected missing token from the rest of a bidirectional context. |
| [The Illustrated BERT, ELMo, and co. · 26](../illustrated-bert/briefs.md#figure-26) | Frozen BERT layers expose multiple contextual features for each token to a separate learner. |
| [The Illustrated BERT, ELMo, and co. · 27](../illustrated-bert/briefs.md#figure-27) | Layer selection and layer combination can change the quality of frozen text features for a downstream task. |
| [The Illustrated GPT-2 · 17](../illustrated-gpt2/briefs.md#figure-17) | An embedding lookup selects a single learned row for an input token. |
| [The Illustrated GPT-2 · 18](../illustrated-gpt2/briefs.md#figure-18) | GPT-2 learns a separate table of position vectors indexed by position. |
| [The Illustrated GPT-2 · 19](../illustrated-gpt2/briefs.md#figure-19) | A decoder adds the token lookup vector and its position vector before entering the first block. |
| [The Illustrated GPT-2 · 62](../illustrated-gpt2/briefs.md#figure-62) | Music can be tokenized into a vocabulary that encodes changes in pitch, timing and loudness. |
| [The Illustrated GPT-2 · 63](../illustrated-gpt2/briefs.md#figure-63) | Note onset, elapsed time and note release events reconstruct a performed phrase with overlapping notes. |
| [The Illustrated GPT-2 · 64](../illustrated-gpt2/briefs.md#figure-64) | Each musical event maps to an index in a shared vocabulary before it enters the Transformer. |
| [The Illustrated Word2vec · 04](../illustrated-word2vec/briefs.md#figure-04) | Changing the units of a score can preserve its meaning and order. |
| [The Illustrated Word2vec · 11](../illustrated-word2vec/briefs.md#figure-11) | A word embedding is stored as one vector whose individual entries may have no human names. |
| [The Illustrated Word2vec · 12](../illustrated-word2vec/briefs.md#figure-12) | A signed color scale makes the magnitude and sign of vector entries easy to scan. |
| [The Illustrated Word2vec · 22](../illustrated-word2vec/briefs.md#figure-22) | An embedding lookup replaces each word ID with the vector in its corresponding table row. |
