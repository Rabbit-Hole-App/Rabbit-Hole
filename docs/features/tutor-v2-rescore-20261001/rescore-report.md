## Old (exact-script) vs semantic-equivalence accuracy

| arm | actions old | actions new | evidence old | evidence new | route old | route new | evaluation old | evaluation new | turns passing old | turns passing new |
|---|---|---|---|---|---|---|---|---|---|---|
| A | 41/148 (27.7%) | 101/142 (71.1%) | 58/130 (44.6%) | 63/124 (50.8%) | 31/94 (33.0%) | 52/94 (55.3%) | 74/100 (74.0%) | 94/94 (100.0%) | 22/154 | 70/154 |
| B | 46/148 (31.1%) | 105/142 (73.9%) | 64/130 (49.2%) | 68/124 (54.8%) | 37/94 (39.4%) | 57/94 (60.6%) | 74/100 (74.0%) | 94/94 (100.0%) | 24/154 | 70/154 |
| D | 33/148 (22.3%) | 96/142 (67.6%) | 66/130 (50.8%) | 69/124 (55.6%) | 37/94 (39.4%) | 56/94 (59.6%) | 76/100 (76.0%) | 94/94 (100.0%) | 19/154 | 68/154 |
| E | 45/148 (30.4%) | 105/142 (73.9%) | 59/130 (45.4%) | 65/124 (52.4%) | 29/94 (30.9%) | 51/94 (54.3%) | 77/100 (77.0%) | 94/94 (100.0%) | 25/154 | 72/154 |
| F | 38/148 (25.7%) | 102/142 (71.8%) | 63/130 (48.5%) | 67/124 (54.0%) | 36/94 (38.3%) | 55/94 (58.5%) | 74/100 (74.0%) | 94/94 (100.0%) | 23/154 | 71/154 |

Not applicable under rule F (scripted evaluator fault did not happen): A 6, B 6, D 6, E 6, F 6 turn instances (B-jev-error and B-larger-error, 3 repetitions each).
Evidence states not reconstructable (E3 falls back to E1/E2): A 3, B 3, D 2, E 3, F 2.

## Turns that changed (per arm)

### A: 42 fail -> pass, 0 pass -> fail, 6 not applicable

