# Code-explain calibration (claude-sonnet-5-5, nanoGPT 3adf61e, 2026-11-15T23:19:37.456Z)

5/13 rows pass, cost US$0.5061

| # | question | goal | result | validator | first-try errors | failed checks | tokens in / out | USD | figure | a reader still checks |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | how does attention hide later tokens? | none | FAIL | after 2 tries | depths.detailed needs a trace: one concrete input and its steps, or the control flow of one call when there is no arithmetic | firstTry | 16844 / 2694 | 0.0547 |  | matches the section 5c example in structure; BRIEF symbol-free; trace at DETAILED only |
| 2 | how do my --flags end up changing train.py? | none | FAIL | after 2 tries | depths.detailed needs a trace: one concrete input and its steps, or the control flow of one call when there is no arithmetic | firstTry; numbers in Brief and Standard come from the code (77) | 16160 / 3038 | 0.0467 |  | BRIEF says in plain words that it rewrites the script's settings before training starts |
| 3 | why does the output start with my --start text? | none | FAIL | after 2 tries | depths.detailed needs a trace: one concrete input and its steps, or the control flow of one call when there is no arithmetic | firstTry | 15993 / 2505 | 0.041 |  | DETAILED trace shows the prompt tokens prepended |
| 4 | what does meta.pkl contain and who reads it? | none | FAIL | after 2 tries | depths.detailed needs a trace: one concrete input and its steps, or the control flow of one call when there is no arithmetic | firstTry; numbers in Brief and Standard come from the code (138) | 17600 / 2941 | 0.0486 |  | mentioned holds sample.py's meta load line; no invented keys |
| 5 | when is ckpt.pt written? | none | FAIL | after 2 tries | depths.detailed needs a trace: one concrete input and its steps, or the control flow of one call when there is no arithmetic | firstTry | 16188 / 2925 | 0.0456 |  | both conditions from the code; first possible save at step 250 with the config's eval_interval |
| 6 | why are the embedding and output weights the same? | none | pass | first try |  |  | 7217 / 1343 | 0.0199 |  | DETAILED gives the stated reason only if the code's comment says it |
| 7 | how does the learning rate change over training? | none | FAIL | after 2 tries | depths.detailed needs a trace: one concrete input and its steps, or the control flow of one call when there is no arithmetic | firstTry | 16140 / 3508 | 0.0513 |  | three phases in run order; the trace uses the config's numbers |
| 8 | can the model see the future? | none | FAIL | no card | depths.detailed needs a trace: one concrete input and its steps, or the control flow of one call when there is no arithmetic | valid (no card); firstTry | 16955 / 2897 | 0.0469 |  | the correction is the right one: a position sees only earlier ones |
| 9 | how fast is this on my GPU? | none | pass | first try |  |  | 9123 / 1305 | 0.0233 |  | STANDARD ends with one sentence saying the code cannot answer, and what it would need |
| 10 | what does compile do here? | none | pass | first try |  |  | 7022 / 932 | 0.0154 |  | names the compile line elsewhere; describes no behaviour it was not shown |
| 11 | what do these settings do? | use_codebase | pass | first try |  |  | 7484 / 1644 | 0.0337 |  | one suggestion is a knob to try; BRIEF has the same structure as row 13 |
| 12 | what do these settings do? | debug_behavior | pass | first try |  |  | 7520 / 1675 | 0.0341 |  | one suggestion is a way to confirm a cause; facts identical to row 11 |
| 13 | what do these settings do? | none | FAIL | after 2 tries | depths.detailed needs a trace: one concrete input and its steps, or the control flow of one call when there is no arithmetic | firstTry | 15864 / 2916 | 0.0449 |  | the neutral reading; rows 11-13 agree on every fact |

Rows 11-13 together: pass BRIEF has the same sentence count in rows 11 and 13; pass the suggestions differ between the three goals; pass Standard differs between the goals (emphasis)

