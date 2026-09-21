# Iteration v001 - static

## What this is

A single frame: three tokens ("river", "flows", "south") projected to Q/K/V
(IDENTITY axis, three slots), Q x K -> raw scores (grid, signed heat), scores
-> softmax weights (grid, magnitude heat, rows sum to 1), softmax x V ->
output (strip). Row 2 ("south") is highlighted through every stage so a
reader can trace one token's whole computation without re-deriving which
row is which.

Numbers are real, not decorative: scores are the literal Q[i]*K[j] products,
softmax rows sum to 1 (0.347+0.545+0.108, etc.), and the output strip is the
literal weighted sum of V using those weights. A reader can check the
arithmetic on screen, matching case 03's reference-notes.md requirement.

## Layout decision worth recording

First draft stacked Q/K/V vertically and fanned three arrows from the token
row down into all three - the arrows to K and V crossed straight through Q's
box on the way, and a long V-to-output arrow crossed over the scores and
softmax grids. Both are LAYOUT failures, not vocabulary gaps: arrow is a
single straight segment with no waypoints, so any topology has to be
authored so nothing sits between an arrow's endpoints.

Fix: V got its own row below the Q/K -> scores -> softmax chain, running
the full width to output with nothing else in that band, so the long
V-to-output line crosses empty space instead of content. The tokens -> Q/K/V
step dropped its arrows entirely in favour of vertical alignment + a caption
- the source's own equivalent figure (transformer_self_attention_vectors.png)
makes the same choice at this exact step, for the same reason: three
one-to-one arrows into a stack say nothing an aligned label doesn't already
say.

## Failure classification (cause axis, not just taxonomy)

- row-highlight-crowds-row-label: LAYOUT / cause: **template** - the grid
  render path has no reserved clearance between a rowLabel and a row-band
  highlight. Minor (not unreadable), tracked across later cases rather than
  fixed on the strength of one instance.
- no-explicit-tokens-to-qkv-connector: VISUAL_HIERARCHY / cause: **content**
  (a deliberate omission, explained above, not a missing capability).

No PRIMITIVE or TEMPLATE gap blocked anything in this case. No bespoke scene
workaround was used - every fix above is ordinary authoring (repositioning
objects, dropping three redundant arrows) with existing primitives.

## Patterns exercised

`flow` and `matrix_operation` pass. `zoom_drilldown` and `process_scrubbing`
are declared on this case but belong to the dynamic mode - a static frame
cannot exercise camera focus or scrubbing, so they are `not_exercised` here,
not passed or failed. They stay open until Phase 2.

## Reusable-system fix made mid-run - and a correction to it

The equation object rendered with no KaTeX styling - flat text, no
superscript - in the render harness. First diagnosis: `AnimatedScene.jsx`
calls `katex.renderToString` but never imports `katex/dist/katex.min.css`
itself, and the only other KaTeX caller, `MathText.jsx` (the chat/Ask
panel), does; a production build shows that CSS landing in `ask.jsx`'s own
build chunk (`dist/static/ask-*.css` carries the real KaTeX rules;
`dist/static/index-*.css`, the main bundle, does not). I concluded from
this that a real lesson page which never opens chat would ship the same
broken rendering, and wrote that up as an urgent, live product bug.

That conclusion was wrong, and worth recording the correction rather than
quietly editing it away. `main.jsx` imports `ask.jsx` **statically**, not
lazily, and `dist/index.html` confirms `ask-*.css` is an eager top-level
`<link rel="stylesheet">` - loaded on every real page regardless of route,
whether or not the learner ever opens chat. The break was specific to THIS
BENCHMARK'S OWN standalone render harness (`scene-render-harness.jsx`,
which mounts `AnimatedScene` alone, without `main.jsx`'s import graph), not
the shipped app. I generalised a harness limitation into a claimed
production defect without checking the one thing (`dist/index.html`) that
would have shown it was already eagerly loaded.

The fix itself - adding `import 'katex/dist/katex.min.css';` to
`AnimatedScene.jsx` - is still correct to keep: a component that calls
`katex.renderToString` should own its stylesheet rather than depend on a
sibling component's import order, and it also makes this benchmark's own
harness render correctly for every later case that uses an equation. But it
is a robustness improvement and a harness fix, not a rescued live bug, and
the earlier "stop rule 1, ship-blocking defect" framing overstated it.
Re-rendered this case after the fix - `static-00.png` now shows a correctly
italicised `softmax(QK^T)V` with a real superscript.

## Did this case require a bespoke scene workaround?

No.
