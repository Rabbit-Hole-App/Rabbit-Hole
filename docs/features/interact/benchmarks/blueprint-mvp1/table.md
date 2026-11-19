# Blueprint MVP 1: results

Made by `scripts/interact/blueprint-table.mjs` from C:/Users/cyudhist/Desktop/workspace/feature-interactive/docs/features/interact/benchmarks/blueprint-mvp1. A cell is the result, the seconds of the first answer and the cost of the cell (first answer and correction). P1: the first answer passed the checker. P2: it passed after the one correction. F<n>: it failed; n is the check that failed last. F0 (not json): the answer is not JSON. A dash: never run.

## Plain arm

| Run | xhigh | high | medium | low |
|---|---|---|---|---|
| 1 | P1, 165.7 s, $0.31 | P1, 53.6 s, $0.11 | P1, 32.5 s, $0.08 | P1, 13.9 s, $0.04 |
| 2 | P1, 173.8 s, $0.32 | P1, 47.4 s, $0.10 | P1, 30.9 s, $0.07 | P2, 15.8 s, $0.08 |
| 3 | P1, 199.6 s, $0.37 | P1, 59.6 s, $0.12 | P1, 22.6 s, $0.06 | P2, 16.9 s, $0.08 |
| 4 | P1, 202.0 s, $0.37 | P1, 60.1 s, $0.13 | P1, 35.5 s, $0.07 | P1, 15.4 s, $0.04 |
| 5 | P1, 189.4 s, $0.34 | P1, 69.6 s, $0.13 | P1, 34.6 s, $0.08 | P1, 16.8 s, $0.04 |

### Plain arm: what each answer is (copied from the blueprint, nothing judged)

| Level | Run | Result | Controls | Formula | Parts |
|---|---|---|---|---|---|
| xhigh | 1 | P1 | length 0.5 to 2; mass 0.5 to 2.5; gravity 3 to 15 | T = 2\pi\sqrt{L/g} | line, line, line, line, line, trace, dot, dot, arrow, arrow, label, label |
| xhigh | 2 | P1 | length 0.4 to 2; mass 0.5 to 4; angle 10 to 25 | T = 2\pi\sqrt{L / g} | line, line, line, label, label, trace, line, line, arrow, arrow, dot, dot |
| xhigh | 3 | P1 | length 0.6 to 1.6; mass 0.5 to 3; startAngle 15 to 70 | T_0 = 2\pi\sqrt{L/g} | line, line, line, label, label, trace, line, dot, trace, line, dot, arrow |
| xhigh | 4 | P1 | length 0.6 to 2; start_angle 15 to 75; mass 0.5 to 3 | T \approx 2\pi \sqrt{L / g} | line, trace, line, line, arrow, dot, dot, dot, label, label |
| xhigh | 5 | P1 | length 0.6 to 2.2; mass 0.5 to 3; gravity 2 to 16 | T = 2\pi\sqrt{L/g}  | line, label, label, line, trace, line, arrow, dot, trace, line, arrow, dot |
| high | 1 | P1 | length 0.6 to 2.4; gravity 2 to 14; mass 0.5 to 5 | T = 2\pi \sqrt{L / g} | line, label, label, dot, dot, line, dot, trace, line, dot, arrow |
| high | 2 | P1 | length 0.5 to 2.5; mass 0.5 to 5; angle0 10 to 35 | T = 2\pi\sqrt{L / g} | line, line, line, line, dot, label, line, trace, arrow, dot, label |
| high | 3 | P1 | length 0.5 to 2.2; mass 0.5 to 4; angle 5 to 25 | T = 2\pi\sqrt{L / g} | line, label, label, line, trace, dot, arrow, line, trace, dot, arrow |
| high | 4 | P1 | length 0.5 to 2; mass 0.5 to 5; startAngle 10 to 25 | T = 2\pi\sqrt{L / g} | line, line, line, trace, trace, line, dot, line, arrow, dot, label, label |
| high | 5 | P1 | length 0.5 to 2.5; mass 0.5 to 5; angle0 5 to 25 | T = 2\pi\sqrt{L/g} | line, label, label, trace, trace, line, line, dot, dot |
| medium | 1 | P1 | length 0.5 to 2; mass 0.5 to 5; startAngle 5 to 25 | T = 2\pi\sqrt{L / g} | line, label, label, line, line, trace, trace, line, line, dot, dot |
| medium | 2 | P1 | length 0.5 to 2.5; mass 0.5 to 5; angle0 10 to 30 | T = 2\pi\sqrt{L/g} | line, trace, line, dot, dot, arrow |
| medium | 3 | P1 | length 0.8 to 2.4; mass 0.5 to 5; angle0 10 to 30 | T = 2\pi \sqrt{L / g} | line, dot, line, trace, dot |
| medium | 4 | P1 | length 0.5 to 2.5; mass 0.5 to 3; amplitude 5 to 20 | T = 2\pi\sqrt{L / g} | line, line, trace, line, dot, dot, arrow |
| medium | 5 | P1 | length 0.4 to 2.2; mass 0.5 to 5; angle0 5 to 20 | T = 2\pi\sqrt{L/g} | line, line, dot, dot, trace, line, dot, dot, trace, label, label |
| low | 1 | P1 | length 0.5 to 2.5; mass 0.5 to 5; angle0 5 to 25 | T = 2\pi\sqrt{L / g} | line, trace, line, dot, dot |
| low | 2 | P2 | length 1 to 4; mass 0.5 to 5; gravity earth / moon / jupiter | T = 2\pi\sqrt{L / g} | line, trace, line, dot, dot |
| low | 3 | P2 | length 0.5 to 2.5; mass 0.5 to 5; angle0 5 to 25 | T = 2\pi\sqrt{L/g} | line, dot, trace, line, dot |
| low | 4 | P1 | length 0.5 to 2.5; mass 0.5 to 5; angle0 5 to 30 | T = 2\pi\sqrt{L/g} | line, dot, line, dot, trace |
| low | 5 | P1 | length 0.5 to 2.5; gravity 1.6 to 20; mass 0.5 to 5 | T = 2\pi \sqrt{L / g} | line, dot, trace, line, dot |

