# gan-lab

Visualization benchmark project.

Read the root `AGENT-INSTRUCTIONS.md` before doing anything.

## Mandatory workflow

1. Populate/inspect `reference/`.
2. Define `target.json`.
3. Write `reference-notes.md`.
4. Generate with the Learn runtime only.
5. Save current output to `generated/latest/`.
6. Evaluate and save `generated/latest/critic-report.json`.
7. Update `evaluation/current.json`.
8. Before the next iteration, archive `generated/latest/` into `generated/history/vNNN/`.
9. Improve the reusable Learn system, not this benchmark with one-off code.
10. Human review is the final gate.

Target: **conceptual parity, original Learn-native visual realization.**
