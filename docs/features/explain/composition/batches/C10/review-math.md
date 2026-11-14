# C10 independent math, residual and literal-data review

**PASS — no Important or Critical finding.**

Exact reviewed source: `2a07b888eb32ded0b24b68f35d5b54743dfcda1b`.
Canonical base: `c04921998a1fe8ead5bba273d96c9c4ac17cbb71`.

Read the scratch content proposal, implementation report, config and repository C10 content specification, including the accepted Option N scope and content-first Overview correction. Read exact candidate data/reference modules, focused assertions, block-stack layout/specification, math-label renderer and native matrix layout. Before independent imports, C10 module bytes were compared with `git show` of the exact candidate. The relevant renderer/schema/author-selection files have no diff from the canonical base.

Only this scratch report was written. No repository edit, branch change, broad test suite, provider/network request, build, smoke or deployment was performed. The probes below are focused independent in-memory calculations/actual outgoing-render inspections, not a rerun of the author's test suite or the coordinator's broad gates.

## Independent scalar parameter counts

Recomputed each model from separate Q,K,V weight products, the output map, both FFN maps, individual bias widths and normalization scale/offset counts. This does not rely only on the implementation's concatenated-QKV or aggregate polynomial formula.

For state width d, FFN width m, two query heads H=2 and KV groups G, head width is d/H and KV width k=Gd/H. Separate weight terms are d²+dk+dk+d²+dm+md. Separate projection biases are d+k+k+d+m+d. Full MHA has G=H, hence k=d; GQA here has G=1. Two affine LayerNorms contribute4d; two scale-only RMSNorms contribute2d. Dense GELU/softmax/fixed epsilon introduce no learned parameters under the supplied recipes.

| Model | Head width | KV width | Joint QKV shape | Weights/block | Biases/block | Norms/block | Block | Independent core | Full toy total |
|---|---:|---:|---|---:|---:|---:|---:|---:|---:|
| M-A | 1 | 2 | 2×6 | 48 | 18 | 8 | 74 | 148 | 172 |
| M-B | 1 | 2 | 2×6 | 48 | 18 | 8 | 74 | 222 | 246 |
| M-C | 2 | 4 | 4×12 | 192 | 36 | 16 | 244 | 488 | 536 |
| M-D | 2 | 4 | 4×12 | 192 | 36 | 16 | 244 | 732 | 780 |
| E2 | 1 | 2 | 2×6 | 48 | 18 | 8 | 74 | 148 | Not claimed |
| E3 | 1 | 2 | 2×6 | 48 | 18 | 8 | 74 | 222 | Not claimed |
| G-A | 2 | 2 | 4×8 | 112 | 24 | 8 | 144 | 288 | Not claimed |
| G-B | 1 | 1 | 2×4 | 44 | 16 | 4 | 64 | 192 | Not claimed |
| G-C | 3 | 3 | 6×12 | 252 | 36 | 12 | 300 | 600 | Not claimed |

All products, shapes, bias widths, norm entries, layer products and full M totals match the actual derived records. Model-specific layer parameter ids are unique; repeated recipes do not reuse one layer's learned weights.

For M, the additional terms are token table4d, learned positions6d, final affine norm2d, tied output0 and output bias0. M-A's displayed four projection jobs have shapes2×6,2×2,2×8,8×2: weights12+4+16+16=48 and biases6+2+8+2=18. Two affine norms add8, so block74. Displayed parts8+12+148+4=172 are correct. The stacked payload omits unsupported `total`; the actual renderer visibly derives **“Sum of the parts: 172 Params”**.

Independent controls/probes all match:

- M-A→M-B adds one independently learned74-parameter block, with tables and final norm fixed:172→246.
- M-A→M-C holds L=2, changes d2→4 and m8→16 under m=4d, and yields536. It is not a whole-model fourfold scaling claim.
- Untying the bias-free output adds exactly Vd=4×2=8;172→180 with all existing terms fixed. The lookup table remains counted once; no output bias is silently added.
- G-A→G-C holds L2/H2/G1 and m=2d while d4→6,m8→12; head/KV widths2→3 and core288→600. G-A→G-B is the separately labelled different-depth/different-state-width comparison with m8 held fixed, not an equal-capacity or quality claim.
- E2/E3 are post-LayerNorm bidirectional full-MHA encoder-core toys at148/222, not named BERT checkpoints or full-model totals.

Actual outgoing capacity bars at every depth use independently expected values and unit `Params`; the actual accounting tied/untied charts use172/180. Categorical shape/job cells are dimensions and jobs, not fabricated trained weights or activation values.

Focused result: `C10_INDEPENDENT_COUNTS_PASS`, exit0.

## BERT provenance and units

The separate provided paper records retain Base(L12,d768,H12,m3072,110M) and Large(L24,d1024,H16,m4096,340M), with m independently computed as4d. Provenance remains `paper-reported-rounded`, arXiv1810.04805v2 Section3/PDF page3. This review checks the supplied records and their separation, not an independent paper fetch or exact checkpoint recount.

Every actual outgoing detail uses `M params`, labels BERT Base/Large, values110/340 and a caption explicitly saying reported/rounded, not toy sums. The exact M-A/B/C/D counts have a separate axis and scope. Neither the tiny M inventory nor the E encoder-core inventory is used to reconstruct110/340M. No unsupported capability, latency, memory or training-quality implication is added.

## Actual residual semantics and drawn geometry

The native layout records departure before the from-block rectangle, continues the principal path through from and to, then adds the bypass after the to block. For the full pre-norm recipes the displayed computation is therefore

