# Blueprint MVP 3: five pendulum blueprints (brief 41)

Made by `scripts/interact/blueprint-pendulum-collect.mjs` from the job records of five runs of "what changes a pendulum swing" at Deep on the local interactive stack (8879), the blueprint design kind (Gemini 4 Hydrogen at high, the full checker). The seed is minted per run when the job starts; the dice pick is the control quantities the run kept (the others were fixed). Seconds and cost are of the whole design phase. Each final blueprint (design/) is the parsed JSON that passed the full checker, ready for Build; a run that did not pass has none, and its record is records/<run>.txt.

| Run | Seed | Dice pick (of the control quantities) | Result | Seconds | Cost | Final blueprint |
|---|---|---|---|---|---|---|
| pendulum-1 | 1481396210 | length (of length, mass, releaseAngle) | did not pass: Things overlap in the frame at the defaults, t = 0: {"a":"part.refLabel","b":"part.support","kind":"text-line","width":0,"height":0,"gap":0,"hint":"move \"part.refLabel\" so it is at least 8 px clear of \"part.su. | 99.814 | $0.1997 | - |
| pendulum-2 | 477908101 | L, m, theta0 (of L, m, theta0) | did not pass: Things overlap in the frame at the defaults, t = 0: {"a":"part.test_label","b":"part.beam","kind":"text-line","width":0,"height":0,"gap":0,"hint":"move \"part.test_label\" so it is at least 8 px clear of \"part.b. | 116.803 | $0.2132 | - |
| pendulum-3 | 399439811 | mass (of length, mass, gravity, release_angle) | did not pass: Things overlap in the frame at the defaults, t = 0: {"a":"part.test_label","b":"part.support_bar","kind":"text-line","width":0,"height":0,"gap":0,"hint":"move \"part.test_label\" so it is at least 8 px clear of \. | 100.254 | $0.1938 | - |
| pendulum-4 | 3507750969 | length (of length, mass, angle_0, gravity) | did not pass: Things overlap in the frame at the defaults, t = 0: {"a":"part.release_label","b":"part.bob","kind":"text-circle","width":36,"height":0.5}. | 110.277 | $0.2039 | - |
| pendulum-5 | 889901629 | length, mass, gravity (of length, mass, angle0, gravity) | did not pass: Things overlap in the frame at the defaults, t = 0: {"a":"part.pivotLabel","b":"part.pivotDot","kind":"text-circle","width":12,"height":8.4}. | 98.619 | $0.1818 | - |

Passed: 0 of 5 (0 after the correction). Total cost: $0.9924.
