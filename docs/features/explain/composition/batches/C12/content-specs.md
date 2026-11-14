# C12 accepted content plan — four complete native families

Accepted source proposal SHA25651a905f666051563ae0ed5b4e9d1ba8a0aee89571f30314cf0286cba91ea11a1; independent c12-content-prereview.md PASS. C12 implementation remains gated on pushed canonical C11 and explicit root GO. This scratch plan creates no repository/branch/runtime/JavaScript/spec/test/snapshot change. It carries final binding shapes only; no superseded alternate is selected.

Decision carried from `c12-content-audit.md`: **4 NEW queued targets, 0 REUSE, 16 source headings, 1 subject (`multihead-attention`)**. All family, representative and per-source lessons remain **[]**. Preserve the four original queue records, ids, dedupeBasis, sequences, source kinds, gap metadata and all16 headings. No extra target, source architecture, lesson union, legacy reference rewrite or overlay is proposed.

The audit pinned old measurements/picks to root `a402edc19f46a0e78f84c5655cdc82bcad16327a`; proposal preparation observed root `87bb5ecc551cad9e037a07d147fd049b2cf130a2`. Source briefs remain revision `05d5f02f64b474dcf0f830050af4e34907fbdaa8`. Old fused-QKV main776 and old concat detail752 still cannot fit a680 request. The old multihead parent is not a substitute: ordinary public author selection sends its grouped-bar single and drops its details.

## Binding shared numerical case

Use one explicitly named small case, `twoHead`, rather than borrowing the old six-token walkthrough or C07 rounded outputs. There are **two valid positions P1/P2, two input features, two heads A/B, one feature per head, and one excluded source Pad**. Both supplied layer cases use the same valid input rows

$$H_{L1}=H_{L2}=\begin{pmatrix}1&0\\0&1\end{pmatrix}.$$

These are independently supplied toy layer inputs and parameter sets. No diagram may claim to compute H_L2 from H_L1, from Y_L1, or from an unworked FFN/residual update. The padded source row is supplied as h_Pad=(100,−99); it is not a valid query row. Its eligibility is false in every head/layer case.

Projector identity is (supplied layer, head, projection role). Equal chosen coefficient arrays do not tie parameter identities: L1 A/B happen to have equal K-column values but retain separate head projectors. Visible head-comparison notation names both K maps rather than implying one shared parameter.

Each head's W_q,W_k,W_v is a **2×1 column**. Write Q_h=HW_qh, K_h=HW_kh, V_h=HW_vh. Valid Q,K,V are2×1 matrices, not1×2 row vectors. Append the projected padded source to K_h and V_h to form K̃_h,Ṽ_h of shape3×1; there is no padded query row. Score rows are valid query positions, columns are all three source key slots:

$$S_h=Q_h\widetilde K_h^T/\sqrt{d_h}\quad(2\times3),\qquad d_h=1.$$

Set Pad's logit to blocked before the stable softmax; maximum and normalizer include only eligible K1/K2. A_h is2×3 over ordered columns K1=P1,K2=P2,Pad, with literal zero Pad weights. O_h=A_hṼ_h is2×1, with the excluded Pad's contribution zero. Equivalently the two eligible columns of A multiply valid V_h(2×1); call this eligible2×2 weight matrix $A_h^{\mathrm{valid}}$ in the output caption. Tables/captions using Q_hK_h^T refer to that eligible2×2 score submatrix before appending the zero Pad weight. This is noncausal encoder-style eligibility: both valid positions are available to both valid query positions.

| Supplied case | W_q column entries | W_k column entries | W_v column entries | Valid Q | Valid K | Valid V |
|---|---|---|---|---|---|---|
| L1 A | (1,−1) | (1,−1) | (1,0) | (1,−1) | (1,−1) | (1,0) |
| L1 B | (1,1) | (1,−1) | (0,1) | (1,1) | (1,−1) | (0,1) |
| L2 A | (0,0) | (1,−1) | (1,0) | (0,0) | (1,−1) | (1,0) |
| L2 B | (1,1) | (−1,1) | (0,1) | (1,1) | (−1,1) | (0,1) |

All parenthesized Q/K/V lists in this parameter table denote the entries of their column matrices. The L1 combined learned toy maps, with column order Q,K,V, are

$$W_A=\begin{pmatrix}1&1&1\\-1&-1&0\end{pmatrix},\qquad W_B=\begin{pmatrix}1&1&0\\1&-1&1\end{pmatrix},\qquad [Q|K|V]_h=HW_h.$$

The supplied padded row yields L1 K_Pad=199 in both heads, V_Pad,A=100 and V_Pad,B=−99; L2 B has K_Pad=−199. These extreme operands are excluded, never normalized and then suppressed. No learned-quality or trained-checkpoint claim follows from these toy maps.

Let a=1/(1+exp(−2))≈.8807970779778823 and b=exp(−2)/(1+exp(−2))≈.11920292202211755; mathematically a+b=1. Stable evaluation uses full precision, not those shortened decimal literals.

| Case | Valid score rows | Full weight rows K1,K2,Pad | Pattern |
|---|---|---|---|
| L1 A | (1,−1); (−1,1) | (a,b,0); (b,a,0) | Near-diagonal. |
| L1 B | (1,−1); (1,−1) | (a,b,0); (a,b,0) | Same dominant K1 across queries. |
| L2 A | (0,0); (0,0) | (.5,.5,0); (.5,.5,0) | Broad exact-uniform valid weights. |
| L2 B | (−1,1); (−1,1) | (b,a,0); (b,a,0) | Same dominant K2 across queries. |

L1 P2 is the explicit same-query-position contrast: A favors K2, B favors K1. The input query position is shared; each head's projected query is its own result, so the projected q values need not be identical. L1 A/B distinguish diagonal versus key column; L2 A/B distinguish broad versus isolated/repeated-key reads; the **same named Head B** changes its dominant key between supplied L1 and L2. Do not confound a head change with a layer change.

For L1 the actual head outputs and ordered join are

$$O_A=\begin{pmatrix}a\\b\end{pmatrix},\quad O_B=\begin{pmatrix}b\\b\end{pmatrix},\quad J=\operatorname{Concat}_{A,B}(O_A,O_B)=\begin{pmatrix}a&b\\b&b\end{pmatrix}.$$

Use an explicit output matrix and multiply on the right:

$$W_O=\begin{pmatrix}1&1\\1&-1\end{pmatrix},\qquad Y=JW_O=\begin{pmatrix}1&a-b\\2b&0\end{pmatrix}.$$

