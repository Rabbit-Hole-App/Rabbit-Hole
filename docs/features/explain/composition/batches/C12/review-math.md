# C12 independent math and flow review

**PASS — no Important/Critical math, numeric-display or flow finding.** Reviewed exact frozen source `b215a93bbbd153543ca4fb6d60b0cd79600da12e` on canonical C11 base `2ac6017ece28f5dbbae8758df1a5acefcdccbf89`. The integrated root source at `5927b70805dc35bd8be26089a093684aac20ea4a` has byte-identical C12 data and references.

## Pin, authority and executed checks

- Worker worktree `/workspace/scratch/8367069fa9d9/c01-author-variants-repo` was clean at the frozen SHA. Data/reference bytes were independently compared with exact `git show` reads before import.
- `topic-multihead-attention-data.js` SHA-256 `5c82487bc060ed01a976d7145442a3b1505356c5cce9d33375bd4a0ef1d79534`.
- `composition-multihead-attention-references.js` SHA-256 `bc603f40d1efe0d9b6e1b68c171a5483716e0c5416dcc325818cc1550fa73ded`.
- Read the content proposal/accepted plan, frozen content-specs, implementation report, configuration, implementation and focused test assertions. Scratch implementation-report SHA-256 `be3c88208db23a788c599b6387e19731d1a4fa42aa31cf2e1d62c36cc378f9b1`; accepted plan SHA-256 `1a100058bebfa786a5eae9fa4fbd75a45193a416dbe5d7c3716b318d364b22af`.
- Ran my own Python matrix/index evaluator from independently declared H, projector columns, Pad and W_O, then compared against frozen `derived()` and all actual outgoing fields. **958 scalar numeric comparisons and 662 recursive structural/string/null comparisons passed**, across four cases, eight head cases, 16 score rows and all 18 fields. Numeric tolerance for raw floating results was 1e-14; integer slices, nulls, names and graph topology were exact.
- Independently matched all 18 official exported specs to the frozen reference objects; matched 54 existing receipt hashes (compact-spec receipt, pretty-spec bytes and 408-SVG bytes for each field). Checked actual node/edge identity attributes in all five existing relationship SVGs. Viewed the official Standard and Deep contact sheets for operand/identity/flow fidelity.
- No source edits, branch changes, suite, provider, build, new render or deployment was run. Only this scratch review report was written. Root's broad gates remain root-owned evidence, not tests independently rerun by this review.

## Independently derived projection and mask results

Both H_L1 and H_L2 are independently supplied I2 matrices. Valid input/query positions are P1/P2; Pad=(100,-99) is an excluded source, never a query. Each W_q/W_k/W_v is a 2×1 column. Valid Q/K/V are 2×1; appended K/V are 3×1; score and full weight matrices are 2×3. Head width is one, so the declared division by sqrt(d_h) is division by one.

The four supplied (layer,head) cases retain all 12 distinct (layer,head,role) parameter identities. Equal L1 A/B K coefficients do not tie parameter identities. Actual captions separately name both Q and both K maps, with layer supplied by the explicit title/context. L2 has its own assignments and is not a computed transition from L1.

Let a=0.8807970779778823 and b=0.11920292202211755, computed by stable softmax of (1,-1), before display rounding.

| Supplied case | Q | Appended K | Appended V | Eligible score rows | Full weight rows K1,K2,Pad | Context O |
|---|---|---|---|---|---|---|
| L1 A | (1,-1) | (1,-1,199) | (1,0,100) | (1,-1); (-1,1) | (a,b,0); (b,a,0) | (a,b) |
| L1 B | (1,1) | (1,-1,199) | (0,1,-99) | (1,-1); (1,-1) | (a,b,0); (a,b,0) | (b,b) |
| L2 A | (0,0) | (1,-1,199) | (1,0,100) | (0,0); (0,0) | (.5,.5,0); (.5,.5,0) | (.5,.5) |
| L2 B | (1,1) | (-1,1,-199) | (0,1,-99) | (-1,1); (-1,1) | (b,a,0); (b,a,0) | (a,a) |

Parenthesized Q/O entries above are entries of column matrices, not row-vector projection conventions. In the actual native views the column dimensions and row identities agree.

**Pad is excluded before softmax maximum and denominator.** The source filters eligibility before either operation; every full Pad weight is exactly zero. Its raw blocked display entry is null, rendered Masked; it is not a numeric zero logit. Extreme projected Pad operands 199/-199 and 100/-99 do not affect a valid weight or context. L2 A's valid weights are exactly one half each, not one third. No causal mask is asserted: both valid keys remain eligible for both queries.

The Standard comparison main correctly shows L1 A diagonal versus B repeated-K1 rows. Its mandatory detail shows supplied L2 A uniform versus B repeated-K2 rows. The same named B changes dominant key across supplied layers. The Overview uses the same query P2 for both heads; it does not falsely require their independently projected q values to be equal.

## Coordinate edit versus query-map edit

These are correctly separate controls in data, captions and outgoing values.

**Coordinate family:** the selected supplied L1/P2 role matrix is `R=[[-1,1],[-1,-1],[0,1]]`, rows Q/K/V and columns A/B. A[0:1] returns `[-1,-1,0]`; B[1:2] returns `[1,-1,1]`. Both copies rejoin to the exact original rows. The Deep supplied projected-Q edit changes only R[Q,B] 1→2; B becomes `[2,-1,1]`, while A and all K/V entries remain fixed. The actual caption explicitly states Q_B'=Q_B+1 and that projected operands are being edited. It makes no full-model query-isolation or layer-update claim.

