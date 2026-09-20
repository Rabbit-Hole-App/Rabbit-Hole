# Source

Canonical URL:
https://jalammar.github.io/illustrated-transformer/

Section: "Self-Attention in Detail"

Licence: CC BY-NC-SA 4.0 — https://creativecommons.org/licenses/by-nc-sa/4.0/
(restrictive; see ../../../../REFERENCE-LICENSING.md)

Attribution:
Alammar, J (2018). The Illustrated Transformer [Blog post]. Retrieved from
https://jalammar.github.io/illustrated-transformer/

Captured: 2026-09-20

Per the restrictive policy, the captured images are not committed here. They
are cached at `.local-benchmark-cache/illustrated-transformer/` (gitignored)
and catalogued in `reference-manifest.json` alongside this file.

## Relationship to reference/synthetic/

`static-00.png`, `dynamic-{00,25,50,75,100}.png` and `contact-sheet.png` live
in the sibling `reference/synthetic/` directory: a pre-existing, separately-
declared fixture. `target.json` marks them `referenceType: synthetic_internal`
and says explicitly they are internal reconstructions, not captures of this
source. They were not created or removed as part of adding this real
external reference, and the `reference/synthetic/` vs `reference/external/`
split exists specifically so a refresh of one can never silently delete the
other — see `target.json`'s `syntheticReferenceFiles` and the existence
check in `viz-benchmarks/check-synthetic-fixtures.test.mjs`. Whether this
case's benchmark scoring should read the real reference below, the synthetic
fixture, or both is a decision for a human — this file only adds the real
capture Phase 1 asked for.
