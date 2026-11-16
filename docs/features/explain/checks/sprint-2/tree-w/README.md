# TREE-W (sprint 2): tree node width cap

Commit on feat/visual-sprint-2-flow (ml-topology-layouts.js only, topDown: a tree-specific function, no shared file; hunk.diff), on top of FLOW-T (cbdc33a78). before = 77218dcad.

Rule: the shape of a top-down tree (hierarchy / binary layout) does not change. When it would pass the width budget (the request, at least 720, at most 960) the node width cap (150 at a 408 request; it sets every label's wrap width) goes down in steps of 5 until the tree fits, to the floor of 120 (TREE_NODE_FLOOR). A word is never split, so a node never gets narrower than its longest word. Trees that fit are untouched (scan of all 1225 specs: only learning-families changed).

| figure | request | before | after (floor 120) |
|---|---|---|---|
| learning-families | 408 | 940 x 336 | 714 x 336 (floor 100; 825 at floor 120) |
| learning-families | 720 | 940 x 336 | 720 x 336 |

## It cannot reach 720 at the floor of 120 (and why)
The widest tier is the six leaf cards, each at least as wide as its longest word plus 20 px of padding ("Dimensionality" 120, "Classification" about 115, "Policy"/"Optimization", "Value"/"Learning" ...), plus 5 sibling gaps of 18 px and the 24 px margins. At cap 120 that is 825 px.
Measured with the floor lowered: cap 110 -> 774, cap 100 -> 714 (<= 720), cap 90 and 86 -> 714. At 100 the three labels whose longest word is wider than the card ("Classification", "Dimensionality Reduction", "Policy Optimization") take the renderer's existing one-font-step fallback (14 px instead of 15, nothing clipped): learning-families-408-floor100.png (714 x 336). The floor is one constant (TREE_NODE_FLOOR in ml-topology-layouts.js); 100 reaches the owner's target at the cost of those three smaller labels. Floor 100 is now committed (owner read): learning-families-<408|720>-after are the floor-100 renders; hunk-floor100.diff is that commit. The earlier floor-120 render (825) is superseded.
Files: learning-families-<408|720>-<before|after>.png/.html, learning-families-408-floor100.png/.html, sizes.txt.
Tests run singly: ml-topology.test.mjs 16 pass, 0 fail; ml-batch3-topology.test.mjs 14 pass, 0 fail; lesson-decision-trees-references.test.mjs 24 pass, 0 fail.