- A-r1 GT-02#0: evaluation §3: larger ran as the escalation policy decided (contradiction); route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- A-r1 GT-03#0: evaluation §3: larger ran as the escalation policy decided (misconception)
- A-r1 GT-03#1: evaluation §3: larger ran as the escalation policy decided (misconception)
- A-r1 GT-03#2: evaluation §3: larger ran as the escalation policy decided (gap); actions A5 allowed extra: [respond_text, ask_question] vs [respond_text] (extra ask_question)
- A-r1 GT-04#0: actions A5 allowed extra: [respond_text, show_authored_card] vs [show_authored_card, respond_text]
- A-r1 GT-11#0: evaluation §3: larger ran as the escalation policy decided (contradiction); actions A5 allowed extra: [respond_text, ask_question] vs [respond_text] (extra ask_question)
- A-r1 GT-12#0: route R2: uncertain_unsettled ~ uncertain
- A-r1 B-misconception-once#0: route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- A-r1 B-misconception-repeated#0: route R2: uncertain_unsettled ~ uncertain
- A-r1 B-misconception-unsure-second#0: route R2: uncertain_unsettled ~ uncertain
- A-r1 B-question#0: evaluation §3: larger ran as the escalation policy decided (gap); actions A5 allowed extra: [respond_text, ask_question] vs [respond_text] (extra ask_question)
- A-r1 D7-prompted-one-idea#1: actions A5 allowed extra: [respond_text, ask_question] vs [respond_text] (extra ask_question)
- A-r2 GT-01#0: evidence E2 unsettled = settled, E1 multiplicity: [attention/looks-back-never-ahead:pass?] vs [attention/looks-back-never-ahead:pass, attention/looks-back-never-ahead:pass]; route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text, suggest_depth, show_authored_card] (extra ask_question) (replaced respond_text, suggest_depth, show_authored_card)
- A-r2 GT-02#0: evaluation §3: larger ran as the escalation policy decided (misconception); route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- A-r2 GT-03#2: actions A5 allowed extra: [respond_text, ask_question] vs [respond_text] (extra ask_question)
- A-r2 GT-04#0: actions A5 allowed extra: [respond_text, show_authored_card] vs [show_authored_card, respond_text]
- A-r2 GT-11#0: evaluation §3: larger ran as the escalation policy decided (contradiction); route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- A-r2 GT-12#0: evaluation §3: larger ran as the escalation policy decided (contradiction); route R2: uncertain_unsettled ~ uncertain
- A-r2 B-misconception-once#0: route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- A-r2 B-misconception-repeated#0: route R2: uncertain_unsettled ~ uncertain
- A-r2 B-misconception-unsure-second#0: route R2: uncertain_unsettled ~ uncertain
- A-r2 B-question#0: evaluation §3: larger ran as the escalation policy decided (gap); actions A5 allowed extra: [respond_text, ask_question] vs [respond_text] (extra ask_question)
- A-r2 D7-prompted-one-idea#1: evidence E2 unsettled = settled: [attention-output/weighted-average:pass?] vs [attention-output/weighted-average:pass]; route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- A-r3 GT-01#0: evidence E2 unsettled = settled, E1 multiplicity: [attention/looks-back-never-ahead:pass?] vs [attention/looks-back-never-ahead:pass, attention/looks-back-never-ahead:pass]; route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text, suggest_depth, show_authored_card] (extra ask_question) (replaced respond_text, suggest_depth, show_authored_card)
- A-r3 GT-02#0: evaluation §3: larger ran as the escalation policy decided (contradiction); route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- A-r3 GT-03#0: evaluation §3: larger ran as the escalation policy decided (misconception)
- A-r3 GT-03#1: evaluation §3: larger ran as the escalation policy decided (misconception)
- A-r3 GT-03#2: actions A5 allowed extra: [respond_text, ask_question] vs [respond_text] (extra ask_question)
- A-r3 GT-04#0: actions A5 allowed extra: [respond_text, show_authored_card] vs [show_authored_card, respond_text]
- A-r3 GT-11#0: evaluation §3: larger ran as the escalation policy decided (contradiction); route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- A-r3 GT-12#0: route R2: uncertain_unsettled ~ uncertain
- A-r3 B-misconception-once#0: route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- A-r3 B-misconception-repeated#0: route R2: uncertain_unsettled ~ uncertain
- A-r3 B-misconception-unsure-second#0: route R2: uncertain_unsettled ~ uncertain
- A-r3 B-question#0: evaluation §3: larger ran as the escalation policy decided (gap); actions A5 allowed extra: [respond_text, ask_question] vs [respond_text] (extra ask_question)
- A-r3 D7-prompted-one-idea#1: evidence E2 unsettled = settled: [attention-output/weighted-average:pass?] vs [attention-output/weighted-average:pass]; route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- A-routine-r4 GT-04#0: actions A5 allowed extra: [respond_text, show_authored_card] vs [show_authored_card, respond_text]
- A-routine-r4 B-question#0: evaluation §3: larger ran as the escalation policy decided (gap)
- A-routine-r4 B-another-way#0: actions A5 allowed extra: [respond_text, ask_question, show_authored_card] vs [respond_text, show_authored_card] (extra ask_question)
- A-routine-r4 B-no-quiz#1: actions A5 allowed extra: [respond_text, suggest_dive] vs [respond_text] (extra suggest_dive)
- A-routine-r5 GT-04#0: actions A5 allowed extra: [respond_text, show_authored_card] vs [show_authored_card, respond_text]
- A-routine-r5 B-question#0: evaluation §3: larger ran as the escalation policy decided (gap); actions A5 allowed extra: [respond_text, ask_question] vs [respond_text] (extra ask_question)

### B: 40 fail -> pass, 0 pass -> fail, 6 not applicable

