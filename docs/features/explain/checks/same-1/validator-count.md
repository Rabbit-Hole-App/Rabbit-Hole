# SAME-1 b: the narrowed rule (Reviewer): what it rejects (offline count; the first, broad count is kept as validator-count-v1-broad.md)

Rule: a list-form transformation is rejected only when it has exactly ONE item before and ONE item after and both are text (tensor items exempt). Message: "A transformation of one item into one item shows nothing: write the concrete items before and after the operation, with their values, or use the kind the plan names." Implemented on `feat/same-1-validator` only (not on feat/same-1; it merges after Codex's gallery example lands).

Tree: feat/same-1-validator (spec.js rule). Script: `validator-count.mjs <tree> narrow` (default); `broad` reproduces the v1 count. Output: `validator-count.json`. No provider call.

## Count
- 469 library references: 53 list-form transformation diagrams found (each depth variant counted), 33 tensor-exempt, **4 rejected: 0 references, 1 kind-gallery, 3 kind-gallery-depths.**

| source | id | path | before -> after |
| --- | --- | --- | --- |
| gallery | kind-gallery.json[10] ("Water freezes") | diagram | 1 -> 1 ("Water" -> "Ice") |
| gallery-depths | kind-gallery-depths.json[10] ("How water becomes ice") | overview, standard, deep | 1 -> 1 ("Liquid water" -> "Ice") |

The six reference overview variants of the broad count (2 -> 1 and 1 -> 3, 1 -> 2) are accepted by the narrowed rule. Rejected only by the validator branch until the gallery example changes: the 4 gallery tests (`kind-gallery` 1, `kind-gallery-depths` 3) and `svg-snapshots`, plus the gallery token budget hash for the transformation entry; these go away with Codex's gallery example (explain/same-1-data).

Tests on the branch (spec.test.mjs): 1 -> 1 text rejected with the message; 2 -> 1, 1 -> 3, 1 -> 2, 2 -> 2 accepted; tensor items exempt (1 -> 1 tensor, tensor -> text).
