# Rabbit Hole interaction holdouts

Generalization test for the interaction vocabulary (reviewer's request). Two
scenes NOT used while building the runtime, authored ONLY from existing input
types (index/bool/choice/indices/vec2), existing derive ops and the generic
renderer - no new primitive, input type, scene-ID branch, or bespoke renderer.

| Case | Shape | Built from | Coordinated views |
|---|---|---|---|
| h1-repo-navigator | repo -> file -> class -> function | one `index` (`nodeIndex`, visual chips) + `pick` | breadcrumb, architecture highlight, code excerpt |
| h2-cnn-inspector | image -> layer -> channel | two `index` (`layerIndex` picker, `channelIndex` slider) + nested `pick` | feature-map heat grid, caption |

Both express with no runtime change. Vocabulary gaps this surfaced (reported,
not worked around) are in docs/rabbit-hole-interactive-visuals-ledger.md:
multi-line text/code has no primitive (SVG text is one line - the code excerpt
is one signature line); a dependent per-level domain (level N options that
depend on level N-1) is not expressible, so the tree is flattened to one
index; a vertical clickable text list has no primitive (chips are horizontal).