- B-r1 GT-01#0: evidence E2 unsettled = settled, E1 multiplicity: [attention/looks-back-never-ahead:pass?] vs [attention/looks-back-never-ahead:pass, attention/looks-back-never-ahead:pass]; route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text, suggest_depth, show_authored_card] (extra ask_question) (replaced respond_text, suggest_depth, show_authored_card)
- B-r1 GT-02#0: evaluation §3: larger ran as the escalation policy decided (contradiction); route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- B-r1 GT-03#1: evaluation §3: larger ran as the escalation policy decided (misconception)
- B-r1 GT-03#2: evaluation §3: larger ran as the escalation policy decided (misconception)
- B-r1 GT-04#0: actions A5 allowed extra: [respond_text, show_authored_card] vs [show_authored_card, respond_text]
- B-r1 GT-11#0: evaluation §3: larger ran as the escalation policy decided (contradiction); route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- B-r1 GT-12#0: evaluation §3: larger ran as the escalation policy decided (contradiction); route R2: uncertain_unsettled ~ uncertain
- B-r1 B-misconception-once#0: route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- B-r1 B-misconception-repeated#0: route R2: uncertain_unsettled ~ uncertain
- B-r1 B-misconception-unsure-second#0: route R2: uncertain_unsettled ~ uncertain
- B-r1 B-question#0: evaluation §3: larger ran as the escalation policy decided (gap)
- B-r1 B-no-quiz#1: actions A5 allowed extra: [respond_text, suggest_dive] vs [respond_text] (extra suggest_dive)
- B-r1 D7-prompted-one-idea#1: evidence E2 unsettled = settled: [attention-output/weighted-average:pass?] vs [attention-output/weighted-average:pass]; route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- B-r2 GT-01#0: evidence E2 unsettled = settled, E1 multiplicity: [attention/looks-back-never-ahead:pass?] vs [attention/looks-back-never-ahead:pass, attention/looks-back-never-ahead:pass]; route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text, suggest_depth, show_authored_card] (extra ask_question) (replaced respond_text, suggest_depth, show_authored_card)
- B-r2 GT-02#0: evaluation §3: larger ran as the escalation policy decided (contradiction); route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- B-r2 GT-03#1: evaluation §3: larger ran as the escalation policy decided (misconception)
- B-r2 GT-03#2: actions A5 allowed extra: [respond_text, ask_question] vs [respond_text] (extra ask_question)
- B-r2 GT-04#0: actions A5 allowed extra: [respond_text, show_authored_card] vs [show_authored_card, respond_text]
- B-r2 GT-11#0: evaluation §3: larger ran as the escalation policy decided (contradiction); actions A5 allowed extra: [respond_text, ask_question] vs [respond_text] (extra ask_question)
- B-r2 B-misconception-once#0: route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- B-r2 B-misconception-repeated#0: route R2: uncertain_unsettled ~ uncertain
- B-r2 B-misconception-unsure-second#0: route R2: uncertain_unsettled ~ uncertain
- B-r2 B-question#0: evaluation §3: larger ran as the escalation policy decided (gap); actions A5 allowed extra: [respond_text, ask_question] vs [respond_text] (extra ask_question)
- B-r2 D7-prompted-one-idea#1: actions A5 allowed extra: [respond_text, ask_question] vs [respond_text] (extra ask_question)
- B-r3 GT-01#0: evidence E2 unsettled = settled, E1 multiplicity: [attention/looks-back-never-ahead:pass?] vs [attention/looks-back-never-ahead:pass, attention/looks-back-never-ahead:pass]; route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text, suggest_depth, show_authored_card] (extra ask_question) (replaced respond_text, suggest_depth, show_authored_card)
- B-r3 GT-03#1: evaluation §3: larger ran as the escalation policy decided (misconception)
- B-r3 GT-03#2: actions A5 allowed extra: [respond_text, ask_question] vs [respond_text] (extra ask_question)
- B-r3 GT-04#0: actions A5 allowed extra: [respond_text, show_authored_card] vs [show_authored_card, respond_text]
- B-r3 GT-11#0: evaluation §3: larger ran as the escalation policy decided (contradiction); route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- B-r3 GT-12#0: evaluation §3: larger ran as the escalation policy decided (contradiction); route R2: uncertain_unsettled ~ uncertain
- B-r3 B-misconception-once#0: route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- B-r3 B-misconception-repeated#0: route R2: uncertain_unsettled ~ uncertain
- B-r3 B-misconception-unsure-second#0: route R2: uncertain_unsettled ~ uncertain
- B-r3 B-question#0: evaluation §3: larger ran as the escalation policy decided (gap)
- B-r3 D7-prompted-one-idea#1: actions A5 allowed extra: [respond_text, ask_question] vs [respond_text] (extra ask_question)
- B-routine-r4 GT-04#0: actions A5 allowed extra: [respond_text, show_authored_card] vs [show_authored_card, respond_text]
- B-routine-r4 B-question#0: evaluation §3: larger ran as the escalation policy decided (gap); actions A5 allowed extra: [respond_text, ask_question] vs [respond_text] (extra ask_question)
- B-routine-r4 B-another-way#0: actions A5 allowed extra: [respond_text, ask_question, show_authored_card] vs [respond_text, show_authored_card] (extra ask_question)
- B-routine-r5 GT-04#0: actions A5 allowed extra: [respond_text, show_authored_card] vs [show_authored_card, respond_text]
- B-routine-r5 B-question#0: evaluation §3: larger ran as the escalation policy decided (gap); actions A5 allowed extra: [respond_text, ask_question] vs [respond_text] (extra ask_question)

### D: 43 fail -> pass, 0 pass -> fail, 6 not applicable

