# red-figure-layout (pin)

Test: packages/web/src/tutor-diagrams/figure-layout.test.mjs:70 'small forces retain visible arrows and disclose their minimum size'.
Failed: expected polyline stroke-width="1.5", the drawn arrow has stroke-width="2".
Why: free-body arrows are drawn by connector() in tutor-diagrams/primitives.js (not wire(): not 2.5 as the brief guessed; the 2.5 widths are elsewhere).
Moving commit: 69c3e8dab "theme: the sprint look as the default for every teaching kind" changed connector() strokeWidth `path ? 3 : dashed ? 1 : 1.5` to `... : 2`
(primitives.js header comment: the tutor wire is "2 px ink"). Geometry (189,116 -> 197,116, the 8 px minimum), the arrowhead and the "minimum arrow length" note are unchanged and still asserted.
Decision: PIN, test only. The arrow is correctly drawn at the sprint wire width; source untouched. No other test imports figure-layout.js.
Files: before.txt, after.txt, hunk.diff.
