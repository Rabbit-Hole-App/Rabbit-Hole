# pruning r3: proportion only (feat/visual-sprint, on r2 86fdee5a2)

Files: `dot-tree-layout.js` and `ml-composition-layouts.js` only.

- Node sizes: circle 24, square 20, leaf pitch 26 (square 20 + gap 6), level spacing 56. The link gap shrinks 112 -> 72.
- The shorter tree is centred vertically on the taller one, its label with it: the pruned root sits one level below the large root and its leaves end on the large tree's level-3 row.
- Arrowheads: the tree edges draw their own 10 px head (4 px half-width) at a 1.5 px stroke instead of the 7 px marker.
- Result 636 x 355 at 1x (r2: 756 x 359). Narrower, not near-square: the height is the title, two label rows and four level steps of 56, which this round keeps.
