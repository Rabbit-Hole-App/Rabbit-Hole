# Blueprint MVP 3: five pendulum blueprints (briefs 41 and 42)

Made by `scripts/interact/blueprint-pendulum-collect.mjs` from the job records of five runs of "what changes a pendulum swing" at Deep on the local interactive stack (8879), the blueprint design kind (Gemini 4 Hydrogen at high). The seed is minted per run when the job starts; the dice pick is the control quantities the run kept (the others were fixed). Seconds and cost are of the whole design phase as it ran then (quantities call, blueprint call, the correction call).

The design phase checks the blueprint on checks 1 to 9 (the form, the names, the function in QuickJS, the parts move, the controls matter, the parts are drawable, the graph is drawable, the claims hold, the layout fits). Check 10 (building the Program and testing the frame) is Build's. These five runs were made while the design phase still ran check 10, and every one of them stopped on check 10 (a label touching a part); checks run in order, so each last answer passed 1 to 9 and is saved as the final blueprint, ready for Build. The runs' own record of the checker (records/) still says "did NOT pass" because it was made under the old rule. Each file is the model's answer parsed from the text exactly as returned.

| Run | Seed | Dice pick (of the control quantities) | Result | Seconds | Cost | Final blueprint |
|---|---|---|---|---|---|---|
| pendulum-1 | 1481396210 | length (of length, mass, releaseAngle) | passed checks 1 to 9 (after the correction; the first answer also passed 1 to 9) | 99.814 | $0.1997 | design/pendulum-1.json |
| pendulum-2 | 477908101 | L, m, theta0 (of L, m, theta0) | passed checks 1 to 9 (after the correction; the first answer also passed 1 to 9) | 116.803 | $0.2132 | design/pendulum-2.json |
| pendulum-3 | 399439811 | mass (of length, mass, gravity, release_angle) | passed checks 1 to 9 (after the correction; the first answer also passed 1 to 9) | 100.254 | $0.1938 | design/pendulum-3.json |
| pendulum-4 | 3507750969 | length (of length, mass, angle_0, gravity) | passed checks 1 to 9 (after the correction) | 110.277 | $0.2039 | design/pendulum-4.json |
| pendulum-5 | 889901629 | length, mass, gravity (of length, mass, angle0, gravity) | passed checks 1 to 9 (after the correction; the first answer also passed 1 to 9) | 98.619 | $0.1818 | design/pendulum-5.json |

Passed checks 1 to 9: 5 of 5 (5 saved after the correction). Total cost of the five runs: $0.9924.
