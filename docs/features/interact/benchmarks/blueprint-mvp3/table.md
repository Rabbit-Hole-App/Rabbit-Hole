# Blueprint MVP 3: five pendulum blueprints through all ten checks (brief 43)

## Table 1: five live runs

Made by `scripts/interact/blueprint-pendulum-collect.mjs` from the job records of five runs of "what changes a pendulum swing" at Deep on the local interactive stack (8879): the blueprint design kind, Gemini 4 Hydrogen at high, checks 1 to 10, one correction. A label names the part it is near (`near`) and the program places it (brief 43). The seed is minted per run when the job starts; the dice pick is the control quantities the run kept. P1: the first answer passed all ten checks; P2: it passed after the one correction; F<n>: the check that failed last. Seconds and cost are of the whole design phase.

| Run | Seed | Dice pick (of the control quantities) | Result | Check that failed and its sentence | Seconds | Cost | Final blueprint |
|---|---|---|---|---|---|---|---|
| pendulum-1 | 2456339150 | length, mass, angle0 (of length, mass, angle0) | F9 | check 9: The layout refuses the scene (text_too_wide): the note "Small angle matches ideal formula." needs 212 px on 2 line(s); its box allows 1 line(s) of 288 px. | 104.964 | $0.1975 | - |
| pendulum-2 | 1814323017 | gravity (of length, gravity, mass, release_angle) | F10 | check 10: Things overlap in the frame at the defaults, t = 0: {"a":"part.grav_arrow","b":"part.bob","kind":"arrowhead-circle","width":6.8,"height":0.6}. | 134.516 | $0.2085 | - |
| pendulum-3 | 252404054 | L (of L, m, g, theta0) | F9 | check 9: The layout refuses the scene (figure_too_big): the graph needs at least 193 x 300 px; its box is 304 x 299.2 px. | 129.723 | $0.2274 | - |
| pendulum-4 | 2584151316 | L, theta_0 (of L, theta_0, m) | P2 | - | 151.018 | $0.2609 | design/pendulum-4.json |
| pendulum-5 | 288726699 | length, release_angle, mass (of length, release_angle, mass) | F10 | check 10: The label `ref_lbl` near `ref_bob` has no clear side at the defaults, t = 0: above, below, right and left of `ref_bob` each overlap another part or leave the picture; move the parts apart or shorten the text. | 131.997 | $0.2550 | - |

P1: 0. P2: 1. Failed: 4. Total cost: $1.1493.

## Table 2: check 10 offline on the five stored brief-41 blueprints

Run at $0 on `design-brief41/` (the five blueprints of brief 41, whose labels still have `at`): the checker with the new label rule (Build places a label around its point by the same rule as one that is near a part). They failed check 10 in brief 41 because a label overlapped a part; every check is run, 1 to 10.

| Blueprint | Brief 41 result | Now | Check that failed and its sentence | Labels left out (notes) |
|---|---|---|---|---|
| pendulum-1 | failed check 10: a label overlapped a part | F10 | check 10: Things overlap in the frame at the defaults, t = 2.5: {"a":"part.velArrow","b":"part.bob","kind":"arrowhead-circle","width":4.1,"height":6.4}. | - |
| pendulum-2 | failed check 10: a label overlapped a part | F10 | check 10: Things overlap in the frame at every number control at its maximum, t = 3: {"a":"part.vel_arrow","b":"part.test_bob","kind":"arrowhead-circle","width":7.8,"height":6.3}. | - |
| pendulum-3 | failed check 10: a label overlapped a part | passes all ten checks | - | - |
| pendulum-4 | failed check 10: a label overlapped a part | F10 | check 10: The label `release_label` has no clear side at the defaults, t = 0: above, below, right and left of its point each overlap another part or leave the picture; move the parts apart or shorten the text. | label release_label left out at the defaults, t = 0: no clear side |
| pendulum-5 | failed check 10: a label overlapped a part | F10 | check 10: Things overlap in the frame at the defaults, t = 5: {"a":"part.velArrow","b":"part.bobDot","kind":"arrowhead-circle","width":3.4,"height":5.9}. | - |
