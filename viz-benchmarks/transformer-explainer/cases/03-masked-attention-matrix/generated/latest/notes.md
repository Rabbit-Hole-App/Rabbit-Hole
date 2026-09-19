# Iteration notes - 03 masked attention matrix

Task 12 (`packages/web/src/reference-scenes.js`, scene `causal-self-attention`).
This is the PRIMARY case for Task 12 - the scene's Q/K/V -> QKT -> causal mask
-> softmax -> xV -> output flow is authored as one continuous scene, and this
case is scored on the middle of it: the attention matrix forming, masking,
and normalising.

## What this case's subject looks like here

- `25.png` (t=4.3s, 25% of the scene): before the matrix appears - tokens and
  Q/K/V only. Included for continuity, not this case's subject.
- `50.png` (t=8.6s, 50%): the matrix mid-transition from raw QKT scores to
  softmax weights. The causal triangle is already visible as shape (upper
  right stays blank).
- `75.png` (t=12.9s, 75%): softmax complete, row 4 (the last token) selected
  with a highlighted band, softmax-weights bars appearing below.
- `100.png` (t=17.2s, 100%): final state, closing caption.
- `00.png` (t=0s): the scene's very first frame, before anything has typed or
  appeared - blank by design, the same convention every scene in
  `demo-scenes.js` already uses (a `type_text` caption starting at `at: 0`
  means literally nothing is drawn until playback begins).

## Archiving decision

`generated/latest/` held only a `.gitkeep` before this run - no prior
screenshots, scene spec, critic report or notes existed. There was nothing
useful to archive to `generated/history/v001/`, so nothing was moved there.
This is genuinely the first run.

## What the scene composed from role/state/heat

A matrix cell is `role: observed` throughout (raw score, masked, and softmax
weight are the same *kind* of thing - a computed number - never a new role).
Two devices carry the rest, and neither is literally the shared `STATES`
enum:

- **masked** = `values[i] = null`. This is the existing, documented device
  (`animation-scene.js`: "null is a blank cell... a masked or not-yet-computed
  entry must read as absent"), not a bespoke addition.
- **selected row** = `highlight_cell` with `{ row: 4 }`, which draws the
  built-in row-band rectangle.
- **magnitude** = `heat: true` on the grid, mapping `|value|` to fill.

No eleventh role was wanted or added.

## Bug found and fixed during this task

The bars object below the matrix (`bars-row`, the row-4 distribution) was
built from `SOFTMAX.slice(16, 21)` instead of `SOFTMAX.slice(20, 25)` - an
off-by-4 slicing error that pulled three values from row 3 and one from row
4 instead of row 4's own five. Caught by eyeballing the rendered PNG against
the matrix's own row-4 numerals (visible directly above it) and finding they
did not match. Fixed in `reference-scenes.js` before this benchmark was
captured; both are consistent in every screenshot here.

A second, smaller layout bug (the closing `note` text overlapped the bars'
own per-key labels) was found the same way and fixed by moving `note` down
and growing the scene's canvas height from 580 to 600.
