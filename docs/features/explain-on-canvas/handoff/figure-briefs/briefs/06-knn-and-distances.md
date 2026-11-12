# 06 · K-Nearest Neighbors and Distances

[Curriculum lesson](https://raw.githubusercontent.com/rohitg00/ai-engineering-from-scratch/e7db050e64bde3be17a9381476f748da26d85692/phases/02-ml-fundamentals/06-knn-and-distances/docs/en.md) · [Source inventory](../06-knn-and-distances/manifest.json)

## Matching figures

| Figure | Teaching point |
| --- | --- |
| [The Illustrated Word2vec · 07](../illustrated-word2vec/briefs.md#figure-07) | Cosine similarity ranks candidates by how closely their vector directions match the anchor. |
| [The Illustrated Word2vec · 09](../illustrated-word2vec/briefs.md#figure-09) | Cosine similarity can compare every coordinate even when the vectors cannot be plotted in the plane. |
| [The Illustrated Word2vec · 15](../illustrated-word2vec/briefs.md#figure-15) | A vector analogy is answered by retrieving a real vocabulary entry near a calculated direction. |
| [The Illustrated Stable Diffusion · 26](../illustrated-stable-diffusion/briefs.md#figure-26) | A similarity grid exposes which image-text pairs align and which cross-pairs are negatives. |
| [The Illustrated Retrieval Transformer · 08](../illustrated-retrieval-transformer/briefs.md#figure-08) | Nearest-neighbor search ranks indexed chunks by their distance from the encoded input. |
| [11.2. Attention Pooling by Similarity · 01](../d2l-attention-pooling/briefs.md#figure-01) | Kernel shapes encode how rapidly a key loses influence as its distance from the query increases. |
| [11.2. Attention Pooling by Similarity · 02](../d2l-attention-pooling/briefs.md#figure-02) | Kernel shapes encode how rapidly a key loses influence as its distance from the query increases. |
| [11.2. Attention Pooling by Similarity · 03](../d2l-attention-pooling/briefs.md#figure-03) | Kernel shapes encode how rapidly a key loses influence as its distance from the query increases. |
| [11.2. Attention Pooling by Similarity · 04](../d2l-attention-pooling/briefs.md#figure-04) | Kernel shapes encode how rapidly a key loses influence as its distance from the query increases. |
| [11.2. Attention Pooling by Similarity · 05](../d2l-attention-pooling/briefs.md#figure-05) | Distance-weighted averaging estimates a curve locally, while uniform weights predict the same average everywhere. |
| [11.2. Attention Pooling by Similarity · 06](../d2l-attention-pooling/briefs.md#figure-06) | Distance-weighted averaging estimates a curve locally, while uniform weights predict the same average everywhere. |
| [11.2. Attention Pooling by Similarity · 07](../d2l-attention-pooling/briefs.md#figure-07) | Distance-weighted averaging estimates a curve locally, while uniform weights predict the same average everywhere. |
| [11.2. Attention Pooling by Similarity · 08](../d2l-attention-pooling/briefs.md#figure-08) | Distance-weighted averaging estimates a curve locally, while uniform weights predict the same average everywhere. |
| [11.2. Attention Pooling by Similarity · 09](../d2l-attention-pooling/briefs.md#figure-09) | The weight grid reveals whether predictions rely on nearby examples or spread weight over the whole training set. |
| [11.2. Attention Pooling by Similarity · 10](../d2l-attention-pooling/briefs.md#figure-10) | The weight grid reveals whether predictions rely on nearby examples or spread weight over the whole training set. |
| [11.2. Attention Pooling by Similarity · 11](../d2l-attention-pooling/briefs.md#figure-11) | The weight grid reveals whether predictions rely on nearby examples or spread weight over the whole training set. |
| [11.2. Attention Pooling by Similarity · 12](../d2l-attention-pooling/briefs.md#figure-12) | The weight grid reveals whether predictions rely on nearby examples or spread weight over the whole training set. |
| [11.2. Attention Pooling by Similarity · 13](../d2l-attention-pooling/briefs.md#figure-13) | The same kernel can give a more responsive or a smoother fit depending on its bandwidth. |
| [11.2. Attention Pooling by Similarity · 14](../d2l-attention-pooling/briefs.md#figure-14) | The same kernel can give a more responsive or a smoother fit depending on its bandwidth. |
| [11.2. Attention Pooling by Similarity · 15](../d2l-attention-pooling/briefs.md#figure-15) | The same kernel can give a more responsive or a smoother fit depending on its bandwidth. |
| [11.2. Attention Pooling by Similarity · 16](../d2l-attention-pooling/briefs.md#figure-16) | The same kernel can give a more responsive or a smoother fit depending on its bandwidth. |
| [11.2. Attention Pooling by Similarity · 17](../d2l-attention-pooling/briefs.md#figure-17) | A narrower bandwidth concentrates normalized weight nearer each query and a broader one spreads it farther. |
| [11.2. Attention Pooling by Similarity · 18](../d2l-attention-pooling/briefs.md#figure-18) | A narrower bandwidth concentrates normalized weight nearer each query and a broader one spreads it farther. |
| [11.2. Attention Pooling by Similarity · 19](../d2l-attention-pooling/briefs.md#figure-19) | A narrower bandwidth concentrates normalized weight nearer each query and a broader one spreads it farther. |
| [11.2. Attention Pooling by Similarity · 20](../d2l-attention-pooling/briefs.md#figure-20) | A narrower bandwidth concentrates normalized weight nearer each query and a broader one spreads it farther. |
