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

## Table 2 (brief 44): all ten checks offline on ten stored blueprints

Run at $0 on the five blueprints of brief 41 (`design-brief41/`, whose labels still have `at`) and the last answer of each of the five live runs of brief 43 (`design-brief43/`). Before: the checker as committed in brief 43 (`e1b0c16cb`). After: the checker now, with the four Build rules of brief 44 (an arrow that starts at a dot starts at its edge plus 2 px; a label tries eight positions at gaps of 12 then 20 px and is left out and counted when none is clear, which no longer fails check 10; a one-line explanation wider than its note box is given two lines; a graph too tall by at most its title's height is drawn without its title).

| Blueprint | Before | After | Check that failed and its sentence |
|---|---|---|---|
| b41-pendulum-1 | F10: arrowhead over the bob (velArrow, bob) | F10 | check 10: Things overlap in the frame at the defaults, t = 2.5: {"a":"part.velArrow","b":"part.bob","kind":"arrowhead-circle","width":4.1,"height":6.4}. |
| b41-pendulum-2 | F10: arrowhead over the bob (vel_arrow, test_bob) | F10 | check 10: Things overlap in the frame at every number control at its maximum, t = 3: {"a":"part.vel_arrow","b":"part.test_bob","kind":"arrowhead-circle","width":7.8,"height":6.3}. |
| b41-pendulum-3 | passes all ten checks | passes all ten checks | - |
| b41-pendulum-4 | F10: the label release_label has no clear side | F10 | check 10: Things overlap in the frame at the defaults, t = 3.5: {"a":"part.vel_arrow","b":"part.bob","kind":"arrowhead-circle","width":4.6,"height":5}. |
| b41-pendulum-5 | F10: arrowhead over the bob (velArrow, bobDot) | F10 | check 10: Things overlap in the frame at the defaults, t = 5: {"a":"part.velArrow","b":"part.bobDot","kind":"arrowhead-circle","width":3.4,"height":5.9}. |
| b43-pendulum-1 | F9: the note needs 2 lines; its box allows 1 (text_too_wide) | F9 | check 9: The layout refuses the scene (figure_too_big): the graph needs at least 218 x 277 px; its box is 304 x 222.4 px. |
| b43-pendulum-2 | F10: arrowhead over the bob (grav_arrow, bob) | F10 | check 10: Things overlap in the frame at the defaults, t = 0: {"a":"part.grav_arrow","b":"part.bob","kind":"arrowhead-circle","width":6.8,"height":0.6}. |
| b43-pendulum-3 | F9: the graph needs 300 px; its box is 299.2 (figure_too_big) | F10 | check 10: Things overlap in the frame at L = 2.5, t = 3: {"a":"part.vel_arrow","b":"part.bob","kind":"arrowhead-circle","width":0.5,"height":6.2}. |
| b43-pendulum-4 | passes all ten checks (P2) | passes all ten checks | - |
| b43-pendulum-5 | F10: the label ref_lbl has no clear side | passes all ten checks | - |

Labels dropped in some frame (counted in notes, no longer a failure): b43-pendulum-5: ref_lbl, bob_lbl (in 4 frames).