Thus H(2×2), each head output O_h(2×1), J(2×2), W_O(2×2), and Y(2×2) have truthful toy widths. There is one context scalar per head per valid query, concatenated into two coordinates per query, then projected to residual-stream width2. A subsequent FFN role can be shown; its numerical computation is outside this case.

### Precision policy

Derive Q/K/V, scores, eligible stable exponentials, weights, products, O, J and Y once from the declared full-precision parameters. Store raw quantities independently from display values. Round numerical display once to3 decimals, convert signed zero to0, and preserve a,b pair order. Every displayed row sums exactly to1 here without a rounding correction; Pad is exactly0. No full-precision result may be placed beside incompatible displayed operands.

Displayed L1 head outputs are O_A=(.881,.119)^T, O_B=(.119,.119)^T; J=((.881,.119),(.119,.119)), Y=((1,.762),(.238,0)). Multiplication from these displayed J entries and the exact displayed W_O produces the displayed Y entries at3 decimals. Coordinate slicing copies exact integer entries; no rounding occurs in that family. All extra/probe factories must use their selected case, never a stale inherited Standard tensor.

## 1. ml-multihead-attention-head-coordinate-slices

**Point:** splitting into heads partitions each already projected Q/K/V vector at identical coordinate boundaries; it does not recompute QKV, score attention, average heads or concatenate context outputs. Source is illustrated-gpt2 Figure46; lessons[].

Use active L1 position P2. Projected rows, in immutable Q,K,V order, are

$$R=\begin{pmatrix}-1&1\\-1&-1\\0&1\end{pmatrix}.$$

Each row has projected width2=2heads×1feature. Half-open coordinate columns [0:1] give Head A's Q/K/V column (−1,−1,0)^T; [1:2] give Head B's (1,−1,1)^T. The display matrix is explicitly rows Q,K,V, not three query positions. Each output retains that same role order.

| Depth | Main | Detail / probe |
|---|---|---|
| Overview | ONE native1×2 tensor of the supplied projected query Q=(−1,1) at L1/P2. Existing tensor name/title/caption identifies coordinate order A,B and head bounds A[0:1], B[1:2]; no slice outputs or links are drawn yet. | None: explicit detailSpec:null. This is one projected operand rather than Standard's full QKV split operation. |
| Standard | Native item-list tensor transformation: one3×2 R input to two3×1 output tensors. Before label identifies L1/P2 and Q,K,V rows; outputs explicitly identify Head A/B and the same role-row order. Two real links carry the two slices; operation names both ranges. | None: explicit detailSpec:null. Main carries the entire source point and all six coordinates. |
| Deep | Same full transformation with only supplied projected Q's coordinate1 changed from1 to2: R′=((−1,2),(−1,−1),(0,1)); A stays(−1,−1,0), B becomes(2,−1,1). The main explicitly states $Q_B'=Q_B+1$ at this selected L1/P2 coordinate. | None: explicit detailSpec:null. No original-case comparison detail is added; the complete main probe is sufficient. |

The implicit probe is coordinate locality: only Head B's query coordinate changes, while all K/V coordinates and Head A are identical. Rejoining corresponding role rows reconstructs R or R′ exactly. This is a controlled edit of supplied projected operands, not a claim that a full model's Q can change independently of its input/parameters.

Draft Standard caption (103 shown characters): “Toy L1 P2. Rows Q,K,V; slice columns $[0:1]$ to A, $[1:2]$ to B. Each projected width $2=2\times1$; no values mix.”

Draft Overview caption (126 shown characters): “Supplied L1 P2 query coordinates, ordered A,B. Head bounds $A[0:1]$, $B[1:2]$; projected width $2=2\times1$. Slicing follows in Standard.”

Draft Deep main caption (127 shown characters): “Supplied L1 P2: $Q_B'=Q_B+1$ only. All K/V and Head A stay fixed; same slices. This edits projected operands, not a layer update.”

This simplification is binding under the unchanged primary-count linter. A native tensor primary counts0 in its current elementCount; Standard's two native slice links count2 (or4 if both have labels). The old two-output Overview transformation would count the same2/4 as Standard even with fewer tensor cells, so it is not retained. The revised Overview also genuinely draws fewer operands/operations. Deep's edit formula is mandatory: numeric2 alone is already present in Standard's dimensions and does not establish a new number/formula fact.

Keywords: `aligned head slices`, `qkv coordinate partition`. useWhen: show identical numeric head-coordinate boundaries across Q,K,V; exclude QKV projection itself, head-output concatenation, averaging, lost role order or literal large-model dimensions.

Five narrow paraphrases:

1. Show aligned head slices for all three projected QKV rows at P2.
2. Trace the qkv coordinate partition into Head A and Head B without changing any values.
3. Keep identical half-open boundaries in aligned head slices for queries, keys and values.
4. Rejoin the qkv coordinate partition and recover the original projected rows.
5. Edit one projected query coordinate and identify which aligned head slice changes.

## 2. ml-multihead-attention-head-weight-comparison

**Point:** heads use their own projections on the same positions and normalize independently; separate head/layer rows preserve provenance that a merged edge picture loses. Default main/detail must carry all eight source headings, including the four distinct D2L Elements lists sharing one prompt. Lessons[].

Use native numeric heatmaps with fixed range[0,1] for every normalized-weight view, query rows labelled with **supplied layer, head and query position**, and ordered key columns K1=P1,K2=P2,Pad. Standard main rows L1/A/P1,L1/A/P2,L1/B/P1,L1/B/P2 are (a,b,0),(b,a,0),(a,b,0),(a,b,0). Detail rows L2/A/P1,L2/A/P2,L2/B/P1,L2/B/P2 are (.5,.5,0),(.5,.5,0),(b,a,0),(b,a,0). Never merge or average rows across head identity. The Deep raw masked-score detail is a different numerical quantity and explicitly uses signed range[−1,1]; it cannot inherit the probability range.