- D-r1 GT-01#0: evidence E2 unsettled = settled, E1 multiplicity: [attention/looks-back-never-ahead:pass?] vs [attention/looks-back-never-ahead:pass, attention/looks-back-never-ahead:pass]; route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text, suggest_depth, show_authored_card] (extra ask_question) (replaced respond_text, suggest_depth, show_authored_card)
- D-r1 GT-02#0: evaluation §3: larger ran as the escalation policy decided (misconception); route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- D-r1 GT-03#1: evaluation §3: larger ran as the escalation policy decided (gap)
- D-r1 GT-03#2: actions A5 allowed extra: [respond_text, ask_question] vs [respond_text] (extra ask_question)
- D-r1 GT-04#0: actions A5 allowed extra: [show_authored_card, respond_text] vs [show_authored_card, respond_text]
- D-r1 GT-11#0: evaluation §3: larger ran as the escalation policy decided (contradiction); route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- D-r1 GT-12#0: route R2: uncertain_unsettled ~ uncertain
- D-r1 B-misconception-once#0: route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- D-r1 B-misconception-repeated#0: route R2: uncertain_unsettled ~ uncertain
- D-r1 B-misconception-unsure-second#0: route R2: uncertain_unsettled ~ uncertain
- D-r1 B-question#0: evaluation §3: larger ran as the escalation policy decided (gap); actions A5 allowed extra: [respond_text, ask_question] vs [respond_text] (extra ask_question)
- D-r1 B-no-quiz#1: actions A5 allowed extra: [respond_text, suggest_dive] vs [respond_text] (extra suggest_dive)
- D-r1 B-invalid-actions#0: actions A5 allowed extra: [respond_text, show_authored_card, ask_question] vs [respond_text] (extra show_authored_card, ask_question)
- D-r1 D7-prompted-one-idea#1: actions A5 allowed extra: [respond_text, suggest_practice] vs [respond_text] (extra suggest_practice)
- D-r2 GT-01#0: evidence E2 unsettled = settled, E1 multiplicity: [attention/looks-back-never-ahead:pass?] vs [attention/looks-back-never-ahead:pass, attention/looks-back-never-ahead:pass]; route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text, suggest_depth, show_authored_card] (extra ask_question) (replaced respond_text, suggest_depth, show_authored_card)
- D-r2 GT-02#0: evaluation §3: larger ran as the escalation policy decided (contradiction); route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- D-r2 GT-03#2: evaluation §3: larger ran as the escalation policy decided (misconception)
- D-r2 GT-11#0: evaluation §3: larger ran as the escalation policy decided (contradiction); actions A5 allowed extra: [respond_text, ask_question] vs [respond_text] (extra ask_question)
- D-r2 GT-12#0: evaluation §3: larger ran as the escalation policy decided (contradiction); route R2: uncertain_unsettled ~ uncertain
- D-r2 B-misconception-once#0: route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- D-r2 B-misconception-repeated#0: route R2: uncertain_unsettled ~ uncertain
- D-r2 B-misconception-unsure-second#0: route R2: uncertain_unsettled ~ uncertain
- D-r2 B-question#0: evaluation §3: larger ran as the escalation policy decided (gap); actions A5 allowed extra: [respond_text, show_authored_card] vs [respond_text] (extra show_authored_card)
- D-r2 B-no-quiz#1: actions A5 allowed extra: [respond_text, suggest_dive] vs [respond_text] (extra suggest_dive)
- D-r2 B-invalid-actions#0: actions A5 allowed extra: [respond_text, show_authored_card, ask_question] vs [respond_text] (extra show_authored_card, ask_question)
- D-r2 D7-prompted-one-idea#1: actions A5 allowed extra: [respond_text, ask_question] vs [respond_text] (extra ask_question)
- D-r3 GT-01#0: evidence E2 unsettled = settled, E1 multiplicity: [attention/looks-back-never-ahead:pass?] vs [attention/looks-back-never-ahead:pass, attention/looks-back-never-ahead:pass]; route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text, suggest_depth, show_authored_card] (extra ask_question) (replaced respond_text, suggest_depth, show_authored_card)
- D-r3 GT-02#0: evaluation §3: larger ran as the escalation policy decided (contradiction); route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- D-r3 GT-03#1: evaluation §3: larger ran as the escalation policy decided (gap)
- D-r3 GT-03#2: actions A5 allowed extra: [respond_text, ask_question] vs [respond_text] (extra ask_question)
- D-r3 GT-11#0: evaluation §3: larger ran as the escalation policy decided (contradiction); actions A5 allowed extra: [respond_text, ask_question] vs [respond_text] (extra ask_question)
- D-r3 GT-12#0: route R2: uncertain_unsettled ~ uncertain
- D-r3 B-misconception-once#0: route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- D-r3 B-misconception-repeated#0: route R2: uncertain_unsettled ~ uncertain
- D-r3 B-misconception-unsure-second#0: route R2: uncertain_unsettled ~ uncertain
- D-r3 B-question#0: evaluation §3: larger ran as the escalation policy decided (gap); actions A5 allowed extra: [respond_text, ask_question] vs [respond_text] (extra ask_question)
- D-r3 B-no-quiz#1: actions A5 allowed extra: [respond_text, suggest_dive] vs [respond_text] (extra suggest_dive)
- D-r3 D7-prompted-one-idea#1: actions A5 allowed extra: [respond_text, suggest_practice] vs [respond_text] (extra suggest_practice)
- D-routine-r4 B-question#0: evaluation §3: larger ran as the escalation policy decided (gap); actions A5 allowed extra: [respond_text, ask_question] vs [respond_text] (extra ask_question)
- D-routine-r4 B-no-quiz#1: actions A5 allowed extra: [respond_text, suggest_dive] vs [respond_text] (extra suggest_dive)
- D-routine-r5 GT-04#0: actions A5 allowed extra: [show_authored_card, respond_text] vs [show_authored_card, respond_text]
- D-routine-r5 B-question#0: evaluation §3: larger ran as the escalation policy decided (gap); actions A5 allowed extra: [respond_text, ask_question] vs [respond_text] (extra ask_question)
- D-routine-r5 B-no-quiz#1: actions A5 allowed extra: [respond_text, suggest_dive] vs [respond_text] (extra suggest_dive)

