# pruning r1 (Wondering target: Large Tree, alpha, Pruned Tree)

Renderer unchanged (main 18cf9fce8 plus the palette commit c41aeb8d5 on feat/teaching-palette, which only changes series colours; trees do not use them).
Spec: `panels` with two `tree` children and one link, operation alpha. `natural.svg`, `natural-2x.png` (720 x 260 at 2x).

Stops, nearest allowed thing used:

1. Tree node cap is 12: Large Tree is drawn with 12 nodes (root, 2, 4, 5 leaves), not 31; Pruned Tree has the full 7.
2. Every node needs a label of at least one character: nodes carry text (r, a, a1, l1), none is empty.
3. No per-level colour: a node has only id, label, parent, side (strict object, `role` is rejected); all nodes get one pale fill.
4. No shape field (rejected): all nodes are rounded rectangles, no circles or squares.
5. Tree edges are elbow lines with no arrowheads; no option.
6. Panel `label` and the child tree's required `title` both print, so "Large Tree" and "Pruned Tree" appear twice; the card also requires a top-level title ("Cost-complexity pruning").
7. The link is a thin sage arrow with alpha above it, not a thick dark arrow.
8. Each tree is fitted to its panel, so the two trees are drawn at different scales.

Not a stop: a tree inside panels is accepted and drawn.
