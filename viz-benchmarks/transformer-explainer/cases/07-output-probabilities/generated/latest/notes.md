# Iteration notes - 07 output probabilities (iteration 2, Phase A.5d gate)

Same scene as case 02 and case 03. SECONDARY case - this case's subject is
the scene's closing beats (the row-4 softmax distribution and the weighted
output), captured in `75.png` and `100.png`.

## What changed for this case specifically

Nothing in `reference-scenes.js` was changed for the `bars-row` or `output`
objects directly (no heat-mode or label change was needed - bars already
carried per-key labels, and output's values are always non-negative in this
worked example, so signed vs magnitude heat makes no visible difference).
What DOES land here: the generic selection-overlay fix (finding #5) now
reaches the `output` strip's own cells, not only the grid. `100.png` shows
the output strip's index-4 cell with the same two-tone ring already
confirmed on the matrix and on demo-scenes.js's own heat-check board.

## What this case's subject looks like here

- `75.png` (t=12.9s, 75%): the row-4 distribution as bars, mid-appear;
  output strip and the softmax-formula equation fading in.
- `100.png` (t=17.2s, 100%): final state - bars settled, output computed,
  output[4] carrying the selection ring, closing caption.
- `00.png`/`25.png`/`50.png`: earlier beats - see case 02 and case 03.

## Archiving

`generated/latest/` (iteration 1) archived to `generated/history/v001/`;
`evaluation/current.json` archived to `evaluation/history/v001.json`.

## The two findings specific to this case

Both are conceptual-scope points about what this case's subject IS, not
about the five reusable-system defects Phase A.5d targeted - unchanged,
correctly still open, and never claimed as fixed:

- This scene's row-4 distribution is attention weights over sequence
  positions, not a vocabulary distribution over next-token candidates - the
  reference's Probabilities panel is downstream of an LM head this single
  attention layer does not have.
- No zero-probability tail, because this worked example only has 5
  candidate positions - a scale choice, not a `bars` limitation.

## Why the scores moved anyway

`spatialRelationships` and `teachingClarity` moved up slightly: the matrix's
new row/column labels (case 03) make it explicit which row feeds this case's
bars, tightening the connection between the two cases' subjects without
either case's own scene objects changing.
