# Blueprint MVP 2: the 13 trees prompts through the live blueprint design kind (brief 40)

Made by `scripts/interact/blueprint-live-collect.mjs` from the job records of the run on the local interactive stack (8879), Deep, one run per prompt, Gemini 4 Hydrogen at high. Seconds and cost are of the whole design phase (quantities call, blueprint call and the correction when there was one). Copied from each blueprint; nothing is judged. Each prompt's record, as the print command shows it (`--full`), is `<id>.txt`.

| Id | Passed, or the first problem | Controls | Main picture part types | Graph (x and lines) | Seconds | Cost |
|---|---|---|---|---|---|---|
| ml-trees-decision-regions | passed (first answer) | t1 (number), t2 (number), t3 (number) | line, dot | x: t1; lines: root_cut, leaf_cuts | 122.349 | $0.2440 |
| ml-trees-gini-vs-entropy | passed (first answer) | p (number) | line, dot, trace | x: p; lines: entropy_curve, scaled_curve, gini_curve | 108.517 | $0.2027 |
| ml-trees-gini-split | passed (first answer) | left_b (number) | label, arrow, dot, line | x: left_b; lines: left_branch, right_branch, gain | 81.105 | $0.1802 |
| ml-trees-threshold-search | passed (first answer) | class_shift (number), probe_x (number) | line, dot, trace, arrow | x: time; lines: split | 153.329 | $0.2990 |
| ml-trees-grown-tree | passed (after correction) | x1 (number), x2 (number), t_root (number) | arrow, line, trace, dot, label | x: x1; lines: leaf | 123.129 | $0.2690 |
| ml-trees-depth-overfit | passed (first answer) | noise_level (number), sample_size (number) | line, dot, arrow | x: time; lines: held_out, training, variance | 144.764 | $0.2402 |
| ml-trees-cost-complexity-pruning | passed (first answer) | noise_rate (number) | line, dot | x: time; lines: train, test | 208.873 | $0.3537 |
| ml-trees-regression-step-fit | passed (after correction) | depth (number), x_query (number), noise_sd (number) | line, trace, dot, arrow | x: depth; lines: tree_fit | 163.354 | $0.2954 |
| ml-trees-bootstrap-roots | `math.outputs` has 34 entries; at most 24. | N (number), seed (number) | line, arrow | x: time; lines: unique, repeated, oob | 170.571 | $0.3400 |
| ml-trees-bootstrap-coverage | passed (first answer) | n_rows (number) | label, line, dot | x: time; lines: included, theory, duplicate | 101.121 | $0.2081 |
| ml-trees-majority-vote | passed (first answer) | num_trees (number), tree_correlation (number) | line, label, dot | x: time; lines: single_tree, forest | 100.555 | $0.1776 |
| ml-trees-forest-size-accuracy | passed (first answer) | n_trees (number) | line, label, trace, dot | x: n_trees; lines: forest | 93.122 | $0.1644 |
| ml-trees-feature-importance | passed (first answer) | noise_cardinality (number), tree_depth (number), signal_strength (number) | line, label, arrow, dot, trace | x: tree_depth; lines: noise, signal, signal | 123.322 | $0.2436 |

Prompts: 13. Passed the light checker: 12. Total cost: $3.2180. Total seconds of the design phases: 1694.1.

## Failures

- ml-trees-bootstrap-roots blueprint: schema_mismatch: The structured result does not match its schema: $.math.code: longer than 3000 (the provider answered; the answer was refused before the checks)