| Depth | Main | Detail / probe |
|---|---|---|
| Overview | L1 P2 only: two head rows (b,a,0) and(a,b,0), same query/key positions, explicit A/B. | None: explicit detailSpec:null. Two rows versus Standard's four. |
| Standard | Full4×3 L1 weight grid, visible shared H=I2 and actual L1 W_qA,W_qB,W_k column coefficients. Caption declares d_h=1, eligible row softmax and pre-softmax padding exclusion. | Full4×3 supplied-L2 grid, its own declared projector coefficients, same positions/mask/range. This is necessary default source coverage, not a Deep-only extra. |
| Deep | Full4×3 **L1 B-query-map edit**: only W_qB changes (1,1)^T→(−1,−1)^T. A rows stay(a,b,0),(b,a,0); B rows become(b,a,0),(b,a,0). Labels say edited L1, not L2. | Full4×3 masked-score grid for that same edited L1 case: A scores(1,−1,null),(−1,1,null); B scores(−1,1,null),(−1,1,null), signed range[−1,1]. It explicitly shows exclusion before normalization and names raw scores rather than probabilities. A separate baseline is not silently inherited. |

The complete implicit probe is head independence: changing only B's query projector leaves every A row unchanged and changes B's dominant key. It does not claim the combined output is invariant. Keep the shared input and source order fixed. The padded raw-key sign can be independently changed in a later numerical check, but no extra diagram is required for that second optional probe. Do not falsely call the edited-L1 case a computed next layer simply because its B weights equal supplied L2 B's weights.

Standard main caption content (split independent complete assignments for wrapping): “Toy $H=I_2$; $W_{qA}=(1,-1)^T$; $W_{qB}=(1,1)^T$; $W_{kA}=(1,-1)^T$; $W_{kB}=(1,-1)^T$; $d_h=1$. $A_h^{\mathrm{valid}}=softmax_{K1,K2}(Q_hK_h^T)$; Pad blocked.”

Standard detail caption content (independent complete assignments): “Supplied L2 $H=I_2$; $W_{qA}=(0,0)^T$; $W_{qB}=(1,1)^T$; $W_{kA}=(1,-1)^T$; $W_{kB}=(-1,1)^T$. Row softmax; Pad blocked; $d_h=1$.” Titles and row labels explicitly say separate head rows retain attribution. The mask captions mean blocked **before** the written softmax, not a finite Pad score0.

Keywords: `layer head patterns`, `masked head contrast`. useWhen: compare derived independently normalized head patterns with fixed positions, explicit layer/head identities and masked padding; exclude one unlabelled head, averaged head weights, an unsupported trained-pattern claim or a fake layer transition.

Five narrow paraphrases:

1. Compare layer head patterns using the same valid source keys and padding mask.
2. Show masked head contrast between a diagonal head and a repeated-key head.
3. Keep head and query identities visible in layer head patterns across supplied L1 and L2.
4. Explain the broad-versus-isolated masked head contrast without pooling the heads.
5. Change only Head B's projector and recompute layer head patterns while Head A stays fixed.

## 3. ml-multihead-attention-parallel-heads-and-join

**Point:** each actual head returns one context for each query; heads run in parallel on shared inputs; ordered concatenation and projection follow the separate head outputs. Default main/detail must show numeric Q/K/V, distinct head patterns, both per-query output vectors, joined rows and the projected result/FFN destination. Lessons[].

### Default main: compact complete operand and weight grid

Use **one native6×4 heatmap**, range[−1,1], with columns A/P1,A/P2,B/P1,B/P2 and title explicitly identifying supplied L1. Its rows are quantity identities, not six model features:

| Quantity row | A/P1 | A/P2 | B/P1 | B/P2 |
|---|---:|---:|---:|---:|
| Q | 1 | −1 | 1 | 1 |
| K | 1 | −1 | 1 | −1 |
| V | 1 | 0 | 0 | 1 |
| weight K1 | a | b | a | a |
| weight K2 | b | a | b | b |
| weight Pad | 0 | 0 | 0 | 0 |

Each Q/K/V entry belongs to that head at that input position; the two K/V position columns supply the eligible key/value sequence for that head. Each weight entry belongs to the column's **query** and the named **source key** row. In this displayed transpose, each column's three weight cells sum to1; Q/K/V cells are operands and are never included in that normalization. The underlying attention matrix still normalizes each query row across eligible source-key columns. This is an explicitly transposed numeric computation grid, not a literal6-feature activation tensor. Visible row/axis labels or caption must carry this quantity/normalization distinction; it cannot exist only in data or useWhen. Match row types when inspecting color; the comparison reference separately uses a pure[0,1] probability scale. No unsupported per-row scale or row-group field is introduced.

The caption carries every actual projector coefficient and operation; split independent complete assignments into separate balanced math spans for real wrapping: “Toy $H=I_2$; $[Q|K|V]_h=HW_h$; $W_A=((1,1,1),(-1,-1,0))$; $W_B=((1,1,0),(1,-1,1))$. $A_h^{\mathrm{valid}}=softmax_{K1,K2}(Q_hK_h^T)$; $d_h=1$; Pad blocked.” Thus the default does not rely on hidden matrices or another unselected reference. All12 projected operands and both complete valid-query weight patterns are numeric cells. The eligible matrix is named distinctly from scalar a; softmax returns one distribution per query, not that single scalar.

### Default detail: separate outputs before ordered concatenation

Use a native connected relationship graph with **four bounded tensor nodes**:

- O_A:2×1, rows P1/P2=(a,b).
- O_B:2×1, rows P1/P2=(b,b).
- J:2×2, rows P1/P2, ordered head columns A,B=((a,b),(b,b)).
- Y:2×2, same query row order, output features0/1=((1,a−b),(2b,0)).

The only graph edges are O_A→J labelled A column, O_B→J labelled B column, and J→Y labelled multiply W_O. The first two head outputs are visibly separate before the join. They are independent inputs to concatenation; neither creates the other. Shared H and separate projectors/stages are visible in the main. The complete output matrix is an explicitly supplied parameter in the detail caption, not a node computed by J.

Draft detail caption (89 shown characters): “Rows P1,P2. $O_h=A_h^{\mathrm{valid}}V_h$; $J=[O_A|O_B]$; $W_O=((1,1),(1,-1))$, $Y=JW_O$. Width2 feeds FFN.” The ordered column join is the same Concat A,B operation; both head contexts, its eligible weighted-value calculation, the actual output matrix and its projected result remain explicit. Native dimensions on all four tensors carry2×1→2×2 and final width2. No add/multiply merge is used to mean concatenation.

