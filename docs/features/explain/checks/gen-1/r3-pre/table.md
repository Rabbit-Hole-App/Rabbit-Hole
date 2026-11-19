| cell | depth | prompt (cut) | planner kind (REF run) | reference | reference kind | exact | REF delivered | planner p(own kind) PLAN run | top 3 | PLAN delivered | PLAN honest failure / repairs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | balanced | What happens to a skewed distribution when we ta | histogram | ml-raw-log-distributions | comparison | false | comparison | n/a | not run | not run | not run |
| 2 | balanced | How does Bayesian optimization decide which sett | cycle | ml-bayesian-acquisition-choice | matrix | true | matrix | n/a | not run | not run | not run |
| 3 | balanced | How does successive halving decide which trials  | tree | ml-successive-halving-rounds | matrix | true | matrix | n/a | not run | not run | not run |
| 4 | balanced | how does attention work in a transformer? | token-links | ml-transformer-attention | matrix | true | matrix | n/a | not run | not run | not run |
| 5 | balanced | How do attention scores turn into weights? | transformation | ml-transformer-attention-softmax | token-links | true | token-links | n/a | not run | not run | not run |
| 6 | balanced | How does the transformer decoder avoid looking a | token-links | ml-transformer-causal-mask | heatmap | true | heatmap | n/a | not run | not run | not run |
| 7 | balanced | Why does a transformer use more than one attenti | token-links | ml-transformer-parallel-attention-heads-single | comparison | true | bar-chart | n/a | not run | not run | not run |
| 8 | balanced | How does a transformer get a match score between | token-links | ml-transformer-scaled-attention-scores | matrix | true | matrix | n/a | not run | not run | not run |
| 9 | balanced | How does a transformer mix the word values after | token-links | ml-transformer-weighted-values | block-stack | true | block-stack | n/a | not run | not run | not run |
| 10 | balanced | How does a transformer get query, key and value  | tensor | ml-transformer-qkv-projections | transformation | true | transformation | n/a | not run | not run | not run |
| 11 | detailed | how does cross-validation detect overfitting? | bar-chart | knn-k-validation | null | null | coordinate-plot | n/a | not run | not run | not run |
| 12 | detailed | How do attention scores turn into weights? | transformation | ml-transformer-attention-softmax | token-links | true | token-links | n/a | not run | not run | not run |
| 13 | detailed | How does the transformer decoder avoid looking a | token-links | ml-transformer-causal-mask | heatmap | true | heatmap | n/a | not run | not run | not run |
| 14 | detailed | Why does a transformer use more than one attenti | token-links | ml-transformer-parallel-attention-heads-single | comparison | true | bar-chart | n/a | not run | not run | not run |
| 15 | detailed | How does a transformer get a match score between | token-links | ml-transformer-scaled-attention-scores | matrix | true | matrix | n/a | not run | not run | not run |
| 16 | detailed | How does a transformer mix the word values after | token-links | ml-transformer-weighted-values | block-stack | true | block-stack | n/a | not run | not run | not run |
| 17 | balanced | why does a bootstrap sample contain only about 6 | sample-set | ml-trees-bootstrap-coverage | coordinate-plot | true | coordinate-plot | n/a | not run | not run | not run |
| 18 | balanced | compare impurity-based feature importance with p | comparison | ml-trees-feature-importance | bar-chart | true | bar-chart | n/a | not run | not run | not run |
| 19 | balanced | how do I compute the Gini impurity on both sides | tree | ml-trees-gini-split | matrix | true | matrix | n/a | not run | not run | not run |
| 20 | balanced | How does a transformer turn scores into a guess  | flow | ml-transformer-vocabulary-softmax | bar-chart | true | bar-chart | n/a | not run | not run | not run |
| 21 | balanced | How does next-token training compare a probabili | comparison | ml-transformer-one-hot-target | matrix | true | matrix | n/a | not run | not run | not run |
| 22 | balanced | How does rescaling a personality score help expl | coordinate-plot | ml-word2vec-trait-rescale | number-line | true | number-line | n/a | not run | not run | not run |
| 23 | brief | How do IQR fences flag outliers in a box plot? U | flow | iqr-fences-and-outliers | null | null | box-plot | n/a | not run | not run | not run |
| 24 | brief | Show a box plot of exam scores 52, 55, 61, 64, 6 | flow | iqr-fences-and-outliers | null | null | box-plot | n/a | not run | not run | not run |
| 25 | brief | How do I read a box plot of delivery times 12, 1 | flow | iqr-fences-and-outliers | null | null | box-plot | n/a | not run | not run | not run |
| 26 | brief | Explain quartiles, the median and whiskers on a  | flow | iqr-fences-and-outliers | null | null | box-plot | n/a | not run | not run | not run |
| 27 | brief | What does the 1.5 x IQR rule do to a box plot of | transformation | iqr-fences-and-outliers | null | null | box-plot | n/a | not run | not run | not run |
| 28 | balanced | How can I compare encoder self-attention heatmap | comparison | d2l-transformer-encoder-head-weight-grids | heatmap | true | heatmap+comparison | n/a | not run | not run | not run |
| 29 | balanced | Can you show the numbers when forward diffusion  | transformation | ml-stable-diffusion-forward-noise | heatmap | true | heatmap | n/a | not run | not run | not run |