### Plain arm: totals per level

| Level | Passed first | Passed after correction | Failed | Median seconds (first answer) | Tokens | Cost |
|---|---|---|---|---|---|---|
| xhigh | 5 | 0 | 0 | 189.4 s | 267944 | $1.72 |
| high | 5 | 0 | 0 | 59.6 s | 118323 | $0.60 |
| medium | 5 | 0 | 0 | 32.5 s | 85874 | $0.35 |
| low | 3 | 2 | 0 | 15.8 s | 95352 | $0.28 |

## Seeded arm

| Seed | xhigh | high | medium | low |
|---|---|---|---|---|
| 1 | P2, 215.7 s, $0.68 | P1, 78.7 s, $0.15 | P1, 29.5 s, $0.07 | P2, 14.3 s, $0.08 |
| 2 | P1, 176.4 s, $0.33 | P1, 73.1 s, $0.14 | P1, 28.1 s, $0.07 | P1, 20.4 s, $0.05 |
| 3 | P1, 178.4 s, $0.33 | P1, 58.1 s, $0.11 | P1, 26.3 s, $0.06 | P1, 14.4 s, $0.05 |
| 4 | P2, 211.1 s, $0.70 | P1, 65.8 s, $0.13 | P1, 29.5 s, $0.07 | P1, 17.6 s, $0.05 |
| 5 | P2, 193.3 s, $0.41 | P1, 58.5 s, $0.12 | P1, 30.6 s, $0.08 | P1, 17.4 s, $0.05 |

### Seeded arm: what each answer is (copied from the blueprint, nothing judged)