### E: 41 fail -> pass, 0 pass -> fail, 6 not applicable

- E-r1 GT-01#0: evidence E2 unsettled = settled, E1 multiplicity: [attention/looks-back-never-ahead:pass?] vs [attention/looks-back-never-ahead:pass, attention/looks-back-never-ahead:pass]; route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text, suggest_depth, show_authored_card] (extra ask_question) (replaced respond_text, suggest_depth, show_authored_card)
- E-r1 GT-03#1: evaluation §3: larger ran as the escalation policy decided (gap)
- E-r1 GT-03#2: actions A5 allowed extra: [respond_text, ask_question] vs [respond_text] (extra ask_question)
- E-r1 GT-04#0: actions A5 allowed extra: [respond_text, show_authored_card] vs [show_authored_card, respond_text]
- E-r1 GT-11#0: evaluation §3: larger ran as the escalation policy decided (contradiction); route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- E-r1 GT-12#0: route R2: uncertain_unsettled ~ uncertain
- E-r1 B-misconception-once#0: route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- E-r1 B-misconception-repeated#0: route R2: uncertain_unsettled ~ uncertain
- E-r1 B-misconception-unsure-second#0: route R2: uncertain_unsettled ~ uncertain
- E-r1 B-question#0: evaluation §3: larger ran as the escalation policy decided (gap)
- E-r1 B-no-quiz#1: actions A5 allowed extra: [respond_text, suggest_dive] vs [respond_text] (extra suggest_dive)
- E-r1 B-invalid-actions#0: actions A5 allowed extra: [respond_text, ask_question] vs [respond_text] (extra ask_question)
- E-r1 D7-prompted-one-idea#1: evidence E2 unsettled = settled: [attention-output/weighted-average:pass?] vs [attention-output/weighted-average:pass]; route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- E-r2 GT-01#0: evidence E2 unsettled = settled, E1 multiplicity: [attention/looks-back-never-ahead:pass?] vs [attention/looks-back-never-ahead:pass, attention/looks-back-never-ahead:pass]; route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text, suggest_depth, show_authored_card] (extra ask_question) (replaced respond_text, suggest_depth, show_authored_card)
- E-r2 GT-02#0: evaluation §3: larger ran as the escalation policy decided (misconception); route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- E-r2 GT-03#1: evaluation §3: larger ran as the escalation policy decided (misconception)
- E-r2 GT-03#2: evaluation §3: larger ran as the escalation policy decided (misconception)
- E-r2 GT-04#0: actions A5 allowed extra: [respond_text, show_authored_card] vs [show_authored_card, respond_text]
- E-r2 GT-11#0: evaluation §3: larger ran as the escalation policy decided (contradiction); route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- E-r2 GT-12#0: route R2: uncertain_unsettled ~ uncertain
- E-r2 B-misconception-once#0: route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- E-r2 B-misconception-repeated#0: route R2: uncertain_unsettled ~ uncertain
- E-r2 B-misconception-unsure-second#0: route R2: uncertain_unsettled ~ uncertain
- E-r2 B-question#0: evaluation §3: larger ran as the escalation policy decided (gap)
- E-r2 D7-prompted-one-idea#1: evidence E2 unsettled = settled: [attention-output/weighted-average:pass?] vs [attention-output/weighted-average:pass]; route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- E-r3 GT-01#0: evidence E2 unsettled = settled, E1 multiplicity: [attention/looks-back-never-ahead:pass?] vs [attention/looks-back-never-ahead:pass, attention/looks-back-never-ahead:pass]; route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text, suggest_depth, show_authored_card] (extra ask_question) (replaced respond_text, suggest_depth, show_authored_card)
- E-r3 GT-02#0: evaluation §3: larger ran as the escalation policy decided (contradiction); route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- E-r3 GT-04#0: actions A5 allowed extra: [respond_text, show_authored_card] vs [show_authored_card, respond_text]
- E-r3 GT-11#0: evaluation §3: larger ran as the escalation policy decided (contradiction); actions A5 allowed extra: [respond_text, ask_question] vs [respond_text] (extra ask_question)
- E-r3 GT-12#0: evaluation §3: larger ran as the escalation policy decided (contradiction); route R2: uncertain_unsettled ~ uncertain
- E-r3 B-misconception-once#0: route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- E-r3 B-misconception-repeated#0: route R2: uncertain_unsettled ~ uncertain
- E-r3 B-misconception-unsure-second#0: route R2: uncertain_unsettled ~ uncertain
- E-r3 B-question#0: evaluation §3: larger ran as the escalation policy decided (gap)
- E-r3 B-no-quiz#1: actions A5 allowed extra: [respond_text, suggest_dive] vs [respond_text] (extra suggest_dive)
- E-r3 D7-prompted-one-idea#1: actions A5 allowed extra: [respond_text, suggest_practice] vs [respond_text] (extra suggest_practice)
- E-routine-r4 GT-04#0: actions A5 allowed extra: [respond_text, show_authored_card] vs [show_authored_card, respond_text]
- E-routine-r4 B-question#0: evaluation §3: larger ran as the escalation policy decided (gap)
- E-routine-r5 GT-04#0: actions A5 allowed extra: [respond_text, show_authored_card] vs [show_authored_card, respond_text]
- E-routine-r5 B-question#0: evaluation §3: larger ran as the escalation policy decided (gap)
- E-routine-r5 B-no-quiz#1: actions A5 allowed extra: [respond_text, suggest_dive] vs [respond_text] (extra suggest_dive)