| Depth | Main | Detail / probe |
|---|---|---|
| Overview | Three-node native graph: shared numeric H(2×2) forks to numeric O_A(2×1) and O_B(2×1); caption explicitly summarizes the toy project/score/mix stages and names these as derived head contexts. No concat yet. | None: explicit detailSpec:null. Eight numeric cells versus Standard main's24. |
| Standard | Complete6×4 projected-operand/weight grid above. | Complete four-node head-output→concat→projection graph above. Both source points arrive on the default author route. |
| Deep | Same complete grid with **only B's value projector** switched (0,1)^T→(1,0)^T. Q/K and all weight cells stay fixed. V's B/P1,B/P2 entries become1,0. Actual selected-case maps/labels/caption must state this change. | Same graph topology with O_A=(a,b)^T unchanged, O_B′=(a,a)^T, J′=((a,a),(b,a)), Y′=((2a,0),(1,b−a)). Every numeric node uses the changed case. |

Raw Deep Y′≈((1.761594155956,0),(1,−.761594155956)); displayed J′=((.881,.881),(.119,.881)) and Y′=((1.762,0),(1,−.762)) agree from their displayed operands at3 decimals. The actual combined B map is now W_B′=((1,1,1),(1,−1,0)); Deep must visibly use this map rather than the Standard caption's W_B. The implicit probe is independence of head value mixing: only B's V/output changes; A, both heads' weights and all query/key positions stay fixed. The combined result generally changes. This choice deliberately avoids a twice-scaled fractional value probe whose shown intermediates would disagree with raw-rounded output.

Keywords: `parallel head outputs`, `per query join`. useWhen: numeric independent projected heads, per-query score/mix results and ordered concat/projection from shared positions; exclude a weights-only comparison, a one-query-only substitute, hidden QKV or a serial head chain.

Five narrow paraphrases:

1. Trace parallel head outputs for both query positions before concatenating them.
2. Show the per query join from independent QKV operands through actual head contexts.
3. Keep Head A and Head B separate in parallel head outputs until the ordered join.
4. Recompute the per query join after changing only Head B's value projector.
5. Show parallel head outputs, their ordered columns and the projected width sent to FFN.

## 4. ml-multihead-attention-joined-head-output-projection

**Point:** distinct head outputs concatenate in a declared head order, increasing width by the sum of head widths; an explicit independent learned W_O mixes those coordinates into the width expected by the stream, followed by FFN. Lessons[]. Use the same L1/P1 head outputs A=a and B=b, not a new unrelated example.

Default main is a native four-tensor relationship graph:

- Head-output array2×1: rows A,B, one scalar per head=(a,b)^T.
- Joined vector z1×2: declared coordinate order A then B=(a,b).
- Supplied output weight W_O2×2=((1,1),(1,−1)).
- Projected y1×2=(1,a−b), labelled residual-compatible width2.

Edges are head-output array→z (concatenate A,B), z→y (input), W_O→y (learned map). No z→W_O edge. The head-indexed2×1 input array is a display of two distinct1-coordinate head outputs, not a2-position batch. Its1×2 joined output represents one query with two ordered coordinates. Output dimensions and the equation1+1=2 make it impossible to confuse the result with the one-coordinate average.

Default detail learner caption states: “The selected projection has width2 and becomes the input to the next feedforward network.” The limitation that no numeric FFN output/residual is computed belongs in the batch report. Default detail is a **native two-block stack**: that same actual y tensor followed by a block named Next FFN with structural input width2. It identifies the expected stream width and ensuing sublayer without fabricating an FFN result or performing a residual addition. A sequential arrow into FFN is honest here; concat is already computed in the main. No merge or residual edge is needed.

| Depth | Main | Detail / probe |
|---|---|---|
| Overview | Native item-list tensor transformation from the two-row A/B head-output array to z1×2, with exact ordered-copy/concat operation. | None: explicit detailSpec:null. Four numeric cells versus Standard's ten. |
| Standard | Four-tensor graph showing head outputs, ordered z, explicit W_O and y. | The same y→Next FFN native stack, width2 explicit. |
| Deep | **Display-only head-row reorder**: the input array displays rows B,A=(b,a)^T, but identity lookup explicitly constructs $z=(O_A,O_B)$ in declared model order A,B before the fixed W_O. z, W_O and y stay unchanged. This conditional identity formula appears in the Deep main; node labels and edge operation also say displayed B,A versus model A,B. | Same selected-case y→Next FFN stack, explicitly specified for this depth. It is not an unlabelled inherited reference. |

The complete implicit probe is identity bookkeeping: changing display order while retaining the declared model head order does not change the computation. This is **not** a claim that actually feeding z=(b,a) into fixed W_O is equivalent. The actual-input-order counterfactual would give(1,b−a), displayed(1,−.762). If both true model head outputs and W_O row blocks were permuted, one could derive a conditional equality, but this proposal does not call that a whole-model symmetry or silently change parameters. The chosen Deep probe keeps the model input order fixed.

Standard main caption (106 shown characters): “Toy L1 P1; head rows A,B become $z=Concat(A,B)$, then $y=zW_O$. Width $1+1=2$; output width2 matches the stream.” W_O's actual coefficients are in its numeric tensor.

Draft Deep main caption (128 shown characters): “Display B,A; identity lookup builds model $z=(O_A,O_B)$ in A,B order. Fixed $W_O$ and y. Display bookkeeping, not model equivalence.”

The explicit identity-lookup formula is part of the computation explanation, not a new-value or model-order equivalence claim. It also supplies the meaningful new formula required by the unchanged Deep-main linter; permuting the same numeric value set or adding an unchanged detail cannot satisfy that requirement by itself.

Keywords: `ordered head projection`, `concat matrix mixing`. useWhen: head-identity-preserving numeric concat plus actual output weights, result width and subsequent FFN; exclude averaging, an omitted W_O, a shape-only map, a display reorder claimed to be a model symmetry, or an unworked residual/FFN output.

Five narrow paraphrases:

1. Show ordered head projection from separate head values through the actual output matrix.
2. Trace concat matrix mixing while keeping A then B as the model coordinate order.
3. Explain why ordered head projection returns width2 rather than a one-value average.
4. Reverse only the displayed head rows and preserve identity during concat matrix mixing.
5. Show ordered head projection reaching the residual-width input of the next FFN.

## Default source completeness and dedupe

