# Offline Explanation SVG deliverables

Task `06fd9ee8-13f9-49ed-8cab-8b2641410d99`. The 14 AI/ML references follow the pinned request. [Batch 3 request](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/87d7d3918b3b5632c82709baa4899a80cbc2f6af/docs/features/explain-on-canvas/handoff/phase02-library/batch-3-request.md)

## Build lanes

| Deliverable | Contract |
| --- | --- |
| Kind gallery | `kind-gallery.json` contains one neutral version-1 spec for each of the 21 kinds. Each compact spec is at most 200 tokens. All pass the linter and render at 320, 408 and 720 px. Use the relevant shape when the requested kind is known and topical selection finds none. |
| Content contracts | `content-contract.js` exports `lintDiagramContent(spec)` with stable rule codes and locations. Audit the original 160 before changing them. Repair labels, math markup and provably redundant pairs while preserving the teaching information. Run it on all author references and gallery shapes in focused tests. |
| Formula sampling | `formula-sampler.js` exports `sampleFormula({formula,xMin,xMax,samples}, {yMin,yMax} = {})` and returns numeric points. Parse the bounded allowlisted grammar, reject nonfinite and out-of-range samples, and deliver the module independently of runtime rendering. |
| AI/ML coverage | Register one reference per pinned prompt in `ml-batch3-*-references.js`. Keep this content change separate from fallback wiring. Replay the selector before and after, including the named collision controls, and run the original selector bench. |
| Renderer | Preserve plotted data and axis domains. Draw dots only at labelled points on lines over six points, use 3–5 ticks on each plot axis, verify step geometry, and narrow the relationship graph arrow gap. Render every audited reference and shape at all three widths with both renderers and include the diffs. |
| Correction corpus | Pair minimal rejected specs with valid information-preserving repairs. Cover the listed parser failures and use expected error paths and content checks. The corpus is offline test data. |
| Snapshots | Render all reference and gallery specs at all three widths and verify their SVG fingerprints. Keep a deliberate update command and a reproducible before/after export. |

## Integration order

- [x] Add the 14 topic records and check local selector picks independently of fallback changes. Preserve the pinned quantization and batch-normalization keyword baseline.
- [x] Audit the original 160 with the content rules, fix violations, and verify the entire current reference set and 21 shapes.
- [x] Integrate sampler and correction fixtures. Verify the renderer changes and full gallery diffs.
- [x] Lock expected SVG outputs, run focused tests and the web build, and record the observed results in the Claude handoff.
- [x] Run the original selector bench on the two exact trees. Record the 14 best-kind additions and all preserved picks in the [Claude handoff](../../features/explain-on-canvas/handoff/phase02-library/svg-offline.md).