$$u=x+Attention(N_a(x)),\qquad y=u+FFN(N_f(u)),$$

with N=LayerNorm for the GPT-2-shaped full-MHA case and N=RMSNorm for the grouped case. The correct edges are **na→a** and **nf→f**. They do not bypass only the operation while reusing an already normalized residual. In the compressed Overview, ar contains norm+attention and fr contains norm+FFN, so **ar→ar** and **fr→fr** bypass the complete combined branches from their inputs and join afterward.

Independently inspected actual `selectForAuthor` payloads and rendered SVG/React geometry for four GQA stacks (Standard main/detail and Deep main/detail) plus the three GPT expansion details, each at408 and680. All **28 residual wires** leave above their from-block top and join below their to-block bottom. Each rendered stack has exactly two add joins, exactly two residual routes, and no block-level `merge`. There is no duplicate residual addition, false parallel edge or attention→FFN shortcut substitution.

Concrete408 coordinates (local scene y;680 checks independently passed):

| Actual stack / edge | Departure y | From block top | To block bottom | Join y |
|---|---:|---:|---:|---:|
| Every supplied GQA view na→a | 103 | 115 | 238 | 257 |
| Every supplied GQA view nf→f | 293 | 305 | 428 | 447 |
| GPT full Standard/Deep na→a | 103 | 115 | 215 | 234 |
| GPT full Standard/Deep nf→f | 270 | 282 | 405 | 424 |
| GPT compressed Overview ar→ar | 103 | 115 | 171 | 190 |
| GPT compressed Overview fr→fr | 226 | 238 | 321 | 340 |

Every expanded pre-norm stack uses the actual x,na,a,nf,f,y order, names both norms and keeps d→m→d within the FFN. The compressed E Overview does not pretend to draw post-norm residual mechanics. GPT's actual combined main/detail drawn block counts are **6 Overview,9 Standard,9 Deep**, matching the content-first two-block collapsed Overview correction. The detail pointer remains2, referring to the companion expanded visual. Deep's underlying two-norm/two-shortcut metadata is true; its caption explicitly avoids numerical forward-equivalence claims.

Focused result: `C10_RESIDUAL_GEOMETRY_PASS`, exit0.

## Literal serialization, identities and prefixes

Independently checked the actual outgoing task grids at all three depths, with rendered primary KaTeX and native fallback at408/680. Raw serialized cells match the exact strings below, including spaces; candidate processing order changes only Choice B/A rows and preserves each full raw input/readout id.

| Task | Exact serialized input | Readout role/id |
|---|---|---|
| Single | `<s>bright day<r>` | Final rC |
| Pair | `<s>rain<d>wet<r>` | Final rE |
| Similarity AB | `<s>hot<d>warm<r>` | Keep rAB |
| Similarity BA | `<s>warm<d>hot<r>` | Keep rBA |
| Choice A | `<s>sky<d>blue<r>` | Separate rA |
| Choice B | `<s>sky<d>green<r>` | Separate rB |

| Prefix row | Exact decoder prefix | Length | Next-token role/value |
|---|---|---:|---|
| T0 | `<s>birds fly<d>` | 15 | Observed: oiseaux |
| T1 | `<s>birds fly<d>oiseaux` | 22 | Observed: volent |
| G0 | `<s>Crews reopen a trail.<d>` | 27 | Chosen: Trail |
| G1 | `<s>Crews reopen a trail.<d>Trail` | 32 | Chosen: open |
| G2 | `<s>Crews reopen a trail.<d>Trail open` | 37 | Chosen: `</s>` |

The document/source is retained in every applicable prefix; the suffix contains exactly the prior observed T targets or prior chosen G continuations. The chosen stop token is the declared literal `</s>`, including slash. All six wrapper records use symbolic thetaW; all translation/summary records use distinct thetaD. The captions declare toy markers and observed-versus-chosen provenance; there is no historical tokenizer-id, generated-quality, prediction-feedback-training or original-GPT/GPT2 weight-equality claim.

The render inspection covered **104 literal cells and130 primary KaTeX marker spans**. Each marker's actual HTML text characters equal its declared literal marker; no angle bracket/slash is lost or treated as an HTML tag. Native fallback retains every non-whitespace character. The renderer may wrap adjacent markers or split a word across lines in narrow cells (for example the already intact raw `oiseaux` prefix); layout line breaks were not misclassified as serialization edits. Exact raw word spaces were checked separately in the outgoing spec. Overall narrow-layout readability remains the coordinator's visual-QA responsibility.

Focused result: `C10_LITERAL_SERIALIZATION_PASS`, exit0.

## Accepted scope and completion boundary

Confirmed actual allocation labels/dimensions/repeats against every supplied model: Overview E2/E3 d2/m8; Standard G-A L2/d4/m8/H2/G1/k2 and G-B L3/d2/m8/H2/G1/k1; Deep G-A versus G-C L2/d6/m12/H2/G1/k3. Both G Deep cases satisfy m=2d. Actual useWhen says Standard omits the full BERT06/Gallery17 pairs, consistent with accepted Option N; no source-depth resolver or hidden full-Standard claim was inferred.

No additional correctness issue was found in the scoped math, literal data or residual topology. This PASS covers exact source `2a07b888eb32ded0b24b68f35d5b54743dfcda1b` and the independent comparisons above. It does not stand in for the coordinator's final broad suite, prior-pick replay, new token/hash receipts, complete visual acceptance or publication.