| Family | Default point-carrying view(s) | Source coverage |
|---|---|---|
| Coordinate slices | Complete Standard main: all Q/K/V role rows and both exact slices. | IG46. |
| Head comparison | Standard main L1 + mandatory detail L2, each with true head/layer/query/key identities, projectors, mask and common probability scale. | IT16 independent projections; IT20 shared P2/different maxima; IT21 separate head attribution; D2L06/07 L2 isolated/repeated versus broad; D2L08 L1 diagonal versus column; D2L09 same Head B changes by supplied layer; IG47 same-position head contrast. |
| Parallel heads/join | Standard main numeric Q/K/V and weights; mandatory detail separate per-query outputs followed by ordered concat and explicit projection/FFN destination. | IT17 pre-concat per-head output stage; IT19 shared-input parallel workflow and join; D2L multihead01 actual independent projected operands/patterns/combined width. |
| Joined projection | Standard main actual head inputs, concat, W_O and y; mandatory detail same y's stream-width/next-FFN context. | IT18 all output-projection operands/results; IG51 concat preserves head order and summed width; IG52 explicit matrix mixing; IG53 compatible stream width and ensuing FFN. |

No source point is assigned to another unselected reference or made Deep-only to rescue an incomplete default. Overview is deliberately smaller, not an alternative completeness claim. Every Deep has a complete independent probe with its stated conditions. The mask/projection/slicing/concat operations remain distinct rather than being renamed variants of the same picture.

## Prepared delivery, feasibility and exact limits

All proposed Standards are native top-level transformations, heatmaps or relationship graphs. They do not use comparison panels or visual-transform composition, so no new single variant is expected. An actual future composition choice would require a faithful same-data public single and unchanged strict parent/single coverage; it cannot borrow the old grouped-bar single and discard these details.

The completed audit verified36 actual prepared requests for old candidates, normal/fast and planned/unplanned, and found that the selector can replace a raw multihead parent with a single. C12 must therefore establish each **new id's actual outgoing main and mandatory detail**, and both payloads' presence in normal/fast author context, for every exact source prompt, all five paraphrases, all production depths and planned/unplanned paths after GO. A planner's leading shape example is not the target. The new references' native forms must remain intact at that boundary. Nothing here claims a new, unregistered C12 payload has already been prepared or validated.

### Binding resolved inventory and detail clearing

Root's content decision is **18 total resolved views**, with no optional original-case coordinate detail. Production shallow-merges each depth override over the top-level Standard reference. Therefore all four Overview overrides explicitly set detailSpec:null; omission would incorrectly inherit the Standard L2, concat/projection or FFN detail. Coordinate Standard and Deep also explicitly set detailSpec:null. Null is a reference metadata clearing marker, never an outgoing visual.

| Family | Overview resolved figures | Standard resolved figures | Deep resolved figures | Explicit detail treatment |
|---|---:|---:|---:|---|
| Coordinate slices |1|1|1|No detail at any depth; all three detailSpec:null |
| Head comparison |1|2|2|Overview null; Standard supplied L2; Deep selected edited-L1 masked logits |
| Parallel heads/join |1|2|2|Overview null; Standard base output/join/projection; Deep changed-B-value output/join/projection |
| Joined output projection |1|2|2|Overview null; Standard and Deep explicitly carry the same case-correct y→Next FFN role |
| **Total by depth** |**4**|**7**|**7**|**18 overall** |

Deep count/formula checks apply to the primary only. Coordinate main includes the meaningful selected-coordinate edit $Q_B'=Q_B+1$; joined-projection main includes identity lookup $z=(O_A,O_B)$ from displayed B,A rows into fixed model A,B order. A detail, a display permutation alone or the already-present numeric dimension2 cannot substitute for these explanations. No linter rule, field limit or single-parent contract changes.

| Proposed bounded layout | Primitive feasibility | Token /680 /408 feasibility evidence and remaining gate |
|---|---|---|
| Overview one projected-Q1×2 tensor; Standard/Deep3×2→two3×1 | Overview uses the supported top-level tensor kind with title/name/caption and numeric values. Standard/Deep tensors each<=6 cells; one before item/two after items and two native slice links. No unsupported tensor composition child. | Overview's actual linter primary count0 is below Standard's2/4. Standard is compact compared with the existing six-value/three-slice native460 fork. Expect a narrow native layout with taller3-row tensors; actual token count,680 fit and408 readability remain required. No invented408 exact cap. |
| Comparison4×3 probability grids | Four rows/three columns, common[0,1] for weights, native heatmap limit6×6. Overview2×3. Deep weights keep[0,1]; its separately named masked-logit detail uses[−1,1]. | Existing native three-column C07 score/weight grids render408/680. Captions are113/109 shown characters. Labels are short structural ids. Each figure must still independently measure<=300 tokens. |
| Parallel main6×4 numeric computation grid | Exactly maximum6 heatmap rows, four columns,24 actual numerical cells. No tensor-cell8 limit applies to a heatmap. Signed range[−1,1], explicitly typed rows. | **Primary token-pressure boundary**: full operand coefficients plus24 cells. Four-column C08 heatmaps are actually native444 at408 (scale.919) and fit680; row height grows rather than shrinking text. This makes readable feasibility plausible, not certified. Compact caption130 shown characters; actual cl100k_base count must be<=300 before acceptance. |
| Parallel detail four tensor nodes/three graph edges | O_A/O_B2 cells each; J/Y4 cells each; connected, true two-input concat; O_h's eligible weighted-value operation and W_O declared in the caption. | Same four-tensor/three-edge footprint and12 numerical cells as C07 weighted pooling, whose actual Standard is269 tokens and native408/680. Caption89 shown characters. This is a close measured analogue, not a claimed C12 count. |
| Projection main four tensor nodes/three graph edges | Head array2 cells,z2,W_O4,y2; all<=8. Independent W_O edge. | Ten numerical cells versus analogue12, short labels/caption106 shown characters. Strong bounded feasibility; actual tokens and both widths remain required. |
| Projection detail two native blocks | One1×2 y tensor, one Next FFN role; no merge/skip route. | Smaller than existing native three-stage tensor stacks that render408/680. Same selected y is mandatory at each depth; do not show a fake FFN output. |

A read-only content-fragment count for the parallel main, without constructing a diagram specification, measured113 compact cl100k_base tokens for the six labelled numeric row records,92 for the quoted projector/softmax caption, and17 for the four head/position column labels:222 before title, axes, range and schema framing. That leaves78 tokens under300 for the remaining metadata and supports bounded packing with short labels. It is not a complete-spec count/hash receipt; the actual resolved and outgoing JSON still must independently pass300 with every operand, mask/identity label and normalization distinction retained.

The parallel main cannot gain a seventh quantity row, fifth head/query column or a new per-row scale field. Do not replace it with a6×4 tensor (24 cells), dense side-by-side grids or numeric tuple text in a teaching matrix. If the complete native grid plus exact operands exceeds300 tokens or proves unreadable, **that is an unresolved authoring boundary**: retain the point and return for content revision before implementation GO. Do not silently delete the projected V row, Pad row, either query/head, exact projector coefficients or source alias. No new diagram target or arbitrary additional detail is authorized to work around the limit.

