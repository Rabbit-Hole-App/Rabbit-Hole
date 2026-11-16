# Code-explain calibration (claude-sonnet-5-5, nanoGPT 3adf61e, 2026-11-15T23:31:11.306Z)

8/13 rows pass, cost US$0.4406

| # | question | goal | result | validator | first-try errors | failed checks | tokens in / out | USD | figure | a reader still checks |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | how does attention hide later tokens? | none | pass | first try |  |  | 7891 / 1795 | 0.0359 |  | matches the section 5c example in structure; BRIEF symbol-free; trace at DETAILED only |
| 2 | how do my --flags end up changing train.py? | none | FAIL | first try |  | numbers in Brief and Standard come from the code (77) | 7433 / 1395 | 0.0207 |  | BRIEF says in plain words that it rewrites the script's settings before training starts |
| 3 | why does the output start with my --start text? | none | pass | first try |  |  | 7511 / 1498 | 0.0219 |  | DETAILED trace shows the prompt tokens prepended |
| 4 | what does meta.pkl contain and who reads it? | none | FAIL | after 2 tries | depths.detailed needs a trace: one concrete input and its steps, or the control flow of one call when there is no arithmetic | firstTry; numbers in Brief and Standard come from the code (138) | 17735 / 2967 | 0.0489 |  | mentioned holds sample.py's meta load line; no invented keys |
| 5 | when is ckpt.pt written? | none | pass | first try |  |  | 7505 / 1281 | 0.0197 |  | both conditions from the code; first possible save at step 250 with the config's eval_interval |
| 6 | why are the embedding and output weights the same? | none | FAIL | after 2 tries | depths.brief is missing; depths.standard is missing; depths.detailed is missing | firstTry | 16471 / 3475 | 0.0515 |  | DETAILED gives the stated reason only if the code's comment says it |
| 7 | how does the learning rate change over training? | none | pass | first try |  |  | 7251 / 1246 | 0.0189 |  | three phases in run order; the trace uses the config's numbers |
| 8 | can the model see the future? | none | pass | first try |  |  | 7887 / 1780 | 0.0255 |  | the correction is the right one: a position sees only earlier ones |
| 9 | how fast is this on my GPU? | none | pass | first try |  |  | 9224 / 1186 | 0.0222 |  | STANDARD ends with one sentence saying the code cannot answer, and what it would need |
| 10 | what does compile do here? | none | pass | first try |  |  | 7123 / 1413 | 0.0203 |  | names the compile line elsewhere; describes no behaviour it was not shown |
| 11 | what do these settings do? | use_codebase | FAIL | after 2 tries | depths.detailed needs a trace: one concrete input and its steps, or the control flow of one call when there is no arithmetic | firstTry; numbers in Brief and Standard come from the code (0.5) | 17115 / 3817 | 0.066 |  | one suggestion is a knob to try; BRIEF has the same structure as row 13 |
| 12 | what do these settings do? | debug_behavior | FAIL | after 2 tries | depths.detailed needs a trace: one concrete input and its steps, or the control flow of one call when there is no arithmetic | firstTry | 17377 / 4021 | 0.0686 |  | one suggestion is a way to confirm a cause; facts identical to row 11 |
| 13 | what do these settings do? | none | pass | first try |  |  | 7309 / 1403 | 0.0205 |  | the neutral reading; rows 11-13 agree on every fact |

Rows 11-13 together: pass BRIEF has the same sentence count in rows 11 and 13; pass the suggestions differ between the three goals; pass Standard differs between the goals (emphasis)

