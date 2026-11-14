# C03 final-candidate review

Final reviewed candidate: **`1fa256dfa`**, against fixed C02 base `f9634af3c`. The coordinator identifies final content/code as cherry-picked `37f6b8c` and `cc79cf`. This report **supersedes the earlier review of `8baba2b71`**, including its alignment composition/single description and 45-parent count. Reads used fixed `git show` objects. Review was read-only except this requested scratch report; no network, subagents, broad suite reruns or source mutations.

## Verdict and correction to the earlier review

**Final specification: PASS. Final implementation quality: PASS. No unresolved Critical or Important findings.**

Coordinator visual QA correctly found two defects the earlier review did not catch: token-links renders fixed Source/Target labels incompatible with decoder-target queries over encoder-source keys, and the ordered half-width alignment heatmap became unreadable at 408px. The earlier unconditional PASS was therefore too broad. Those were implementation defects in the unpublished draft, not merely pre-existing documented limitations. The final candidate removes both problematic realizations, and regression checks now inspect actual SVG role text and absence of composition scaling at 408px.

The final result uses the owner's permitted split across depths, with full-width supported native diagrams and no renderer/schema change. Distinct layer parameter identities now describe separate learned parameter sets without asserting numeric inequality of unavailable matrices.

## Final alignment behavior and targeted checks

| View | Final representation | Committed compact tokens |
|---|---|---:|
| Overview | One target-query row, full-width heatmap | 101 |
| Standard | Two target-query rows, full-width heatmap | 136 |
| Deep | Original selected-row weighted-context magnitude bars | 96 |
| Deep detail | Broader-query, full-width heatmap | 130 |

All alignment heatmaps explicitly label rows **Target query** and columns **Source key**. Target words `nous, lisons` remain distinct from source words `we, read, maps`; `<pad>` is present and null in every row. Overview shows one row, Standard and detail show both. Standard includes the source value vectors and says to mix them with each row. The data excludes padding before softmax and never uses its value vector in the sum.

Deep uses the original `nous` row and shows its coefficient/value sum in the caption, with context magnitudes in bars. I independently recomputed the visible arithmetic:

`0.576(2,0) + 0.140(0,2) + 0.284(1,1) = (1.436, 0.564)`.

This matches the final displayed bars exactly to the displayed precision. The separate broader-query heatmap derives from query scale 0.25 with the same valid keys and values; its caption identifies the change, preserved row normalization and excluded padding. It is no longer paired with an independently rounded broad-context bar result. No token-links alignment remains, no dense half-width alignment child remains, and no alignment single/pair receipt remains.

## Remaining educational review

- **Context rules:** unchanged Overview matrix preserves GPT-2, BERT and Transformer-XL as distinct categorical rules. Standard has matched token order and `read` focus, with null causal future cells versus permitted bidirectional cells. Captions explicitly identify permissions, not probabilities. Deep's additional Past columns expand memory while keeping current future keys unavailable. This remains a real causal invariant, not falsely normalized weights.
- **Contextual layer states:** lookup and contextual states remain distinct; four encoder rows include `[CLS]` and `[SEP]`, and each 4-by-2 shape derives from declared slots/features. Standard has two successive mix/FFN stages. Deep names the learned parameter sets `W_a,W_b` and preserves order/width; the separate GPT-style causal case retains one ordinary-token slot per position without conflating its context policy with BERT. Both Deep captions now avoid an unsupported numerical inequality claim.
- **Native reuse:** the unchanged memory graph has separate source and target-prefix streams and one memory handoff. The unchanged positionwise graph shows actual cross-position attention dependencies followed by independent shared-rule updates. The unchanged original decoder contains all three sublayers, three normalizations and residual joins, with source memory entering only its middle attention block. Native reuse remains justified.

## Metadata, author route and receipt contracts

The six associations still resolve to three NEW and three REUSE references. The previously inspected **17 unique source headings and verbatim summaries** remain unchanged by the final QA patch. Queue-to-registry mappings retain the original positionwise and decoder ids. Only the memory representative carries lesson `01`; alias lessons stay empty. The explicit catalog lesson addition remains outside the prompt/keyword-only overlays.

No legacy visual/data source was changed. REUSE merges remain additive; old prompts, keywords, useWhen and payloads are preserved. New imports remain acyclic and new routing keywords narrow.

**Context-rules is now the sole new linked-single parent.** It uses the native three-rule matrix. Alignment uses its native registry id at every author depth: heatmap for brief/balanced and bar-chart for detailed, with the broader heatmap detail available through the depth mechanism. Layer states remain native block-stack. The exact eligible parent count is **44 = 43 fixed-C02 parents + one C03 comparison**. Strict parent/single set equality and inheritance checks remain intact; only the unpublished alignment-single and its pair receipt were removed. No unsupported optional total or schema/tool/author-prompt extension was added.

The final targeted in-memory check evaluated committed modules from `1fa256dfa` and passed: expected alignment kinds/axes/null padding; one versus two rows; broad data identity; exact Deep visible weighted arithmetic; only the context-rules single; no matrix inequality claim; all **12 final depth/detail SHA-256 receipt hashes**; **53 fixed-C02 pair receipts unchanged**; old depth receipts unchanged; no alignment pair; exactly one C03 single receipt. The maximum NEW visual remains 234 compact tokens. Standard has zero coordinate plots, and the new layouts do not introduce nested compositions.

## Final validation evidence and scope

I inspected the coordinator's final evidence rather than rerunning broad work:

- `c03-full-green.txt`: **1,361 tests passed**, zero failures/skips.
- `c03-replay.txt`: **3,048 prior cases, zero moved**, 51/51 source hits, zero collisions; 45/45 paraphrases passed.
- `c03-actual-author-schemas.txt`: **192 actual schema cases plus 30 detail-schema cases passed**, six schema bundles.
- The coordinator reports final rendered sheets visually accepted. I reviewed the fixed code changes and SVG regression assertions; I do not claim an independent second visual-sheet inspection in this targeted follow-up.

These final results supersede the earlier 568-focused-test, 45-parent and two-single descriptions. No further implementation correction is requested by this review.

## Remaining documented expressibility boundaries

1. **d2l-transformer Figure 01:** the reused memory overview does not itself show shifted embeddings, positional features and all internal sublayers in one diagram. Its manifest explicitly bounds the claim and lists existing embedding/encoder/decoder supporting views. Those views retain their own data. This remains partial detailed-alias coverage, not a newly rendered complete architecture.
2. **Layer wiring:** the shape-only linear block-stack cannot render arbitrary tokenwise inter-layer joins or arbitrary routes between separately drawn stacks. Four-by-two tensors fit the eight-cell limit; full hidden vectors and general wiring remain outside this representation.
3. **Alignment layout/roles:** fixed token-links row labels cannot express this translation's target-query/source-key terminology faithfully, and the dense ordered half-width heatmap failed readability. These limits are now documented and respected by the full-width depth split; the earlier defective uses have been removed.
4. **Context-rules author reduction:** its linked matrix single carries all three categorical permissions without reproducing the two-grid comparison. This is the accepted single-view reduction, not an unreported missing single.

These remaining limits are explicit, not hidden with numeric text boxes or claims that generic nodes display omitted details.
