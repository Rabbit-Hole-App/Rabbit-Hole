# Code-explain calibration (claude-sonnet-5-5, nanoGPT 3adf61e, 2026-11-15T20:34:45.963Z)

5/13 rows pass, cost US$0.3166

| # | question | goal | result | validator | failed checks | tokens in / out | USD | figure | a reader still checks |
|---|---|---|---|---|---|---|---|---|---|
| 1 | how does attention hide later tokens? | none | FAIL | first try | detailed has a trace | 7583 / 1827 | 0.0354 |  | matches the section 5c example in structure; BRIEF symbol-free; trace at DETAILED only |
| 2 | how do my --flags end up changing train.py? | none | pass | first try |  | 7075 / 1710 | 0.0236 |  | BRIEF says in plain words that it rewrites the script's settings before training starts |
| 3 | why does the output start with my --start text? | none | FAIL | first try | detailed has a trace | 7072 / 1161 | 0.0181 |  | DETAILED trace shows the prompt tokens prepended |
| 4 | what does meta.pkl contain and who reads it? | none | FAIL | first try | mentioned names sample.py | 7577 / 1194 | 0.0195 |  | mentioned holds sample.py's meta load line; no invented keys |
| 5 | when is ckpt.pt written? | none | FAIL | first try | brief names no symbol the question did not (always_save_checkpoint); mentioned cites the config (eval_interval) | 6815 / 1590 | 0.0219 | binary-cross-entropy-loss | both conditions from the code; first possible save at step 250 with the config's eval_interval |
| 6 | why are the embedding and output weights the same? | none | pass | first try |  | 7010 / 1218 | 0.0186 |  | DETAILED gives the stated reason only if the code's comment says it |
| 7 | how does the learning rate change over training? | none | FAIL | first try | detailed has a trace; mentioned cites the config | 6667 / 1187 | 0.0176 | learning-rate-schedules | three phases in run order; the trace uses the config's numbers |
| 8 | can the model see the future? | none | pass | first try |  | 7579 / 1138 | 0.0189 |  | the correction is the right one: a position sees only earlier ones |
| 9 | how fast is this on my GPU? | none | pass | first try |  | 8647 / 1143 | 0.0211 |  | STANDARD ends with one sentence saying the code cannot answer, and what it would need |
| 10 | what does compile do here? | none | FAIL | after 2 tries | firstTry | 14864 / 2342 | 0.0379 |  | names the compile line elsewhere; describes no behaviour it was not shown |
| 11 | what do these settings do? | use_codebase | FAIL | first try | numbers in Brief and Standard come from the code (0.5 0.2 1.5) | 7088 / 1527 | 0.0316 | tree-folder-hierarchy | one suggestion is a knob to try; BRIEF has the same structure as row 13 |
| 12 | what do these settings do? | debug_behavior | FAIL | first try | Standard speaks of what goes wrong with a bad value | 7061 / 1342 | 0.0297 | tree-folder-hierarchy | one suggestion is a way to confirm a cause; facts identical to row 11 |
| 13 | what do these settings do? | none | pass | first try |  | 6812 / 1667 | 0.0227 | tree-folder-hierarchy | the neutral reading; rows 11-13 agree on every fact |

Rows 11-13 together: pass BRIEF has the same sentence count in rows 11 and 13; pass the suggestions differ between the three goals; pass Standard differs between the goals (emphasis)