### F: 42 fail -> pass, 0 pass -> fail, 6 not applicable

- F-r1 GT-01#0: evidence E2 unsettled = settled, E1 multiplicity: [attention/looks-back-never-ahead:pass?] vs [attention/looks-back-never-ahead:pass, attention/looks-back-never-ahead:pass]; route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text, suggest_depth, show_authored_card] (extra ask_question) (replaced respond_text, suggest_depth, show_authored_card)
- F-r1 GT-02#0: evaluation §3: larger ran as the escalation policy decided (misconception); route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- F-r1 GT-03#1: evaluation §3: larger ran as the escalation policy decided (gap)
- F-r1 GT-03#2: evaluation §3: larger ran as the escalation policy decided (misconception); actions A5 allowed extra: [respond_text, ask_question] vs [respond_text] (extra ask_question)
- F-r1 GT-04#0: actions A5 allowed extra: [respond_text, show_authored_card] vs [show_authored_card, respond_text]
- F-r1 GT-11#0: evaluation §3: larger ran as the escalation policy decided (contradiction); actions A5 allowed extra: [respond_text, ask_question] vs [respond_text] (extra ask_question)
- F-r1 GT-12#0: route R2: uncertain_unsettled ~ uncertain
- F-r1 B-misconception-once#0: route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- F-r1 B-misconception-repeated#0: route R2: uncertain_unsettled ~ uncertain
- F-r1 B-misconception-unsure-second#0: route R2: uncertain_unsettled ~ uncertain
- F-r1 B-question#0: evaluation §3: larger ran as the escalation policy decided (gap)
- F-r1 B-no-quiz#1: actions A5 allowed extra: [respond_text, suggest_dive] vs [respond_text] (extra suggest_dive)
- F-r1 D7-prompted-one-idea#1: actions A5 allowed extra: [respond_text, suggest_practice] vs [respond_text] (extra suggest_practice)
- F-r2 GT-01#0: evidence E2 unsettled = settled, E1 multiplicity: [attention/looks-back-never-ahead:pass?] vs [attention/looks-back-never-ahead:pass, attention/looks-back-never-ahead:pass]; route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text, suggest_depth, show_authored_card] (extra ask_question) (replaced respond_text, suggest_depth, show_authored_card)
- F-r2 GT-02#0: evaluation §3: larger ran as the escalation policy decided (contradiction); route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- F-r2 GT-03#1: evaluation §3: larger ran as the escalation policy decided (gap)
- F-r2 GT-03#2: evaluation §3: larger ran as the escalation policy decided (misconception); actions A5 allowed extra: [respond_text, ask_question] vs [respond_text] (extra ask_question)
- F-r2 GT-04#0: actions A5 allowed extra: [respond_text, show_authored_card] vs [show_authored_card, respond_text]
- F-r2 GT-11#0: evaluation §3: larger ran as the escalation policy decided (contradiction); actions A5 allowed extra: [respond_text, ask_question] vs [respond_text] (extra ask_question)
- F-r2 B-misconception-once#0: route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- F-r2 B-misconception-repeated#0: route R2: uncertain_unsettled ~ uncertain
- F-r2 B-misconception-unsure-second#0: route R2: uncertain_unsettled ~ uncertain
- F-r2 B-question#0: evaluation §3: larger ran as the escalation policy decided (gap)
- F-r2 B-no-quiz#1: actions A5 allowed extra: [respond_text, suggest_dive] vs [respond_text] (extra suggest_dive)
- F-r2 D7-prompted-one-idea#1: evidence E2 unsettled = settled: [attention-output/weighted-average:pass?] vs [attention-output/weighted-average:pass]; route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- F-r3 GT-01#0: evidence E2 unsettled = settled, E1 multiplicity: [attention/looks-back-never-ahead:pass?] vs [attention/looks-back-never-ahead:pass, attention/looks-back-never-ahead:pass]; route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text, suggest_depth, show_authored_card] (extra ask_question) (replaced respond_text, suggest_depth, show_authored_card)
- F-r3 GT-02#0: evaluation §3: larger ran as the escalation policy decided (contradiction); route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- F-r3 GT-04#0: actions A5 allowed extra: [respond_text, show_authored_card] vs [show_authored_card, respond_text]
- F-r3 GT-11#0: evaluation §3: larger ran as the escalation policy decided (contradiction); actions A5 allowed extra: [respond_text, ask_question] vs [respond_text] (extra ask_question)
- F-r3 GT-12#0: evaluation §3: larger ran as the escalation policy decided (contradiction); route R2: uncertain_unsettled ~ uncertain
- F-r3 B-misconception-once#0: route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- F-r3 B-misconception-repeated#0: route R2: uncertain_unsettled ~ uncertain
- F-r3 B-misconception-unsure-second#0: route R2: uncertain_unsettled ~ uncertain
- F-r3 B-question#0: evaluation §3: larger ran as the escalation policy decided (gap)
- F-r3 B-no-quiz#1: actions A5 allowed extra: [respond_text, suggest_dive] vs [respond_text] (extra suggest_dive)
- F-r3 D7-prompted-one-idea#1: evidence E2 unsettled = settled: [attention-output/weighted-average:pass?] vs [attention-output/weighted-average:pass]; route R2: uncertain_unsettled ~ uncertain; actions A2 move of the equivalent route: [ask_question] vs [respond_text] (extra ask_question) (replaced respond_text)
- F-routine-r4 GT-04#0: actions A5 allowed extra: [respond_text, show_authored_card] vs [show_authored_card, respond_text]
- F-routine-r4 B-question#0: evaluation §3: larger ran as the escalation policy decided (gap)
- F-routine-r4 B-no-quiz#1: actions A5 allowed extra: [respond_text, suggest_dive] vs [respond_text] (extra suggest_dive)
- F-routine-r5 GT-04#0: actions A5 allowed extra: [respond_text, show_authored_card] vs [show_authored_card, respond_text]
- F-routine-r5 B-question#0: evaluation §3: larger ran as the escalation policy decided (gap)
- F-routine-r5 B-no-quiz#1: actions A5 allowed extra: [respond_text, suggest_dive] vs [respond_text] (extra suggest_dive)

