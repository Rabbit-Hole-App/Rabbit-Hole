# Iteration notes - 03 masked attention matrix (iteration 2, Phase A.5d gate)

Task 12's scene (`packages/web/src/reference-scenes.js`, `causal-self-attention`)
re-rendered after the six passes that fixed iteration 1's five findings. This
is the PRIMARY case: the attention matrix forming, masking and normalising.

## What changed in the scene since iteration 1

Three lines in `reference-scenes.js` were updated to actually invoke the
fixes the six passes built (they existed in the runtime since commit
`da98097`/`7e2cc0c`/`93e8c9f`, all landed after this scene was first authored
in `6947821`, and the scene itself was never wired back up to use them):

- The raw-scores -> softmax transition (`at: 8.4`) changed from
  `action: 'set_values'` (a 1.4s linear tween across a nonlinear transform -
  the exact bug iteration 1 found) to `action: 'replace_values'` (a discrete
  swap; no duration, no eased frame ever shows a number outside {raw score,
  softmax weight}).
- The matrix gained `rowLabels: [...TOKENS]` and `columnLabels: [...TOKENS]`.
- `q`, `k` and the `matrix` changed `heat: true` to `heat: { mode: 'signed' }`
  (K has a real negative entry, -0.50, and so do the raw scores derived from
  it) so a negative cell renders in the diverging blue token instead of a
  paler shade of the same orange positive cells use.

This is a mechanical "wire the scene up to the already-fixed vocabulary"
change, not a new scene-specific patch - `replace_values`, `rowLabels`/
`columnLabels` and `heat.mode` are all pre-existing, generic fields on the
shared `grid`/`strip` schema (see `demo-scenes.js`'s own `heat-check` board,
which already used the identical pattern). Contrast-aware ink (finding #3)
and coordinated selection (finding #5) needed no scene change at all - both
are resolved entirely inside `AnimatedScene.jsx`/`scene-style.js` and applied
automatically to this scene's existing `highlight_cell` calls.

## What this case's subject looks like here

- `00.png` (t=0s): blank, before anything has appeared - unchanged from
  iteration 1.
- `25.png` (t=4.3s, 25%): before the matrix appears - Q/K/V visible with
  their new identity colours (see case 02) and K's negative cell already
  showing the diverging blue. Not this case's subject.
- `50.png` (t=8.6s, 50%): the matrix's SUBJECT frame. Because
  `replace_values` is instant, the matrix already shows the complete softmax
  row-by-row (not a mid-tween) with row/column labels down the left and
  across the top, and the causal triangle blank in the upper right.
- `75.png` (t=12.9s, 75%): row 4 selected (band across the row), bars
  appearing below with per-key labels.
- `100.png` (t=17.2s, 100%): final state; output strip's index-4 cell shows
  the selection ring; closing caption.

## Archiving

`generated/latest/` (iteration 1's actual run - the pre-fix benchmark that
produced the five findings this phase fixed) archived whole to
`generated/history/v001/`, and iteration 1's `evaluation/current.json`
archived to `evaluation/history/v001.json`, both before this run wrote
anything new.

## The five findings

All five are resolved - see `critic-report.json`'s `iteration1Findings` for
the evidence behind each. Read `viz-benchmarks/shared/stochastic-references.md`
before treating anything here as a finding: this case's `volatileReferenceFields`
(input token sequence, exact attention weight values) are excluded from
scoring exactly as before - nothing changed there, since this scene's tokens
and weights are authored, not sampled.

## A new reusable-system defect, found while producing this iteration's
   evidence, not one of the original five

While confirming finding #4 (signed heat) held for the matrix itself, not
just the K strip, scrubbing the Animation time input gradually through the
matrix's raw-score reveal (5.2s-6.6s) - the way a human actually drags a
range slider, one step at a time, rather than jumping straight to a
percentage - left every cell in the row frozen at an identical, wrong,
role-tinted fill instead of each cell's own heat colour, for the rest of the
scene's playback. The number stays correct; the colour lies. Confirmed
reproducible in a production build (`npm run build` + `vite preview`), not
just the dev server. Full root-cause writeup and the exact reproduction steps
are in `critic-report.json`'s `findings` array. This is a defect in
`AnimatedScene.jsx`'s shared grid/strip rendering (a Framer Motion
`animate`/`style` handoff on the cell's `fill`), not in this scene - the
original iteration-1 scene had the identical reveal shape and would show the
same failure under the same gradual-scrub condition. It does not appear in
any of this case's five delivered frames, because none of them land inside
the affected window and the capture script (like, apparently, every prior
capture) jumps between percentages rather than scrubbing through them.

## Bugs from iteration 1 - still fixed

The row-4 bars off-by-4 slice and the closing-note/bars-label overlap, both
fixed before iteration 1 was captured, remain fixed - visible directly in
`75.png`/`100.png` (row 4's bars match the matrix's own row-4 numerals; the
closing caption sits clear of the bars' key labels).