The mixed quantity grid is intentional: it names each Q/K/V/weight row and never labels all cells “attention weights” or a model feature tensor. If root does not accept this point-preserving native representation, the precise alternative burden is twelve numeric projected QKV values, eight valid attention values/four zero Pad values, four head-context scalars, four joined values, four projected values and the actual projector/output parameters across only two <=300 figures. That representational decision must be resolved at content review; shape boxes, unshown calculations or another source id are not equivalent substitutes.

Actual frozen coordinate plots allow5 series, not the stale3 limit, but no plot is needed here. Generic panel unions do not admit arbitrary relationship/tensor/transformation children. Native block-stack `merge` operates **after its owning block** and only supports add/multiply. Residual from→to bypasses the from-block **input through the to block** before joining; it is not a general output fork. No C12 head concat uses merge:add, merge:multiply, a residual edge, or a serial head-A→head-B stack. Only the genuinely ensuing y→FFN detail uses stack order.

No new-spec token/hash receipt, schema certification or actual rendered C12 visual is asserted in this content-only document. Draft caption lengths were calculated from complete balanced math spans using the frozen shown-character rule; every supplied draft is<=140. Exact numerical arithmetic and display agreement follow the independently recomputed audit case, including the new B-value-map probe. Implementation must certify every main/detail independently after GO.

## Future integration boundary after root GO

Use the usual subject-local `topic-multihead-attention-data.js`, `composition-multihead-attention-references.js`, numeric composition test and subject token/hash receipt, plus one sources manifest preserving the four full queue family records and four actual NEW associations. These are proposed filenames only; no code or spec has been written. Shared case records must own layer/head/position/role ids and display order, never reconstruct them from incidental array position after permutation. All four ids remain exactly queued.

Keep all old references, old numerical exports/results, old receipts, old accepted prompt picks and strict single-parent coverage immutable. Add only the four new references and narrowly scoped source/paraphrase/keyword registration. The16 C12 source routes intentionally move from absent/unrelated future-source picks to their new point-complete ids; that is not permission to move the documented prior-pick baseline. Root owns future baseline freeze, full replay, actual schema and width receipts, snapshots, visual QA, independent review and publication. C12 implementation waits for preceding verified pushes and root GO.

## Exact source routes and metadata

The table below is copied from the unchanged queue; every source is counted once, all lessons[] and all targets NEW. Source files are under `docs/features/explain-on-canvas/handoff/figure-briefs/<source>/briefs.md#figure-<figure>`, revision `05d5f02f64b474dcf0f830050af4e34907fbdaa8`. Future manifests must retain every Elements distinction listed above, even when four headings share one exact prompt.

| Target / mode | Exact source / brief | Verbatim source prompt | Source lessons / family lessons |
|---|---|---|---|
| `ml-multihead-attention-head-coordinate-slices` NEW | illustrated-gpt2 Figure 46 — `docs/features/explain-on-canvas/handoff/figure-briefs/illustrated-gpt2/briefs.md#figure-46` | Splitting into heads partitions the projected coordinates into independent smaller groups. | [] / [] |
| `ml-multihead-attention-head-weight-comparison` NEW | illustrated-transformer Figure 16 — `docs/features/explain-on-canvas/handoff/figure-briefs/illustrated-transformer/briefs.md#figure-16` | Each head learns its own projections, so heads can score a sequence differently. | [] / [] |
| `ml-multihead-attention-head-weight-comparison` NEW | illustrated-transformer Figure 20 — `docs/features/explain-on-canvas/handoff/figure-briefs/illustrated-transformer/briefs.md#figure-20` | Two heads can weigh different tokens highly even when they process the same query. | [] / [] |
| `ml-multihead-attention-head-weight-comparison` NEW | illustrated-transformer Figure 21 — `docs/features/explain-on-canvas/handoff/figure-briefs/illustrated-transformer/briefs.md#figure-21` | A combined view of many attention heads can obscure which head produced an edge. | [] / [] |
| `ml-multihead-attention-head-weight-comparison` NEW | d2l-transformer Figure 06 — `docs/features/explain-on-canvas/handoff/figure-briefs/d2l-transformer/briefs.md#figure-06` | Encoder heads may distribute attention differently over the same valid source positions. | [] / [] |
| `ml-multihead-attention-head-weight-comparison` NEW | d2l-transformer Figure 07 — `docs/features/explain-on-canvas/handoff/figure-briefs/d2l-transformer/briefs.md#figure-07` | Encoder heads may distribute attention differently over the same valid source positions. | [] / [] |
| `ml-multihead-attention-head-weight-comparison` NEW | d2l-transformer Figure 08 — `docs/features/explain-on-canvas/handoff/figure-briefs/d2l-transformer/briefs.md#figure-08` | Encoder heads may distribute attention differently over the same valid source positions. | [] / [] |
| `ml-multihead-attention-head-weight-comparison` NEW | d2l-transformer Figure 09 — `docs/features/explain-on-canvas/handoff/figure-briefs/d2l-transformer/briefs.md#figure-09` | Encoder heads may distribute attention differently over the same valid source positions. | [] / [] |
| `ml-multihead-attention-head-weight-comparison` NEW | illustrated-gpt2 Figure 47 — `docs/features/explain-on-canvas/handoff/figure-briefs/illustrated-gpt2/briefs.md#figure-47` | Each head can process the same positions using its own coordinate slices. | [] / [] |
| `ml-multihead-attention-parallel-heads-and-join` NEW | illustrated-transformer Figure 17 — `docs/features/explain-on-canvas/handoff/figure-briefs/illustrated-transformer/briefs.md#figure-17` | A full attention head returns a context vector at each query position. | [] / [] |
| `ml-multihead-attention-parallel-heads-and-join` NEW | illustrated-transformer Figure 19 — `docs/features/explain-on-canvas/handoff/figure-briefs/illustrated-transformer/briefs.md#figure-19` | Multi-head attention repeats the score-and-mix computation in parallel, then joins the head outputs. | [] / [] |
| `ml-multihead-attention-parallel-heads-and-join` NEW | d2l-multihead-attention Figure 01 — `docs/features/explain-on-canvas/handoff/figure-briefs/d2l-multihead-attention/briefs.md#figure-01` | Parallel heads compare different projections of the same inputs before their outputs are concatenated and projected. | [] / [] |
| `ml-multihead-attention-joined-head-output-projection` NEW | illustrated-transformer Figure 18 — `docs/features/explain-on-canvas/handoff/figure-briefs/illustrated-transformer/briefs.md#figure-18` | The output projection mixes concatenated head vectors into the width used by the next sublayer. | [] / [] |
| `ml-multihead-attention-joined-head-output-projection` NEW | illustrated-gpt2 Figure 51 — `docs/features/explain-on-canvas/handoff/figure-briefs/illustrated-gpt2/briefs.md#figure-51` | Concatenation places the individual head outputs end to end without averaging them. | [] / [] |
| `ml-multihead-attention-joined-head-output-projection` NEW | illustrated-gpt2 Figure 52 — `docs/features/explain-on-canvas/handoff/figure-briefs/illustrated-gpt2/briefs.md#figure-52` | The attention output projection learns how to combine coordinates from the joined heads. | [] / [] |
| `ml-multihead-attention-joined-head-output-projection` NEW | illustrated-gpt2 Figure 53 — `docs/features/explain-on-canvas/handoff/figure-briefs/illustrated-gpt2/briefs.md#figure-53` | The projected attention result restores the width expected by the residual stream. | [] / [] |

