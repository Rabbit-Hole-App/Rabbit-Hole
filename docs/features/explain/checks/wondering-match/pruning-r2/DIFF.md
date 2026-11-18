# pruning r2: what changed (branch feat/visual-sprint, on feat/teaching-palette)

Files touched (packages/web/src/tutor-diagrams): five edited, one new.

- `ml-topology-spec.js`: tree node `label` optional; `role` ('internal' | 'leaf') and `fill` (blue, teal, olive, mustard, orange, coral, lavender, rose, slate); node cap 12 -> 31, but over 12 only when every label is at most two characters; `isDotTree` (a binary tree where any node has no label, a role or a fill); rules: a leaf square carries no label, a circle at most two characters, unlabelled or role/fill nodes need the binary layout; a one-line description for such a tree.
- `dot-tree-layout.js` (new): circles 28 (internal), squares 24 rx 3 (leaf), outline #32211C 1.5, straight parent-centre to child-centre arrows ending on the child's outline with the existing arrowhead, fill by depth (blue, teal, mustard, orange, lavender, rose, slate) and coral leaves unless `fill` is set; fixed node size and level spacing (56).
- `ml-topology-layouts.js`: the tree layout takes a dot tree first; every other tree is unchanged.
- `ml-composition-layouts.js`: `panels` whose children are all dot trees: no panel border, each panel exactly its tree's width (one shared scale), panel label bold 16 once and no child title, link = 4 px outline arrow with a 12 px filled head and the operation in 20 px bold above it.
- `TutorDiagram.js`: for those panels the card background is the cream ground #FFFCF0 (`--viz-surface`).
- `teaching-theme.js`: `orange` #F89830 (measured, approximate), `TEACHING_FILL` (names to colours), `TEACHING_DEPTH_FILLS`.

Deviations from the brief:
- Depth fills are blue, teal, mustard, orange, lavender, rose, slate: not TEACHING_SERIES order (that is blue, coral, teal, olive, ...). Level 1's right node uses `fill: olive` in the spec to match the target.
- The new look turns on only for a binary tree with an unlabelled node, a role or a fill, so labelled trees and all 3271 existing SVG fingerprints are unchanged (snapshot test run once: pass).
- Trees are top-aligned, so both root rows sit at the same height.
