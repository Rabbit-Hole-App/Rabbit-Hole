# Brief 27 task 3: 12 ML prompts at Brief on 127.0.0.1:8878 (state: all 12 ran, all 12 ended design_gap)

Branch design/fast-path, base 6d99e18f4. Launcher: `C:sspecinteract-realopen-ml.cmd` (canvas `ml-canvas.json`). Cards are failed-card screenshots `mNN-failed.png`; job records `mNN-job.json`; rows `results.jsonl`.

m01 picked stepper-states (0.97) and the fill was refused; m02-m12 stopped at the pick (reason below_threshold, no model call). `pick` shows the top probability family where the pick returned no family.

| id | prompt | pick | fill | build | prompt-to-card ms | USD |
|---|---|---|---|---|---|---|
| m01 | how does merge sort work? | stepper-states 0.97 | refused: schema_mismatch: The structured result does not match its schema: $.composition: matches 0 of the exclusive alternatives, not exactly one; closest alternative: $.composition.data.variants[0].regions: fewer than 7 items; $.composition.data.variants[0].states[0].readouts: more than 0 items; $.composit | This kind of scene isn't supported yet. | none (no card) | 0.010628 |
| m02 | what is gradient descent? | none (below_threshold; top stepper-states 0.83, conf 0.77) | not run (pick below threshold) | This kind of scene isn't supported yet. | none (no card) | 0 |
| m03 | how does k-means clustering work? | none (below_threshold; top stepper-states 0.95, conf 0.93) | not run (pick below threshold) | This kind of scene isn't supported yet. | none (no card) | 0 |
| m04 | how does the call stack work during recursion? | none (below_threshold; top stepper-states 0.66, conf 0.55) | not run (pick below threshold) | This kind of scene isn't supported yet. | none (no card) | 0 |
| m05 | how does a hash table work? | none (none; top none 0.67, conf 0.56) | not run (pick below threshold) | This kind of scene isn't supported yet. | none (no card) | 0 |
| m06 | how does tokenization work? | none (below_threshold; top stepper-states 0.86, conf 0.81) | not run (pick below threshold) | This kind of scene isn't supported yet. | none (no card) | 0 |
| m07 | how does RAG work? | none (below_threshold; top stepper-states 0.77, conf 0.69) | not run (pick below threshold) | This kind of scene isn't supported yet. | none (no card) | 0 |
| m08 | how does KV caching speed up inference? | none (none; top none 0.56, conf 0.41) | not run (pick below threshold) | This kind of scene isn't supported yet. | none (no card) | 0 |
| m09 | How does a transformer turn the words in a sentence into embeddings? | none (none; top none 0.7, conf 0.6) | not run (pick below threshold) | This kind of scene isn't supported yet. | none (no card) | 0 |
| m10 | how does a decision tree search for the best threshold on one feature? | none (below_threshold; top stepper-states 0.53, conf 0.37) | not run (pick below threshold) | This kind of scene isn't supported yet. | none (no card) | 0 |
| m11 | how does cross-validation detect overfitting? | none (below_threshold; top stepper-states 0.51, conf 0.35) | not run (pick below threshold) | This kind of scene isn't supported yet. | none (no card) | 0 |
| m12 | how does public-key encryption work? | none (below_threshold; top stepper-states 0.83, conf 0.77) | not run (pick below threshold) | This kind of scene isn't supported yet. | none (no card) | 0 |