Original dedupeBasis records to preserve verbatim:

- `ml-multihead-attention-head-coordinate-slices`: Coordinate partition into heads; distinct from independent Q/K/V projections and the later concat operation.
- `ml-multihead-attention-head-weight-comparison`: Same positions compared across independently normalized heads; framework outputs and combined/separate head renderings share one comparison.
- `ml-multihead-attention-parallel-heads-and-join`: Repeated views of the same parallel-head workflow: separate per-query head results before ordered concatenation and projection.
- `ml-multihead-attention-joined-head-output-projection`: Successive views of one concat-then-project workflow; concatenation preserves order and is not averaging.

Coverage count: **4 families / 16 unique source headings / 4 NEW associations / 0 REUSE / all lessons[]**. Root's18-view, Overview/detail-clearing and Deep-formula content decisions are incorporated. Content state: root approved; no C12 implementation GO until canonical C11 publication/base/config.


## Final integration interfaces and immutable authority

Prepared read-only while the clean isolated worktree remains work/composition-c11 at f90ef49478f359048e6f1e36740b41e0651cc0f2. The root's final C11 descendant/canonical base will include its integration fixes, including corrected music caption wording, authorized legacy alias SVG/receipt refresh and metadata authority handling. Do not start C12 from this older worker head or replay its stale caption. Wait for root's canonical pushed C11 SHA and GO; then use a new isolated work/composition-c12 branch and content-first commit before any C12 code.

Exact planned subject-local paths after GO:

- packages/web/src/tutor-diagrams/topic-multihead-attention-data.js: parameters and derived, one explicitly independent twoHead namespace; no imports from or appends to old topic-attention-data.js/C02 API/C07 cases or six-token walkthrough data. Raw supplied layer/head/projector records own identities; equal K numbers do not tie parameters.
- packages/web/src/tutor-diagrams/composition-multihead-attention-references.js: references4 and derived; four exact queued ids, all native and all lessons[].
- packages/web/src/tutor-diagrams/topic-multihead-attention-sources.json: families4 exact unchanged full queue records; references4 NEW actual identity mappings with all16 source objects and all20 preapproved paraphrase inputs traceable.
- packages/web/src/tutor-diagrams/topic-multihead-attention-composition.test.mjs; packages/web/src/tutor-diagrams/topic-multihead-attention-token-budgets.json: independent math, outgoing/render data checks and exact NEW per-field token/hash receipt. No old receipt rewrite.
- packages/control-plane/test/explanation-reference-composition-c12.test.js: all exact source/headings/paraphrases and actual parent/main/detail/context/schema routes across all depths/profiles/planning modes.
- Additive registry imports/spread and narrowly scoped NEW learner-keyword entries only. No REUSE overlay, catalog lesson exception, old source/visual/data/API edit or new single expected.

### Primary metadata uses representative fields, never family unions

The original family objects remain byte-for-byte queue records, including their union kinds/gapTypes/lessons and their representative metadata fields. When deriving a primary source object, its source/figure/brief/summary/sequence come from that family representative, but its kinds MUST use representativeKinds, gapTypes MUST use representativeGapTypes and lessons MUST use representativeLessons. All aliases retain their own exact kinds/gapTypes/lessons/sequence objects. Do not apply family unions to a source or replace an alias with representative data. All catalog/source/representative lesson arrays are[] for C12; that coincidence does not remove the extraction requirement.

| Primary heading | Correct source kinds | Correct source gapTypes |
|---|---|---|
| GPT2-46 | transformation,tensor | composition,numeric-transformation |
| Transformer16 | comparison,token-links | composition |
| Transformer17 | matrix,block-stack | composition |
| Transformer18 | transformation,tensor | composition,numeric-transformation |

This matters especially Transformer17: its family union also includes comparison/tensor/transformation and numeric-transformation, but its primary source does not. Whole family unions stay unchanged in families; their content never overwrites the source row. Primary kind ordering must also remain representative ordering, including GPT2-46 and Transformer18.

The immutable precode content is the authority for all20 accepted paraphrases as well as16 source associations; include those input rows in future linter/source checks without a waiver, rather than deriving the authority from the JS being tested. Four D2L source headings06/07/08/09 share exactly one prompt string but have different Elements; keep four separate source rows/headings and their distinct teaching requirements. Counts are16 source-heading associations,13 distinct source prompt strings,20 narrow paraphrases:36 authorized input rows or33 distinct source+paraphrase strings before checking literal duplication. Do not lose the three repeated source associations merely by deduplicating strings in a public prompts array.

## Final native inventory and schema feasibility

Binding resolved inventory: Overview4 /Standard7 /Deep7 =18. These are batch totals, not7figures in one author card; every parent emits1 or2 figures and stays under the existing3-visual author limit. Exact native-kind total across the18views is7heatmaps,5tensor-node relationship graphs,3item-list tensor transformations,2block-stacks and1top-level tensor. No coordinate plot, panel composition, extra target or optional Deep figure is proposed.