## Paired turn-level analysis vs Opus (arm A), same turn and repetition

| candidate | group | both pass | Opus only | candidate only | both fail | not applicable |
|---|---|---|---|---|---|---|
| B (Opus vs Opus) | routine | 19 | 2 | 1 | 33 | 0 |
| B (Opus vs Opus) | evidence | 35 | 3 | 4 | 33 | 6 |
| B (Opus vs Opus) | structural | 3 | 2 | 2 | 11 | 0 |
| D | routine | 15 | 6 | 4 | 30 | 0 |
| D | evidence | 36 | 2 | 2 | 35 | 6 |
| D | structural | 4 | 1 | 1 | 12 | 0 |
| E | routine | 19 | 2 | 5 | 29 | 0 |
| E | evidence | 37 | 1 | 2 | 35 | 6 |
| E | structural | 2 | 3 | 1 | 12 | 0 |
| F | routine | 16 | 5 | 5 | 29 | 0 |
| F | evidence | 36 | 2 | 2 | 35 | 6 |
| F | structural | 3 | 2 | 3 | 10 | 0 |

### Per corpus turn: passing repetitions (semantic), A / B / D / E / F

| turn | group | A | B | D | E | F |
|---|---|---|---|---|---|---|
| GT-01#0 | evidence | 2/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| GT-02#0 | evidence | 3/3 | 2/3 | 3/3 | 2/3 | 3/3 |
| GT-03#0 | evidence | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| GT-03#1 | evidence | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| GT-03#2 | evidence | 3/3 | 3/3 | 3/3 | 3/3 | 2/3 |
| GT-04#0 | routine | 5/5 | 5/5 | 2/5 | 5/5 | 5/5 |
| GT-06#0 | evidence | 0/3 | 3/3 | 1/3 | 1/3 | 1/3 |
| GT-07#0 | evidence | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| GT-07#1 | evidence | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 |
| GT-11#0 | evidence | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| GT-12#0 | evidence | 3/3 | 2/3 | 3/3 | 3/3 | 2/3 |
| GT-D#0 | structural | 1/3 | 1/3 | 2/3 | 0/3 | 2/3 |
| GT-D#1 | structural | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 |
| GT-D#2 | structural | 0/3 | 0/3 | 0/3 | 1/3 | 0/3 |
| GT-D#3 | structural | 1/3 | 1/3 | 0/3 | 0/3 | 1/3 |
| GT-D#4 | structural | 3/3 | 3/3 | 3/3 | 2/3 | 3/3 |
| B-correct-transfer#0 | evidence | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 |
| B-partial#0 | evidence | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 |
| B-ambiguous#0 | evidence | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 |
| B-misconception-once#0 | evidence | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| B-misconception-repeated#0 | evidence | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| B-misconception-repeated#1 | evidence | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 |
| B-misconception-unsure-second#0 | evidence | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| B-misconception-unsure-second#1 | evidence | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 |
| B-question#0 | routine | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 |
| B-question-softmax#0 | routine | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 |
| B-another-way#0 | routine | 1/5 | 1/5 | 0/5 | 0/5 | 0/5 |
| B-deeper#0 | routine | 5/5 | 5/5 | 5/5 | 5/5 | 1/5 |
| B-simplify#0 | routine | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 |
| B-deep-part#0 | routine | 2/5 | 1/5 | 0/5 | 5/5 | 5/5 |
| B-gap-long-reply#0 | structural | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 |
| B-gap-unsure#0 | evidence | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 |
| B-practice-pass#0 | evidence | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 |
| B-jev-error#0 | evidence | n/a | n/a | n/a | n/a | n/a |
| B-larger-error#0 | evidence | n/a | n/a | n/a | n/a | n/a |
| B-selection-zero#0 | routine | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 |
| B-no-quiz#0 | routine | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 |
| B-no-quiz#1 | routine | 3/5 | 3/5 | 5/5 | 3/5 | 5/5 |
| B-invalid-actions#0 | routine | 0/5 | 0/5 | 2/5 | 1/5 | 0/5 |
| D7-one-idea-untouched#0 | evidence | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 |
| D7-contradicts-second-idea#0 | evidence | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 |
| D7-prompted-one-idea#0 | evidence | 3/3 | 2/3 | 1/3 | 3/3 | 3/3 |
| D7-prompted-one-idea#1 | evidence | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| D7-practice-incomplete#0 | evidence | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 |

