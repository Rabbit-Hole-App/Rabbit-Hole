# C10 content proposal — five NEW families, preparation only

This is a pre-code proposal for the unchanged **5 queue families / 13 source headings: 5 NEW, 0 REUSE**. Subject groups remain **model-capacity (3)** and **gpt2 (2)**. It does not authorize runtime implementation. C10 runtime implementation still waits for C09 verification/push and explicit root GO.

The coordinator accepted **Option N: a bounded native depth split** for allocation, preserving all five targets and the approved family dedupe. BERT06's encoder pair is at Overview, Gallery05/12's different-depth decoder pair at Standard, and Gallery17's same-depth width pair at Deep. **Standard does not contain the encoder pair or the same-depth decoder pair.** This is the owner's expressibility-list requirement, not a claim of full ordinary-source coverage. The other four families retain complete Standard primary/detail routes. No resolver, extra target, false connecting edge or composition exception is introduced.

The BERT05 evidence gap is resolved by coordinator-supplied primary evidence: the [BERT paper, arXiv 1810.04805v2](https://arxiv.org/pdf/1810.04805v2), Section 3, PDF page 3, lines 179–197, reports Base L12/d768/A12 and 110M parameters; Large L24/d1024/A16 and 340M. FFN width is 4d, hence 3072/4096. These are **paper-reported rounded millions**, separate from exact toy arithmetic. This lane did not fetch the paper or independently re-establish its counting convention.

## Authority and fixed read scope

All repository reads in this proposal use `git show a402edc19f46a0e78f84c5655cdc82bcad16327a:<path>`, rather than the moving checkout. Read the complete scratch audit (`c10-content-audit.md`, SHA-256 `3988ec0361dcd506fe59e9189eb28bd8642b490a6ed37cf842a5c4343400b235`), authoritative queue, all 13 exact Elements at source revision `05d5f02f64b474dcf0f830050af4e34907fbdaa8`, and relevant frozen parsers, layouts and author preparation/selection code. AGENTS/CLAUDE/UI match the already read C05 instructions. Queue SHA-256 remains `4beca107ebdb9ff54edbd67657697cc7460ef66ddb276868c415150af5cb66d7`.

The relevant schema, selector, composition, block-stack and plotting contracts are unchanged from frozen authoring revision `1944b48cf24c9d6bd7f53b34ddbe258d1c6113df`. `learn-artifact.js` has unrelated archive/trace additions since that revision; its inspected preparation and visual-count behavior remains the existing path. No author-path modification is proposed.

Future module ownership remains:

| Subject | Reference module | Independent data module |
|---|---|---|
| model-capacity | `composition-model-capacity-references.js` | `topic-model-capacity-data.js` |
| gpt2 | `composition-gpt2-references.js` | `topic-gpt2-data.js` |

## Exact source associations

Prompts below remain verbatim source prompts. The manifest must preserve each source's own lessons instead of applying the family union to aliases. Existing old reference lessons and source/prompt/payload associations remain untouched.

| Family suffix | Source / figure | Exact source prompt | Source lessons |
|---|---|---|---|
| depth-width-allocation | illustrated-bert 06 | Deeper BERT configurations repeat the same encoder block type more times. | `[]` |
| depth-width-allocation | llm-architecture-gallery 05 | A compact decoder can shrink its layer stack while keeping grouped-query attention and a dense token update. | `[]` |
| depth-width-allocation | llm-architecture-gallery 12 | Small decoder capacity can be allocated to more narrow layers instead of fewer wide layers. | `[]` |
| depth-width-allocation | llm-architecture-gallery 17 | Matching depth and attention grouping does not imply matching token-state or feed-forward widths. | `[]` |
| capacity-profiles | illustrated-gpt2 03 | The same model architecture can be trained at substantially different parameter counts. | `['19']` |
| capacity-profiles | illustrated-gpt2 06 | Increasing a model's depth and width increases its parameter count. | `[]` |
| capacity-profiles | illustrated-bert 05 | BERT has base and large configurations that share an encoder design but differ in capacity. | `[]` |
| block-parameter-accounting | illustrated-gpt2 56 | A GPT-2 block uses separate learned matrices for attention and the positionwise feed-forward network. | `[]` |
| block-parameter-accounting | illustrated-gpt2 58 | A model's total parameter count sums the sizes of lookup tables and the independently learned matrices in each layer. | `[]` |
| task-input-format | illustrated-bert 22 | The original GPT wraps different task inputs in token sequences that share one pretrained decoder. | `['08','13']` |
| task-input-format | illustrated-gpt2 59 | A decoder-only model can learn translation by reading source and target in one delimited sequence. | `[]` |
| task-input-format | illustrated-gpt2 61 | A decoder can generate a summary after a prompt containing the document and a delimiter. | `[]` |
| overview-and-expanded-block | illustrated-gpt2 28 | An architecture overview intentionally leaves out lower-level details like residuals and normalization. | `[]` |

Catalog lessons, in queue order, remain `[]`, `['19']`, `[]`, `['08','13']`, `[]`. The first three full ids use `ml-model-capacity-`; the last two use `ml-gpt2-`. No old task-separators lesson01 or learned-position lesson08 is imported.

## Shared binding data conventions

All toy counts are exact learned **scalar parameter** counts; no optimizer states, activation memory, FLOPs, latency, quality or trained-model claim. Each layer has independent matrices, biases and norm parameters. Repetition is a recipe repeat, not reuse of one layer's weights. Shapes use row-vector convention: an input of shape n×d multiplies a d×output-width matrix. Displayed shape strings, dimension labels, counts and probes derive from records; learned matrix entries and numeric activations are deliberately unavailable.

### M: GPT-2-shaped full-MHA counting recipe

Pre-LayerNorm causal **full MHA**, dense GELU FFN, inner width m=4d. Two affine LayerNorms per block, all four projection biases included. GELU/softmax/fixed epsilon add no learned parameters. V=4 token rows, P=6 learned positions; final affine LayerNorm; output matrix tied to the token table; **no separate output bias**. No segment table or task head is counted. These are tiny independent toys, never real GPT-2 checkpoints.

| Projection job | Weight shape | Bias width |
|---|---|---:|
| Joint QKV | d×3d | 3d |
| Attention output | d×d | d |
| FFN expansion | d×m | m |
| FFN restoration | m×d | d |

Weights = 4d²+2dm; projection biases = 5d+m; two affine norms = 4d. Thus block = 4d²+2dm+9d+m = **12d²+13d** when m=4d. Total = Vd+Pd+L·block+2d; tied output adds zero. An untied, bias-free output adds Vd.

Independent arithmetic from the inventory, not the old aggregate formula alone:

| Toy | L | d | m | Weights/block | Biases/block | Norms/block | Block | Token | Position | All blocks | Final norm | Total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| M-A | 2 | 2 | 8 | 48 | 18 | 8 | 74 | 8 | 12 | 148 | 4 | 172 |
| M-B | 3 | 2 | 8 | 48 | 18 | 8 | 74 | 8 | 12 | 222 | 4 | 246 |
| M-C | 2 | 4 | 16 | 192 | 36 | 16 | 244 | 16 | 24 | 488 | 8 | 536 |
| M-D | 3 | 4 | 16 | 192 | 36 | 16 | 244 | 16 | 24 | 732 | 8 | 780 |

M-A's four matrices contain 12/4/16/16 weights and 6/2/8/2 biases respectively. Its two norm scales and offsets contain 8 entries. This establishes 48+18+8=74 per block and 8+12+2·74+4=172 overall.

### E: encoder-stack structural toys

E2 and E3 use **post-LayerNorm bidirectional full MHA**, dense GELU FFN, d2/m8, two query heads and full-width K/V. They have L2 and L3 respectively. Each layer has its own θ: E2 has θE2,1/θE2,2; E3 has θE3,1/θE3,2/θE3,3. The two configurations also do not share learned weights. Their block count happens to be 74 under the declared affine inventory, and encoder-core totals are 148/222; these are not BERT checkpoint counts and must not carry Base/Large names.

### G: grouped-decoder structural toys

A separately named **pre-RMSNorm causal GQA / dense-GELU toy** keeps two query heads H=2 and one KV group G=1. It is neither a GPT-2 recipe nor a real Llama checkpoint. RMSNorm has a learned scale only, no offset; projection biases remain included; FFN is the ordinary two-matrix dense update, not SwiGLU. A grouped K/V width is k=G·(d/H). Hence joint QKV is d×(d+2k), not d×3d; output is d×d; FFN shapes d×m and m×d. Weights = 2d²+2dk+2dm, biases = 3d+2k+m, two RMSNorm scales = 2d. With H2/G1, block = 3d²+2dm+6d+m.

| Setting | L | d | m | Head width | KV width k | Weight/bias/norm entries per block | Block | Core L·block |
|---|---:|---:|---:|---:|---:|---|---:|---:|
| G-A | 2 | 4 | 8 | 2 | 2 | 112 / 24 / 8 | 144 | 288 |
| G-B | 3 | 2 | 8 | 1 | 1 | 44 / 16 / 4 | 64 | 192 |
| G-C | 2 | 6 | 12 | 3 | 3 | 252 / 36 / 12 | 300 | 600 |

G-A/B compare fewer wider layers versus more narrower layers with the same attention/update operators and m8 held fixed. **G-A→G-C is the Deep width-setting probe:** L2/H2/G1 and the normalization path stay fixed; d4→6 and m8→12 change together under m=2d. Head and grouped-KV widths both change2→3. No extra m-only fixture or crowded callout is required. The core counts288→600 are arithmetic guardrails, not a proposed mixed-scope capacity chart or a claim of equal capacity/performance.

All computed counts remain integers without rounding. Paper values remain 110/340 with unit **M params** and a visible rounded/reported caption. No decimal precision or exact checkpoint total is fabricated.

### Residual endpoint semantics for every future block-stack

A residual edge bypasses the **input of its from block through its to block, then merges**. Departure is before the from block. For pre-norm order x,na,a,nf,f,y, use **na→a** and **nf→f**. For post-norm order x,a,na,f,nf,y, use **a→a** and **f→f**; native same-block bypasses are allowed. The residual edge itself adds the join. Do **not** also set a block-level `merge`, which would draw a second join. These semantics are confirmed by `describeBlockStack` and the layout's departure/arrival code.

## 1. ml-model-capacity-depth-width-allocation

**Accepted Option N: bounded native depth split.** BERT06 needs two visible encoder stacks with different repeats and independent layer parameters. Gallery05/12 need two GQA/dense-update stacks with depth/state width distinct. Gallery17 needs two same-depth GQA stacks with state/FFN dimensions and identical grouping/normalization paths. The family retains all four source associations; the accepted design carries them at the explicit depths below rather than claiming every source's full point at Standard.

| Source scope | Depth | Native primary / detail | Exact retained point |
|---|---|---|---|
| BERT06 | Overview | E2 / E3 | Two post-norm bidirectional encoder stacks, L2 versus L3, same recipe, distinct learned parameter sets per layer |
| Gallery05 and Gallery12 | Standard | G-A / G-B | Same pre-RMSNorm GQA/dense-GELU path; fewer wider versus more narrower layers; L and d labelled separately, m8 fixed |
| Gallery17 | Deep | G-A / G-C | Same L2/H2/G1 and normalization paths; d4/m8 versus d6/m12, with m=2d |

**Expressibility list:** the Standard payload has neither the E2/E3 encoder pair nor the G-A/G-C same-depth pair. BERT06's pair is at Overview and Gallery17's pair at Deep. These are deliberate reported depth scopes under the owner's bounded-expression decision, **not full ordinary-source coverage**. Source prompts, ids, per-source lessons and catalog union stay unchanged. The table serves as pure depth-scope metadata outside the unchanged exact source/alias objects; it must not select a different depth, rewrite the prompt, add targets or change resolver behavior.

**Overview has fewer actual elements:** each E view is a native three-block stack: input → repeated post-LN encoder recipe → output. The middle block names the bidirectional MHA/dense-GELU recipe, carries repeat2 or repeat3 and d2/m8, and has no expanded child flow. The caption explicitly names independent layer parameter identities. This gives six top-level blocks across the pair, compared with twelve in the Standard pair; shortening words alone would not suffice. The compressed drawing does not claim to expose residual mechanics.

**Standard and Deep stack mechanism:** each G view is a full-width native six-block stack x,na,a,nf,f,y: input, attention RMSNorm, causal GQA, FFN RMSNorm, dense GELU FFN, output. Both actual residual bypasses are na→a and nf→f; residual edges add their joins, with no duplicate block `merge`. The repeat range covers the recipe and each repeat has its own learned parameters. Dimensions and repeat/parameter identities derive from the declared G records. This is not a GPT-2 or real Llama checkpoint recipe.

**Deep probe:** G-A→G-C changes the width setting at fixed L2/H2/G1 and m=2d: state4→6, FFN8→12, head width2→3 and grouped-KV width2→3. The same operator/normalization path remains visible. No extra m-only callout is added, and no numeric activation or equal-performance claim follows from matching recipe paths.

The unselected alternatives remain bounded facts: a native primary plus a two-child comparison detail could hold three G stacks but still omit the encoder pair; a comparison primary plus a same-point single would lose the full companion on ordinary substitution. Neither is silently used. Saved three-child comparisons, an invented third reference field, false model-to-model forward edges, and a numeric/string table standing in for drawn stacks are not remedies. Accepted Option N avoids new Standard composition parents or singles and adds exactly six authored/resolved visuals across its three depths.

**useWhen:** Compare independent layer repeats, residual-state width and temporary FFN width within named unchanged encoder or grouped-decoder recipes; exclude recurrence weight reuse, model quality, and a claim that encoder/GQA/GPT-2 recipes are identical.

**Keywords:** `matched recipe depth widths`; `independent layer stack allocation`.

**Five paraphrases:**

1. Compare matched recipe depth widths without sharing layers' learned weights.
2. Show independent layer stack allocation for two encoder depths.
3. How do matched recipe depth widths differ for narrow and wide grouped decoders?
4. Hold grouped heads fixed while changing matched recipe depth widths.
5. Separate temporary FFN width from token-state width in independent layer stack allocation.

## 2. ml-model-capacity-capacity-profiles

**Default primary:** native parameter-magnitude bars for M-A/B/C/D. Labels derive as `A L2 d2`, `B L3 d2`, `C L2 d4`, `D L3 d4`; unit `Params`; bar values 172/246/536/780. The caption names computed toy scope, V4/P6, m4d, biased full-MHA projections, two affine norms/block, final norm and tied output. The common chart scale and aligned `(L,d)` labels jointly satisfy GPT-2 03 and 06. A numeric string table alone is insufficient.

**Default detail:** separate native paper-reported BERT bar chart, labels `BERT Base L12 d768` and `BERT Large L24 d1024`, values110/340, unit `M params`. Caption: `Reported BERT totals: rounded millions, not toy sums. Shared encoder design; size alone does not measure task performance.` The underlying records also retain heads12/16 and m3072/4096 from the paper; do not squeeze all metadata into a long bar label. This supplies the named BERT05 configurations and size measure without mixing full toy counts with reported millions on one axis. There is no “Base-style toy = BERT Base” claim.

**Depths:** Overview has exactly the two M-A/B toy bars plus the two-bar BERT detail; Standard has four toy bars plus the same BERT detail, so Overview has fewer actual bars (four versus six across its two views). Deep retains all four toy bars and a visible control caption: M-A→B adds one independent74-parameter layer with tables/final norm unchanged; M-A→C changes172→536 at fixed L2, rather than assuming a whole-model fourfold change. The BERT detail remains explicit at all depths. All numeric labels derive from the provenance-specific records.

**Implicit probe:** change only L2→3 at d2 to recover delta74; separately double d2→4 with m=4d and L2 to recover536. Never infer throughput or quality from either result. The paper-reported chart is not recomputed using the M inventory.

**useWhen:** Compare parameter magnitudes with explicit layer/width and counting provenance; exclude measured capability, speed, memory usage, and treating rounded paper totals as exact toy sums.

**Keywords:** `same recipe parameter magnitudes`; `depth width count profiles`.

**Five paraphrases:**

1. Show same recipe parameter magnitudes with the counted scope named.
2. Compare depth width count profiles for the declared four toy decoders.
3. How does one extra layer change same recipe parameter magnitudes?
4. Contrast reported BERT size bars with computed depth width count profiles.
5. Which same recipe parameter magnitudes are rounded paper totals?

## 3. ml-model-capacity-block-parameter-accounting

**Standard primary:** native categorical 4-row×2-column shape/job matrix. Row identities: Joint QKV, Attention output, FFN expand, FFN restore. Columns `Weight shape` and `Job`; shapes derive as 2×6,2×2,2×8,8×2, and jobs are Q/K/V, mix heads, d→m expansion, m→d restoration. These are operator shapes, not filled trained tensors. The 2×6 QKV matrix would require12 cells, so it is not rendered as a full numeric tensor.

**Standard detail:** native single stacked parameter bar with four positive parts: token8, position12, independent blocks148, final LN4. Author fields use `bars` and `variant: stacked` **without a `total` property**. The existing renderer sums the parts and visibly labels172 automatically. Caption includes L2, block74, tied output0 and no output bias. The repeated block term and separate table terms are visible in this ordinary payload, satisfying GPT-2 58; the main four projector jobs satisfy56. Count results use magnitude bars, with shape strings used only as dimensions.

**Depths:** Overview has three actual shape rows: Joint QKV, Attention output, and a combined FFN expand/restore row with both shapes2×8 and8×2 and both jobs explicitly named. Standard separates the FFN projections into four rows. Overview retains the same four-part stacked detail, omitting the unsupported `total` field. Deep keeps the four-job matrix; its detail compares tied172 and untied180 with two native bars and a caption recording the same token/position/block/final-norm terms. The only changed term is an additional V×d=4×2 output matrix8; no output bias appears. Block bias/norm inventory remains48+18+8=74. A separate independent L2→3 calculation246 is bound in data for verification, not falsely added to an overcrowded third visual.

**Implicit probe:** toggling output tying adds exactly8 while every block, lookup table and final norm stays unchanged. Counts derive independently from matrix shapes plus bias/norm entries; no reuse of the old aggregate waterfall is asserted.

**useWhen:** Account for distinct projector jobs and sum explicitly scoped lookup/block/norm parameters; exclude numeric trained weights, GQA counted as full MHA, missing bias/norm terms, and double counting a tied head.

**Keywords:** `projection shape accounting`; `lookup block sum`.

**Five paraphrases:**

1. Show projection shape accounting for QKV, attention output, expansion and restoration.
2. Build the lookup block sum from the declared toy matrix dimensions.
3. Why must projection shape accounting include biases and both normalization stages?
4. What changes in the lookup block sum when the output table is untied?
5. Check the lookup block sum after adding an independent layer.

## 4. ml-gpt2-task-input-format

This is structural serialization, not a computed model prediction. Marker spellings are declared toy roles, not claimed historical tokenizer ids: `<s>` start, `<d>` field/source-target boundary, `<r>` selected task readout, `</s>` stop. All original-GPT wrapper calls use one symbolic decoder identity θW. Translation/summary prefix calls use a separately named θD; no equality of original-GPT and GPT-2 learned weights is asserted. Capacity-toy V4 is unrelated to these symbolic text examples.

**Standard primary: native 6-row×2-column matrix.** Columns `Serialized input`, `Readout role`; task row identities are stable. Every string below derives by inserting the declared markers between the raw field arrays.

| Row | Serialized input | Readout role |
|---|---|---|
| Single | `<s>bright day<r>` | Final rC |
| Pair | `<s>rain<d>wet<r>` | Final rE |
| Similarity AB | `<s>hot<d>warm<r>` | Keep rAB |
| Similarity BA | `<s>warm<d>hot<r>` | Keep rBA |
| Choice A | `<s>sky<d>blue<r>` | Separate rA |
| Choice B | `<s>sky<d>green<r>` | Separate rB |

Caption must say one θW is reused; similarity combines rAB and rBA; candidate readouts remain separate. It need not invent readout values or a scoring rule. Both similarity serializations and both candidate sequences are drawn, rather than paraphrased as “both orders”/“all options”. This covers all BERT22 Elements in the ordinary Standard main.

**Standard detail: native 5-row×2-column matrix.** Columns `Decoder prefix`, `Next token`; row headings and token text visibly distinguish **observed training labels** from **illustrative chosen generation tokens**. Raw translation source=`birds fly`, observed target tokens=`oiseaux`,`volent`. Raw synthetic document=`Crews reopen a trail.`; original illustrative summary choices=`Trail`,`open`,`</s>`. No field abbreviation is needed: the entire source/document stays visible in every row.

| Stable row / role | Full decoder prefix | Next token / provenance |
|---|---|---|
| T0 observed | `<s>birds fly<d>` | Observed: oiseaux |
| T1 observed | `<s>birds fly<d>oiseaux` | Observed: volent |
| G0 chosen | `<s>Crews reopen a trail.<d>` | Chosen: Trail |
| G1 chosen | `<s>Crews reopen a trail.<d>Trail` | Chosen: open |
| G2 chosen | `<s>Crews reopen a trail.<d>Trail open` | Chosen: `</s>` |

The five prefix strings have lengths15/22/27/32/37, within the40-character teaching-cell cap before any actual renderer measurement. The T rows demonstrate immediate next-token training labels with the source retained, satisfying59. G rows demonstrate incremental summary generation after a document boundary, satisfying61. The chosen words are declared examples, not observed training labels, model outputs, probability maxima, or a quality measurement.

**Depths:** Overview main contains only Single/Pair (two actual rows), and its detail contains only T0 observed/G0 chosen (one observed and one illustrative chosen prefix). This is an intentional introductory subset: it does not claim the omitted similarity/candidate cases or incremental summary steps are drawn there. Standard retains the complete six-row/five-row pair above. Deep retains those full cases, reordering Choice B/A processing rows while preserving stable candidate ids, inputs and readout associations; it does not reorder tokens inside an input. Deep keeps all T/G role labels and the full document prefix. A timeline replacement is not the default plan.

**Implicit probes:** candidate-row reordering leaves each candidate's serialization/readout identity unchanged; appending a chosen summary token changes only the continuation suffix while document/boundary stay identical. Translation labels remain observed target tokens, regardless of any illustrative G choice. No false state→observed-input, prediction→teacher-input or all-candidates-in-one-call edge is added.

**useWhen:** Serialize task fields and show observed translation targets versus chosen summary continuations; exclude raw unformatted supervision, claimed historical token ids, numeric scoring, and prediction-feedback training.

**Keywords:** `serialized task wrapper fields`; `observed versus chosen prefixes`.

**Five paraphrases:**

1. Show serialized task wrapper fields for single texts and sentence pairs.
2. Compare observed versus chosen prefixes for translation labels and summary choices.
3. Serialize both similarity orders and combine their independent readouts.
4. Keep each candidate separate in the serialized task wrapper fields.
5. Append an illustrative summary token while preserving observed versus chosen prefixes.

## 5. ml-gpt2-overview-and-expanded-block

Bind one structural record to GPT-2-style **pre-LayerNorm causal full MHA**, dense GELU FFN, residual d2 and inner m8. It is recipe M's topology, not the post-norm encoder E or grouped/RMSNorm recipe G. No learned numeric activation is required.

**Default primary:** native three-block overview: Input → Collapsed GPT-2 toy block → Output, with a valid detail pointer. Caption explicitly says the drawing omits normalization stages and residual shortcuts, rather than claiming the model lacks them.

**Standard/Deep detail:** native vertical six-block expansion, with ids and actual operations:

1. x: residual input, width d2.
2. na: Attention LayerNorm.
3. a: Causal full MHA, output width d2.
4. nf: FFN LayerNorm.
5. f: Dense GELU FFN, d2→m8→d2.
6. y: output, width d2.

Residual edges are **na→a** and **nf→f**: each leaves before its normalization block, bypasses the normalized attention/FFN branch, and then adds its input. The residual edges create the two joins; no block-level `merge` is set. Callouts name `Residual 1: add input` and `Residual 2: add post-attention`; the two normalization blocks are already explicitly named. These stay within six blocks/four callouts/four residuals. The pair is available in the ordinary Standard primary/detail payload, so GPT-2 28 is not a Deep-only architecture stand-in.

**Overview detail has four actual blocks:** x input; ar `Attention LayerNorm + causal full MHA`; fr `FFN LayerNorm + dense GELU FFN`; y output. Each combined branch is one visible block with a text label, not an additional nested flow. Same-block residuals **ar→ar** and **fr→fr** bypass the input of each combined branch and then merge, naming both shortcuts; both norms remain named. No block `merge` is also set. Together with the unchanged three-block primary this gives seven top-level blocks, versus nine at Standard/Deep. Standard/Deep expose the explicit six-block detail above; Deep adds the visible abstraction invariant caption. Every depth specifies both fields deliberately, avoiding accidental Standard-detail inheritance. There are two authored/resolved views per depth for this family.

**Implicit probe:** toggling display abstraction changes shown internal operations, while the underlying record still contains two LayerNorm stages and two residual shortcuts. Counts derive from the named norm/residual arrays. Shape-compatible residual d2 is preserved; no numeric forward-pass equality is inferred merely from matching shapes.

**useWhen:** Expand an intentionally simplified pre-LayerNorm decoder overview to expose both real shortcuts and normalization stages; exclude context-window comparisons, post-norm Transformer blocks, GQA/RMSNorm recipes, and numeric activation equivalence claims.

**Keywords:** `collapsed decoder detail`; `omitted normalization shortcuts`.

**Five paraphrases:**

1. Open collapsed decoder detail without changing the underlying block recipe.
2. Show omitted normalization shortcuts in a pre-LayerNorm GPT-2-style cell.
3. Where are the two residual joins hidden by collapsed decoder detail?
4. Keep causal full attention distinct from omitted normalization shortcuts.
5. Why does opening collapsed decoder detail leave the model definition unchanged?

## Primitive, budget and later acceptance boundaries

All five designs now use native primaries/details under accepted Option N, adding no eligible Standard composition parent or single. Both fields are explicitly specified at every depth; no inherited detail is counted as absent. The planned total is **30 authored/resolved visuals** (5 families×3 depths×2 fields). This count does not imply full ordinary-source allocation coverage: its accepted depth scopes remain the expressibility list above. Overview reduces actual blocks, bars or matrix rows in every family rather than merely shortening labels.

These are **unmeasured designs**, not authored diagram JSON or token/geometry receipts. Each future primary/detail/single independently must be <=300 compact cl100k_base tokens, render within680, and be visually readable on an actual408 card. Captions are bounded140 shown characters; matrix cells40; matrix headers24. The task grids deliberately use two columns and at most six rows, rather than the old wide matrices. An over-budget view must be simplified without dropping required source Elements within its accepted source/depth scope, or returned as an expressibility gap; it must not be labelled passed from a prose estimate.

Tensor maximum is four rows/eight visible cells; heatmap maximum is6×6. No numeric tensor or heatmap is needed here. Coordinate plots, if later chosen, permit at most **five series**, never six; the proposal uses zero plots and so adds no Standard plot-panel issue. Two-child comparison panels are the author limit; nested compositions, a three-child exception, arbitrary graph insets and ordered-panel workaround are not proposed. Comparison layouts may stack their children vertically to keep native text, unlike scaled ordered panels, but that behavior still needs actual408/680 checks for each new visual.

New totals use magnitude bars with common units and scope. Dimensions and named projector shapes are categorical structure, not numeric result boxes. No learned weights are fabricated. Task serializations use observed strings/chosen strings with explicit provenance rather than invented numeric transforms. Existing registry ids, data, lessons, prompts, singles, byte payloads, prior picks and historical receipts remain unchanged.

After content review and explicit C10 GO on a fixed integrated base: independently reconstruct shape products, biases/norms/tied terms, all displayed integers and task strings; preserve the BERT reported/computed provenance split; validate every source/alias/depth through normal/fast/planned prepared author payloads and actual schemas; measure compact tokens/hash/native widths for every present field; inspect actual408/680 previews/sheets; replay old source/old prompt picks and immutable payloads; run the coordinator's required affected gates. None of those implementation/acceptance checks was run by this content-only lane.

The allocation depth split is the accepted owner/coordinator content decision. Its Standard omissions remain explicitly reported, with all family metadata/dedupe preserved. C10 JavaScript still waits for C09 verification/push and root GO.

## Read-scope hashes and concurrency receipt

Final observed checkout HEAD after this content correction: `4326d3a67fda8895cdf65395a6c0cf93d03c11ea`. Of these 22 pinned instruction/source/contract/support files, changed since the read pin: **0**. The proposal continues to use the fixed read pin. Only this scratch proposal was changed; no repo edit, JS/spec implementation, unit/broad test, provider/network call, build, push, deployment or agent launch occurred. Independent arithmetic/string lengths were calculated in Python; residual semantics and renderer-computed stacked sums were checked from the pinned source.

| Pinned file | SHA-256 |
|---|---|
| `AGENTS.md` | `fd3ad431fed9e8f58b479919a0af8c169c3b94b7c932ec42d255f9d975faa873` |
| `CLAUDE.md` | `89dbd941e45e2eb9d128821800d6e7cb92cdce17e79dda851b09bd89470fb7da` |
| `UI.md` | `967a3bb8c7b67723b8b4ddd1b8d02aff525a5c7c97f9e8729204ac23f1dda235` |
| `docs/features/explain/composition/queue.json` | `4beca107ebdb9ff54edbd67657697cc7460ef66ddb276868c415150af5cb66d7` |
| `docs/features/explain-on-canvas/handoff/figure-briefs/illustrated-bert/briefs.md` | `686f73cb7e70bf19ca72012f710044cfac30987a41e4b4a0ab4e951919c85adc` |
| `docs/features/explain-on-canvas/handoff/figure-briefs/illustrated-gpt2/briefs.md` | `d273bccfd5abda1843fb90eb9eb6b3ea89accf0e1a687bdbbf10dd04d02e0d6a` |
| `docs/features/explain-on-canvas/handoff/figure-briefs/llm-architecture-gallery/briefs.md` | `fa88cb5dca00ae9fdbc306713d77377b9198df9fb28da316482104c0584ffe4d` |
| `packages/control-plane/src/explanation-references.js` | `df811029efd93e6d29dd8cd74fb4ea23c0653f6a733c89ad2ecd0cae5e0210a5` |
| `packages/control-plane/src/learn-artifact.js` | `705dc13a76dcc86e01dbc7cc84589b12cc32061c44a96dcc17178f917292c0d5` |
| `packages/control-plane/src/learn-primitives.js` | `80a240c770052f8b0df40d53a9c37f8503505abb0efa3976320184f3c372d9cf` |
| `packages/web/src/tutor-diagrams/spec.js` | `fd81e620c2c7a8795b1c79f12c9fbdb500a7158c49736b161291ad368ba93e33` |
| `packages/web/src/tutor-diagrams/ml-composition-spec.js` | `4126d987f96df55ec3d028fbe8fcf1163d5526bf3e3e3a9965a7f6cdaeb03454` |
| `packages/web/src/tutor-diagrams/ml-composition-layouts.js` | `153ec149300c771080833ecc53d435531df735c6de627cbe3c9ec691e400440c` |
| `packages/web/src/tutor-diagrams/block-stack-spec.js` | `1ffeb4769a045a58c7aec7274405a268b47614c594cba9b2388882213ea2848e` |
| `packages/web/src/tutor-diagrams/block-stack-layout.js` | `f7662b061356bbabc6d084e07be220821584c2971d65bda964ba44d39b6d8177` |
| `packages/web/src/tutor-diagrams/ml-plot-spec.js` | `10dab13eca19563ab4bb9ba4680b49c6f552c43f7d827578a5571199a67bc70a` |
| `packages/web/src/tutor-diagrams/ml-plot-layouts.js` | `bb8659fad43ba8d75215e149fc093dfd080171fe9d685eafe533db8f2a731086` |
| `packages/web/src/tutor-diagrams/ml-data-spec.js` | `942324f605f367ab535ff79ccf80f3838584c32c4c1268503a754fa54d3f0174` |
| `packages/web/src/tutor-diagrams/ml-statistical-spec.js` | `c1207071a5ec412ed37c20c81ea8e1c467f844a6ead6c5b8ca28c9b544b95be4` |
| `packages/web/src/tutor-diagrams/tensor-spec.js` | `fb828722fcc696c538a62e7fd0ded8db719f9af7fd02a93eb0e68979c8fb89fc` |
| `packages/web/src/tutor-diagrams/TutorDiagram.js` | `55b79889b31067257953f718dc468115e5014679be94190cb60b51da62e2b96c` |
| `packages/web/src/tutor-diagrams/figure-capacity-data.js` | `f74cfdb4ae626701f540c82fbd238e709c0af0c7268abceb2d80b194c68f1e2d` |

## C10 collapsed Overview simplification — content-first correction

The collapsed-block Overview primary uses two genuine blocks: Input → Collapsed GPT-2 toy block output. The second block explicitly names its output and residual width d2, retaining its detail pointer. It omits the redundant separate output tile. Standard/Deep retain the three-block input → collapsed block → output primary and full six-block expansion. Overview's four-block expansion still names both normalization stages and both same-block bypasses. Thus actual combined drawn block counts are six at Overview versus nine at Standard/Deep. All source points, parameters, output interface and allocation Option N scopes are unchanged; no primary-only rule9 exception is used.
