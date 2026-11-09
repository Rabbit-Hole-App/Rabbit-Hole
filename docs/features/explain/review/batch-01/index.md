# Review batch 01

Ten diagram-only prompts, Balanced depth, one run each, on the clean-up build (explain/prompt-cleanup-116 @ 76d4486c6: Gemini 3.5 Flash Lite primary, planner on, clean-up prompt, server corrections). Nothing regenerated or edited: what is here is what the pipeline produced. Generated 2026-11-09 (PT evening of 2026-11-08).

| # | Prompt | Expected shape | Planned -> drawn | References | Repairs / corrections | Time, tokens (in/out), card size |
|---|---|---|---|---|---|---|
| 01 | [how does public-key encryption work?](01-public-key-encryption/card.md) | sequence: two parties, public and private keys, encrypt / decrypt messages | sequence -> sequence | shape-sequence | repaired (1 invalid); corrections: simplified_sequence | 5533 ms (model 4640), 6351/724 tok, 440x651 px |
| 02 | [how does a hash table work?](02-hash-table/card.md) | transformation or flow: key -> hash function -> bucket, with a collision | flow -> flow | shape-flow | clean | 3013 ms (model 2857), 3020/710 tok, 440x1030 px |
| 03 | [how does positional encoding work in a transformer?](03-positional-encoding/card.md) | coordinate-plot: two or three sinusoids over position; tensor strip optional | transformation -> transformation | shape-transformation | clean | 2474 ms (model 2314), 3022/455 tok, 440x950 px |
| 04 | [how does k-means clustering work?](04-k-means/card.md) | coordinate-plot scatter: points, centroids, one re-assignment step | cycle -> cycle | shape-cycle | clean | 2107 ms (model 1968), 2924/228 tok, 440x772 px |
| 05 | [how do supply and demand set a price?](05-supply-and-demand/card.md) | coordinate-plot: supply and demand lines crossing at the equilibrium, annotated point | coordinate-plot -> coordinate-plot | shape-coordinate-plot | clean | 3218 ms (model 3051), 3037/553 tok, 440x904 px |
| 06 | [what is Big-O notation?](06-big-o/card.md) | coordinate-plot: growth curves O(1), O(log n), O(n), O(n^2); or comparison | coordinate-plot -> coordinate-plot | shape-coordinate-plot | clean | 3724 ms (model 3308), 3033/511 tok, 440x1019 px |
| 07 | [how does a bill become law in the United States?](07-bill-becomes-law/card.md) | flow with decisions: committee, both chambers, veto, override | flow -> flow | shape-flow | clean | 3253 ms (model 2988), 3028/838 tok, 440x1212 px |
| 08 | [how does the call stack work during recursion?](08-call-stack/card.md) | layers or block-stack: frames pushed and popped, base case | tree|layers (offered tree|layers) -> tree | shape-tree | clean | 2519 ms (model 2161), 2985/424 tok, 440x673 px |
| 09 | [how does a database index speed up a query?](09-database-index/card.md) | tree (B-tree) or comparison: scan vs index lookup | tree -> tree | shape-tree | repaired (1 invalid) | 4878 ms (model 4714), 6350/987 tok, 440x797 px |
| 10 | [how does a confusion matrix work?](10-confusion-matrix/card.md) | matrix: actual vs predicted, TP/FP/FN/TN, with precision and recall derived | matrix -> matrix | shape-matrix | clean | 2692 ms (model 2480), 2944/251 tok, 440x676 px |

Total cost US$0.0252. Pictures: 0 of 10.
