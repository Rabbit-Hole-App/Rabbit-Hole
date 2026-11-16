# pruning r3: the look is the default (feat/visual-sprint, on r2 86fdee5a2)

`spec.json` is the minimal spec: each node has id, parent and side only (no label, role, fill or title on a tree); the panels carry a label each, one link "α", and the card title. Besides those, the JSON holds only structure the schema needs: `version`, `kind`, and `layout: "binary"` (a node `side` is accepted only in the binary layout).

Everything in r2's look is now a default of an unlabelled binary tree and of panels of such trees: circles and squares (outline #32211C), depth fills (blue, teal, mustard, orange, lavender, rose, slate; coral leaves), straight edges with 10 px heads, cap 31, one shared node size and level spacing (circle 24, square 20, leaf pitch 26, level 56), shorter tree centred vertically, no panel borders, cream ground, the panel label as the only title, the 4 px operation arrow. `fill` stays an optional override. No styling field was needed; the one difference from r2 is that both level-1 nodes are teal (r2 set olive on the right one).

Changes since r2 (packages/web/src/tutor-diagrams):
- `dot-tree-layout.js`: sizes and pitch as above; own 10 px arrowheads.
- `ml-composition-layouts.js`: shorter tree centred (label with it); link gap 72.
- `ml-topology-spec.js`: a tree's `title` is optional; text of a dot tree.
- `spec.js`: a title is still required on the card and on every child, except children of panels of such trees (the panel label is their title).

Checked: SVG snapshot test (all 3271 fingerprints unchanged) and the TutorDiagram, content-contract and figures-render tests (28 pass). 636 x 355 at 1x.