**Head-comparison family:** the Deep query-map probe changes only L1 B W_q from (1,1)^T to (-1,-1)^T. Reprojection makes both B queries -1, rather than the coordinate family's selected +2. B's eligible score rows become (-1,1), and weights become (b,a,0) for both queries. A, both K maps and both V maps stay fixed. The mandatory raw-score detail belongs to that same edited L1 case: A rows (1,-1,null)/(-1,1,null), B rows (-1,1,null)/(-1,1,null). Its signed [-1,1] range is correct and is separate from the [0,1] probability views.

## Value probe, weighted contexts, concatenation and W_O

The parallel Standard main exposes all 12 valid Q/K/V operands and all 12 full masked-weight entries in its 6×4 grid. Columns are A/P1, A/P2, B/P1, B/P2. The first three rows are typed operands; only the last three source-key weight rows sum to one down each displayed column. The main is not a six-feature tensor and does not normalize its Q/K/V rows. Given map rows are input features and map columns are Q/K/V: W_A=((1,1,1),(-1,-1,0)), W_B=((1,1,0),(1,-1,1)).

The detail correctly uses O_h=A_h^valid V_h, where eligible A_h^valid is 2×2 and valid V_h is 2×1. The full alternative A_h V_tilde_h is also dimensionally consistent because Pad has zero weight. O_A and O_B appear as separate native tensors before J=[O_A|O_B]; concat places columns side by side and is not addition or averaging. Actual W_O=((1,1),(1,-1)) is complete, and Y=J W_O multiplies on the right.

| Case | O_A | O_B | Ordered J | Y |
|---|---|---|---|---|
| Base L1 | (a,b) | (b,b) | ((a,b),(b,b)) | ((1,a-b),(2b,0)) |
| B value-map edit | (a,b) | (a,a) | ((a,a),(b,a)) | ((2a,0),(1,b-a)) |

The value probe changes only B W_v from (0,1)^T to (1,0)^T. B Q/K, all B weights, every A quantity and H remain exactly fixed. Its actual selected W_B'=((1,1,1),(1,-1,0)) is correct. B's valid V becomes (1,0) and padded V becomes 100, still excluded. Every changed O/J/Y tensor is from that selected case; there is no stale Standard output detail.

Raw computations precede one display rounding to three decimals, with signed zero normalized to zero. Base displayed J=((.881,.119),(.119,.119)) gives displayed Y=((1,.762),(.238,0)). Probe displayed J=((.881,.881),(.119,.881)) gives displayed Y'=((1.762,0),(1,-.762)). Multiplying those displayed J entries by exact displayed W_O reproduces the displayed Y entries at three decimals. No largest-weight correction or incompatible raw/display arithmetic is used.

The independent query-map and value-map probes happen to yield the same full Y in this fixture through different calculations. The diagrams preserve their distinct controls and do not infer that the operations are equivalent.

## Identity-aware head-row display and honest edges

The joined-output family selects one query P1. Standard displays A/B values (.881,.119), builds z=(O_A,O_B)=(.881,.119), and computes y=(1,.762) with the independent W_O. Deep displays B/A rows (.119,.881), then uses head identity to rebuild the same model A/B z before the same W_O. The displayed row reorder is bookkeeping, explicitly stated in the outgoing main caption, not model equivalence.

As a countercheck, actually feeding reversed model coordinates (.119,.881) into fixed W_O would produce (1,-.762), which differs. The actual Deep output is therefore conditional on its real identity lookup and is correct.

Frozen graph topology and the five official existing SVGs agree:

- Parallel Overview: H→A and H→B. No serial A→B head chain.
- Parallel output details: A→J and B→J, then J→Y. Separate pre-concat outputs remain visible.
- Joined projection Standard/Deep: heads→z, z→y, supplied W_O→y. No z→W_O parameter-generation edge. The independent map node remains an actual numeric 2×2 operand.
- The selected y passed to the Next FFN detail is the same case/query vector as the main. FFN is a structural destination with input width two, no fabricated numerical FFN result, residual sum, normalization result or L1→L2 state transition. No duplicate merge is drawn.

The official Standard/Deep sheets preserve the same identities, shape labels, signed/raw versus normalized cells, supplied parameter roles and edge endpoints. The two native 444-wide mixed grids at requested 408 are not an arithmetic or shape failure; root separately accepted their glyph/readability review. This review did not rerender or replace that visual gate.

## Depth, inventory and preservation

Resolved inventory is exactly 4 Overview +7 Standard +7 Deep =18. All four Overview overrides and coordinate Standard/Deep explicitly clear details. No required default detail is lost through an old single replacement.

Primary counts under the unchanged helper agree with the accepted structure: coordinate 0<4, comparison 13<23, parallel 10<40, joined 2<14. Deep main additions are scientific controls/relations: projected Q_B'=Q_B+1; changed B query-map equation; selected B value-map equation and unchanged Q/K/weights; identity lookup z=(O_A,O_B) under reversed display rows. They do not rely only on a repeated digit, altered label, hidden detail or decorative count cue.

The full canonical-base→frozen diff contains nine paths: the accepted content doc, six new C12 module/test/manifest/receipt paths, and only two modified existing files. `reference-library.js` adds one import/spread; learner keywords append four new ids. Existing numerical/reference/API files, source briefs, singles, renderer/schema and old receipts are not modified. The new data module has its own parameters/derived exports and imports no prior numerical module. This is independent source-level preservation evidence; root's 510-reference/44-single equality and 4056-case replay remain separate global evidence and were not rerun here.

## Final verdict

**PASS at frozen worker b215a93bbbd153543ca4fb6d60b0cd79600da12e / matching integrated source 5927b70805dc35bd8be26089a093684aac20ea4a.** No correction requested. All independent projection/mask/context/output calculations, the controlled edits, native outgoing values, display-order lookup and inspected graph edges agree with the accepted case. Root retains publication and broad-gate ownership.