| Target | Overview | Standard | Deep |
|---|---|---|---|
| head-coordinate-slices | tensor1×2 Q only; detail null | item-list transformation3×2 R to2separate3×1 QKV slices; detail null | same full transformation/one projected Q_B+1 edit; detail null |
| head-weight-comparison |2×3 L1/P2 normalized grid; detail null |4×3 L1 normalized grid +4×3 supplied L2 grid |4×3 edited-L1 B-query weights +same-case4×3 raw blocked-logit grid |
| parallel-heads-and-join |3-tensor H→independentO_A/O_B graph; detail null |6×4 Q/K/V/typed-weight grid +4tensor O_A/O_B→J→Y graph |same grid withonlyBvalue-map edit +case-matched4tensor output graph |
| joined-head-output-projection |head-array→orderedz item-list transformation; detail null |4tensor head-array→z→y withindependentW_O→y graph +samey→NextFFN2block detail |displayB,A input, explicitidentitylookupmodelA,B; same4tensor graph +explicitsame-casey→NextFFN detail |

All4 Overview overrides explicitly detailSpec:null. Coordinate Standard/Deep also explicitly detailSpec:null; no optional original-case coordinate comparison detail. Every other Standard/Deep detail is an explicit selected-case value, not inherited by accident. The head-comparison Standard supplied-L2 detail is mandatory ordinary source coverage; edited-L1 Deep raw logits are signed[-1,1] withPad null, never an L2/uniform or probability-scale substitute.

Read-only native schema path confirmation: normal author spec includes top-level tensor; fast diagramBundle adds tensor:true when selected/required, tensorHosts for item-list transformation and relationship node tensors, fresh for heatmap, blockStack for the subsequentFFN detail. Existing bundling inspects both main/detail, so paired graphs/tensors/stack remain available; no unrelated default fast bundle is used as proof of a future native tensor route. The native tensor name/title/caption can carry A/B coordinate identity with supported fields; no invented tensor column-label API. Tensor cap8cells remains: largest individual operand6, detailmatrices4;6×4 is a24-cell HEATMAP, not a tensor. Heatmaps remain<=6×6; four-node graphs have3honest edges and true independent operands; stack2nodes has no merge/residual. Item-list transformations remain list-form native, not visual variants, so strict44single-parent count is expected unchanged.

These are schema/shape feasibility reads and prereview proofs, not new prepared C12 requests or measured full specs. After GO validate actual normal/fast/planned/unplanned selected parent ids, system JSON containing both present fields and exact schema for every source/paraphrase/depth. Keep all accepted captions within frozen140shown/280raw and labels/shapes bounded. No unsupported field or budget/tick/schema alteration is authorized.

## Focused data and risk checklist after GO

1. Own every identity by layer/head/position/projection-role. Supply H_L1/H_L2 independently asI2; do not imply a computed layer transition. Both equal-valued L1 K projectors remain named separate parameters. Projector columns are2×1; valid Q/K/V are2×1, paddedK/V3×1, weights2×3, O2×1. No padded query exists.
2. Exclude Pad BEFORE max/normalizer using eligibility, raw blocked logits null and exact zero Pad weights. Extreme KPad±199/VPad100or−99 must not leak into any weight/context. Underlying eligible A_valid is2×2; visible formulas must call the matrix A_h^valid=softmax(Q_hK_h^T), not scalar a. Weight-row normalization and O_h=A_valid V_h remain visible.
3. Parallel main's six rows are Q/K/V operands plus three source-key weight rows. Only the weight cells down each head/query column sum1; never sum operands or call the24cells six model features. Show all12operands/all12weight entries, full named W_A/W_B maps and selected Deep W_B' coefficients. This6×4grid+caption is the real token-pressure boundary: prereview fragments222tokens leave78forremainingframe, not a full accepted receipt. No droppedPad/V/query/head/coefficients or silent extra detail if it exceeds300.
4. Compute raw projections/softmax/products/O/J/Y before display rounding3decimals; preserve display arithmetic agreement with exact W_O. L1 a/b pair rounds.881/.119 without correction. The Bvalue edit must use W_B'=((1,1,1),(1,−1,0)) and outputJ'/Y' matching that same case; no stale Standard extra. Always preserve head order/row identity through selected-case factories.
5. Coordinate probe edits only supplied projected Q_B1→2, not a recomputed full model. Its visible Q_B'=Q_B+1 formula is mandatory. Comparison probe changes only L1Bquerymap; parallel probe changes only Bvaluemap. Joined projection Deep displaysB,A but explicitly constructs modelz=(O_A,O_B) byidentity before fixedW_O; a real reversed model input would not be equivalent. No whole-model head-permutation invariance claim.
6. Genuine unchanged-linter primary counts: coordinate0<4(or2withoutlinklabels), comparison13<23, parallel10<40, joined2<14. Do not add a navigation cue solely for counting or waive warnings. Keep meaningful Deep formulas in main, not only detail/metadata. Independent outputs enter true concat; supplied W_O enters y independently, withno z→W_O orHeadA→HeadB edge. FFN is only an ensuing structural destination, no fabricated numeric result.
7. All18 fields individually<=300, hard680fit andactual408readable. Four-column heatmap native444 is disclosed, not an exact408cap or automatic appshrink. Root early QA must inspect all types, including one top-level tensor Overview/half-open slice fork, layered/masked grids, mixedQKV/weight main, fourtensor graphs andsame-caseFFN detail. If full required packing/readability fails, report exactboundary for content decision; no silent schema/primitive workaround.

No C12 runtime/JS/spec/test/branch/repository write is authorized by this preparation. The canonical C11 root descendant, final baseline and explicitGO are still required. All prior refs/data/exports/results/receipts/picks, including C11 authorized compatibility/caption integration, become immutable at that base. No new legacy exception is presumed. Root owns full replay/suites/snapshots/bulkpreviews/contact sheets/freshreview/publication; worker's future scope remains data/tests/scoped author/linter/token verification and frozen handoff.


## Final wrapping and learner-copy decisions

Independent projector assignments are separate complete balanced math spans, preserving every W_q/W_k identity and full W_A/W_B coefficient array while allowing line wrapping between equations. No coefficient/operator is split out of its complete expression. Shared row orderP1/P2 is stated once in the parallel-output detail caption, so repeated node-label row text may be omitted; all4 numeric tensors, AV operation, orderedJ, suppliedW_O, computedY, width2 and FFN destination remain present. Next-FFN learner captions directly state that the selected width2 projection becomes the next feedforward input; implementation limitations are reported separately. These are presentation clarifications, with no case/number/source/shape/inventory change. Final serialization/token/width receipts, rather than the earlier prereview fragment estimate, govern acceptance.