## Hard, reliability and cost gates (unchanged; paid-run values)

| | A | B | D | E | F |
|---|---|---|---|---|---|
| consent violations | 0 | 0 | 0 | 0 | 0 |
| critical policy violations | 0 | 0 | 0 | 0 | 0 |
| nonexistent-resource actions | 0 | 0 | 0 | 0 | 0 |
| fast-tier sentences spoken then replaced | 0 | 0 | 0 | 0 | 0 |
| evidence corruption | 0 | 0 | 0 | 0 | 0 |
| invalid structured plans (< 2%) | 0/154 (0.0%) | 0/154 (0.0%) | 10/167 (6.0%) | 0/154 (0.0%) | 1/155 (0.6%) |
| routine fast-tier escalation (< 20%) | n/a | n/a | 13/65 (20.0%) | 0/62 (0.0%) | 1/66 (1.5%) |
| cost / turn (<= A) | $0.03297 | $0.02575 | $0.01903 | $0.01974 | $0.01884 |
| corpus golden traces, semantic, every repetition | 5/9 | 5/9 | 5/9 | 5/9 | 4/9 |

## Locked-gate verdicts (semantic quality, hard/reliability/cost unchanged)

```
{
 "A": {
  "eligible_unit_golden": true,
  "eligible_live_golden": false,
  "failed": [],
  "live_golden": {
   "passed": 5,
   "total": 9,
   "failed": [
    "GT-01",
    "GT-06",
    "GT-07",
    "GT-D"
   ]
  }
 },
 "B": {
  "eligible_unit_golden": true,
  "eligible_live_golden": false,
  "failed": [],
  "live_golden": {
   "passed": 5,
   "total": 9,
   "failed": [
    "GT-02",
    "GT-07",
    "GT-12",
    "GT-D"
   ]
  }
 },
 "D": {
  "eligible_unit_golden": false,
  "eligible_live_golden": false,
  "failed": [
   "actions 96/142 is 3.5 pp below A (101/142)",
   "invalid plans 10/167",
   "routine escalation 13/65"
  ],
  "live_golden": {
   "passed": 5,
   "total": 9,
   "failed": [
    "GT-04",
    "GT-06",
    "GT-07",
    "GT-D"
   ]
  }
 },
 "E": {
  "eligible_unit_golden": true,
  "eligible_live_golden": false,
  "failed": [],
  "live_golden": {
   "passed": 5,
   "total": 9,
   "failed": [
    "GT-02",
    "GT-06",
    "GT-07",
    "GT-D"
   ]
  }
 },
 "F": {
  "eligible_unit_golden": true,
  "eligible_live_golden": false,
  "failed": [],
  "live_golden": {
   "passed": 4,
   "total": 9,
   "failed": [
    "GT-03",
    "GT-06",
    "GT-07",
    "GT-12",
    "GT-D"
   ]
  }
 }
}
```