| Level | Seed | Result | Controls | Formula | Parts |
|---|---|---|---|---|---|
| xhigh | 1 | P2 | mass 0.5 to 4 | T = 2\pi\sqrt{L/g} | line, trace, trace, line, line, dot, dot, arrow, arrow, label, label |
| xhigh | 2 | P1 | gravity 1.6 to 24.8; start_angle 10 to 85 | T = 2\pi\sqrt{L/g} | line, label, line, trace, line, line, dot, dot, dot, arrow, arrow, arrow |
| xhigh | 3 | P1 | length 0.6 to 2.4; gravity 1.6 to 16; start_angle 10 to 80 | T = 2\pi\sqrt{L/g} | line, line, dot, dot, arrow, line, dot, trace, line, dot, label |
| xhigh | 4 | P2 | mass 1 to 4; start_angle 10 to 85 | T = 2\pi\sqrt{L/g} | line, line, dot, label, label, dot, trace, line, dot, line, dot, arrow |
| xhigh | 5 | P2 | gravity 1.6 to 24.8 | T = 2\pi\sqrt{L/g} | line, line, dot, line, dot, trace, line, dot, dot, arrow, arrow, label |
| high | 1 | P1 | theta0 5 to 75 | T = 2\pi\sqrt{L/g} | dot, label, line, label, line, dot, trace, line, arrow, dot, dot |
| high | 2 | P1 | m 0.5 to 2.5; g 2 to 20 | T = 2\pi\sqrt{L/g} | line, label, trace, line, dot, arrow, arrow, dot, label |
| high | 3 | P1 | L 0.5 to 2.5; m 0.5 to 5; g 2 to 15 | T = 2\pi\sqrt{L/g} | line, line, label, label, trace, line, arrow, arrow, dot, dot |
| high | 4 | P1 | theta0 5 to 45; g 2 to 20 | T = 2\pi\sqrt{L/g} | line, line, line, dot, trace, dot, arrow, label, label |
| high | 5 | P1 | m 0.5 to 5 | T = 2\pi\sqrt{L/g} | line, line, line, trace, line, line, arrow, arrow, dot, dot, label, label |
| medium | 1 | P1 | mass 0.5 to 5 | T = 2\pi \sqrt{\frac{L}{g}} | line, line, trace, line, dot, dot, arrow |
| medium | 2 | P1 | gravity 2 to 20; angle0 5 to 20 | T = 2\pi \sqrt{\frac{L}{g}} | line, line, trace, line, arrow, dot, dot |
| medium | 3 | P1 | length 0.4 to 2.4; gravity 2 to 20; angle0 5 to 20 | T = 2\pi \sqrt{\frac{L}{g}} | line, dot, trace, line, dot, arrow, label |
| medium | 4 | P1 | angle0 5 to 20; mass 0.5 to 5 | T = 2\pi \sqrt{\frac{L}{g}} | line, line, trace, line, dot, dot, arrow |
| medium | 5 | P1 | gravity 2 to 20 | T = 2\pi \sqrt{\frac{L}{g}} | line, line, dot, trace, line, arrow, dot, label |
| low | 1 | P2 | theta0 5 to 25 | T = 2\pi\sqrt{L / g} | line, trace, line, dot, dot, label |
| low | 2 | P1 | L 0.4 to 2; m 0.5 to 5 | T = 2\pi\sqrt{L / g} | line, line, trace, dot, arrow |
| low | 3 | P1 | L 0.5 to 3; m 0.5 to 5; theta0 5 to 30 | T = 2\pi\sqrt{L / g} | line, dot, dot, arrow, trace |
| low | 4 | P1 | m 0.5 to 5; theta0 5 to 30 | T = 2\pi\sqrt{L / g} | line, dot, line, trace, dot, arrow, label |
| low | 5 | P1 | m 0.5 to 5 | T = 2\pi\sqrt{L / g} | line, dot, line, trace, dot |

### Seeded arm: totals per level

| Level | Passed first | Passed after correction | Failed | Median seconds (first answer) | Tokens | Cost |
|---|---|---|---|---|---|---|
| xhigh | 2 | 3 | 0 | 193.3 s | 416954 | $2.60 |
| high | 5 | 0 | 0 | 65.8 s | 133976 | $0.68 |
| medium | 5 | 0 | 0 | 29.5 s | 91992 | $0.37 |
| low | 4 | 1 | 0 | 17.4 s | 89546 | $0.28 |

The first call of this arm (the quantities, one per level) is counted in the cost of its level: low 4.4 s, $0.01; medium 11.3 s, $0.02; high 19.9 s, $0.03; xhigh 93.4 s, $0.15.

## Total

Calls: 51. Total cost: $7.16 ($0.27 of it is in no arm: the probes).
