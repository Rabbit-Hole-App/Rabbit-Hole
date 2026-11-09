# Review batch 01 after (regenerated on the 117 candidate)

Ten diagram-only prompts, Balanced depth, one run each, regenerated on the 117 candidate (7f1d0f562586e1bb358387085c0c073cb3bd1ea8). Nothing edited: what is here is what the pipeline produced. Compare with ../batch-01 (the clean-up build 76d4486c6).

| # | Prompt | Expected shape | Planned -> drawn | References | Repairs / corrections | Time, tokens (in/out), card size |
|---|---|---|---|---|---|---|
| 01 | [how does public-key encryption work?](01-public-key-encryption/card.md) | sequence: two parties, public and private keys, encrypt / decrypt messages | sequence -> sequence | shape-sequence | clean | 2483 ms (model 2186), 3512/493 tok, 440x746 px |
| 02 | [how does a hash table work?](02-hash-table/card.md) | transformation or flow: key -> hash function -> bucket, with a collision | flow -> flow | shape-flow | clean | 2553 ms (model 2447), 3523/489 tok, 440x747 px |
| 03 | [how does positional encoding work in a transformer?](03-positional-encoding/card.md) | coordinate-plot: two or three sinusoids over position; tensor strip optional | coordinate-plot -> coordinate-plot | shape-coordinate-plot | clean | 3156 ms (model 3050), 3603/667 tok, 440x969 px |
| 04 | [how does k-means clustering work?](04-k-means/card.md) | coordinate-plot scatter: points, centroids, one re-assignment step | coordinate-plot -> coordinate-plot | shape-coordinate-plot,kmeans-centroid-update,clustering-elbow-silhouette | clean | 3427 ms (model 3080), 4013/738 tok, 440x1159 px |
| 05 | [how do supply and demand set a price?](05-supply-and-demand/card.md) | coordinate-plot: supply and demand lines crossing at the equilibrium, annotated point | coordinate-plot -> coordinate-plot | shape-coordinate-plot | clean | 3425 ms (model 3187), 3603/633 tok, 440x1056 px |
| 06 | [what is Big-O notation?](06-big-o/card.md) | coordinate-plot: growth curves O(1), O(log n), O(n), O(n^2); or comparison | coordinate-plot -> coordinate-plot | shape-coordinate-plot,big-o-growth-rates | clean | 3666 ms (model 3511), 4179/972 tok, 440x1057 px |
| 07 | [how does a bill become law in the United States?](07-bill-becomes-law/card.md) | flow with decisions: committee, both chambers, veto, override | flow -> flow | shape-flow | clean; corrections: one_branch_decision | 2904 ms (model 2504), 3531/648 tok, 440x1036 px |
| 08 | [how does the call stack work during recursion?](08-call-stack/card.md) | layers or block-stack: frames pushed and popped, base case | layers -> layers | shape-layers,recursion-factorial-unwind | clean | 3320 ms (model 3194), 3757/770 tok, 440x1149 px |
| 09 | [how does a database index speed up a query?](09-database-index/card.md) | tree (B-tree) or comparison: scan vs index lookup | tree -> tree | shape-tree,tree-btree-lookup | clean | 2893 ms (model 2744), 3734/679 tok, 440x814 px |
| 10 | [how does a confusion matrix work?](10-confusion-matrix/card.md) | matrix: actual vs predicted, TP/FP/FN/TN, with precision and recall derived | matrix -> matrix | shape-matrix | clean | 2882 ms (model 2752), 3489/479 tok, 440x819 px |

Total cost US$0.0275. Pictures: 0 of 10.
