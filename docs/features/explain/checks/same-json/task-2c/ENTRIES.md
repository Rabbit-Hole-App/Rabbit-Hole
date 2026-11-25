# M3c: proposed entries for tensor, token-links and block-stack (wording first, no code)

Written by the lead on 2026-11-25 for the reviewer and the owner. **Everything under "Proposed entry" is a PROPOSAL of new model-facing text. The spec says its wording is not approved ("The owner decided they get a proper entry like the others. This is the one place task 2 adds text. The wording of the three entries is not approved yet", SPEC.md 166-168). Nothing is built until the owner approves the text.** Facts come from a read-only lane over main b29b6bdd7 (`C:/s/explain-8878`) and M2's tip 547ac84d8 (`C:/s/sj-text`); the lead re-checked the three schema files (`tensor-spec.js`, `token-links-spec.js`, the token-links derived rule in `derived.js:168-180`), the verbatim sentences and the absence of "tensor" from all eight M2 files. No code was changed, nothing was run against a model.

## What Gemini actually sees of these kinds

- The author's answer schema is built by `bundledAuthorSchema` with `only:[kind]` (`explanation-references.js:276-296`) and then `geminiRequestSchema` (`explanation-fast-chain.js:109-113`, `:153`). Gemini sees **no `minItems`, `maxItems`, `minimum` or `maximum`** (`BOUNDS`, `explanation-fast-chain.js:62-64`), and each text field's JSON-schema `maxLength` is **twice** the real shown limit (`spec.js:35-39`).
- So the counts and limits of a kind reach Gemini only through the part 4 text. A limit left out of an entry is invisible to the model, and a wrong number in an entry would cause refusals (`explanation_bad_diagram`, one repair, then drop, simplify or fail: `learn-primitives.js:437-454`, `learn-artifact.js:322-335`).
- Shared lines of part 4 that already apply to all three: the opening line (a diagram spec is one TutorDiagram object, never Mermaid, HTML or SVG), "title at most 90 characters, optional caption 140" (all three use `titled`, `spec.js:43`), "IDs start with a letter" (block-stack only: the only one of the three with ids, `spec.js:42`), and the last closing sentence ("Follow the tool schema ... no invented kind, SVG, CSS, colour or position fields": all three are strict objects). The "flow node label 60 and edge label 30" part of the label line is flow-only. The token rule (visuals part, `learn-primitives.js:403`: "A number the figure computes from others ... is written as {{d:N.path}}") covers token-links weights; the `{{d:...}}` resolver reads any numeric path (`explanation-tokens.js:22-40`).

## How today's entries read (quoted, M2's `explanation-diagram-kinds.md` line 3; on main `learn-primitives.js:397`)

Each entry is one run-on clause, entries joined by ", " (the spec's per-kind character counts include that separator, so they are 2 higher than these): shape `<kind> for <what it shows> (<field> [{subfields}] <count range>, optional fields end in ?, enums quoted with |)`, then `;` and cross-field rules; terse, imperative or fragmentary; counts as `2-8` or `1-5 texts`; per-kind label limits almost never stated; left out: numeric ranges of plus or minus 1e9, id patterns, optional layout fields, anything the schema's enums already show.

- **comparison (154):** `comparison for items across attributes (columns [{heading,items:[1-5 texts]}], 2-4 columns); row i in every column is the same attribute in the same order`
- **bar-chart (262):** `bar-chart for comparing quantities (unit?, bars [{label,value}] 2-8, values may be negative; to compare 2-3 series across the same categories use variant "grouped" with categories [2-8 texts] and series [{label,values}] (one value per category) in place of bars)`
- **number-line (227):** `number-line for values and intervals (min, max, markers [{value,label}] distinct and inside the range, optional intervals [{from,to,startClosed,endClosed,label}] increasing and inside the range; at least one marker or interval)`
- **layers (45):** `layers for a stack (layers [{label,detail?}])`
- **relationship (372):** `relationship for labeled links between things, reciprocal or cyclic allowed (nodes [{id,label}], edges [{from,to,label}]: different ends, every node linked, no repeated labeled pair); each thing is one node; every edge label is the relation as a verb phrase (raises, feeds back into, is measured by), never a bare noun or a placeholder such as input, output, compare, link`
- flow (803) is the longest.

---

## 1. tensor

**Today's text about it: 0 characters.** Not in the kinds list (M2 line 3; main `learn-primitives.js:397`), not in the closing block (`explanation-references.js:308`; M2 line 7), and the word "tensor" occurs in none of the eight M2 files (the lead's grep: 0 in each). The rest of the code mentions it only as non-author text (the planner's description `explanation-planner.js:37`, regexes reading the learner's words `explanation-visuals.js:13,29`, bundle flags). At run time the word reaches the author in three ways: the "This card's visuals: 1) a tensor diagram" line when planned, the answer schema (`kind` const `tensor` and the `tensor` object), and the example JSON line.

**Fields its schema allows** (`tensor-spec.js`; the kind is `titled` + `kind: "tensor"` + `tensor`):

| field | type and limit | required | validator |
|---|---|---|---|
| `title` | text, at most 90 (schema says 180) | yes | `spec.js:43` |
| `caption` | text, at most 140 (280) | no | `spec.js:43` |
| `tensor.rows` | int 1-4 | yes | `tensor-spec.js:3` |
| `tensor.columns` | int 1-8 | yes | `tensor-spec.js:4` |
| `tensor.dimensions` | text, at most 12 (schema 24) | yes | `tensor-spec.js:5` |
| `tensor.name` | text, at most 60 (120) | no | `tensor-spec.js:6` |
| `tensor.values` | 1-8 numbers, each within plus or minus 1e9 | no | `tensor-spec.js:7` |
| `tensor.role` | `input`, `weight` or `output` | no | `tensor-spec.js:8` |

Cross-field rules, invisible to Gemini's schema: rows x columns at most 8 ("Show at most eight visible cells", `tensor-spec.js:14`); `values`, when given, hold exactly rows x columns numbers (`:15`). The server fills or derives nothing for tensor (no row in `DERIVED_ROWS`, `derived.js:299-308`). Renderer: `values` are placed row by row (`tensor-layout.js:56-58`), `dimensions` is only drawn as text under the cells (`:64-66`), the role colours are blue, mustard and teal (`:13-17`).

**Proposed entry (417 characters):**

> tensor for the shape and values of one vector or matrix (tensor {rows 1-4, columns 1-8, dimensions, name?, values?, role?}); rows and columns count the cells drawn, at most 8 in all; dimensions is the shape of the whole tensor as short text such as 1 × 512, at most 12 characters; values, when given, are one number per drawn cell, read across each row; name at most 60 characters; role "input", "weight" or "output".

| clause | support |
|---|---|
| rows 1-4, columns 1-8 | validator `tensor-spec.js:3-4` (Gemini cannot see these bounds) |
| "at most 8 in all" | validator `tensor-spec.js:14` |
| dimensions at most 12 | validator `tensor-spec.js:5` (the schema Gemini sees says 24) |
| "shape of the whole tensor ... 1 × 512" | reference convention only, not enforced (question G below) |
| values one per drawn cell | validator `tensor-spec.js:15` |
| "read across each row" | renderer `tensor-layout.js:56-58`, not the server |
| name at most 60 | validator `tensor-spec.js:6` |
| role values | validator `tensor-spec.js:8` (Gemini already sees this enum) |

No server-behaviour claim and no pointer to another kind (so rule 5 has nothing to mark). A shorter variant (294 characters) drops `name`, `role` and the "read across each row" clause. **Retained sentence: none** (today's text has nothing to keep).

**Consistent with:** top-level tensor references `pool-stereo-audio-frame` (2x4 stereo voltages), `pool-granola-batch-ingredients` (3x2 grams), `pool-booklet-press-pages` (4x1 pages) and kind-gallery entry 21 (1x3 readings); as a child in other hosts `ml-transformer-token-embeddings` (a block-stack child, 1x4 cells over "512"), `ml-transformer-qkv-projections` (transformation items, 1x4 over "1 × 512"), `ml-transformer-weighted-values`, `ml-transformer-vocabulary-softmax`, `ml-gpt2-learned-position-lookup`. Mechanical check (`conform.mjs`): all 130 distinct payloads pass every limit the entry states; all 1,216 variants parse. In 66 of 145 payloads (not de-duplicated) `dimensions` differs from rows x columns: the whole-tensor shapes such as 1 × 512 over 4 cells, which supports the wording. No contradiction found.

## 2. token-links

**Today's text: 118 characters, one sentence,** in the closing block (sentence 9 of 14, offset 1,195 of 1,736; main `explanation-references.js:308`, `PHASE02_DIAGRAM_GUIDANCE`; M2 `explanation-diagram-kinds.md` line 7), verbatim (the lead re-read it in the M2 file): "For token-links, show the value of the heaviest weight on its link and say in the caption that the weights sum to one." Nothing in the kinds list or the label line.

**Fields its schema allows** (`token-links-spec.js:4-15`):

| field | type and limit | required |
|---|---|---|
| `title` / `caption` | text, 90 / 140 | yes / no |
| `source` | 2-8 texts, each at most 24 shown (schema 48) | yes |
| `target` | 2-8 texts, each at most 24 shown (48) | yes |
| `queries` | 1-3 items of `{index, weights}`: `index` int 0-7; `weights` 2-8 numbers, each 0 or more (up to 1e9) | yes |
| `normalized` | boolean | no |

Gemini sees none of the counts or ranges. Validators (`token-links-spec.js:24-30`): `index` must be below `source.length`; indices distinct across queries; `weights.length` equal to `target.length`; without `normalized`, each weight at most 1. **Server-derived** (`derived.js:168-180`, the token-links row at `:306`): with `normalized: true`, a query that already sums to 0.98-1.02 with each weight at most 1 stays as written, any other query is replaced by its shares (2 decimals, summing to 1), and a total of 0 or less is refused ("Normalized query weights must have a positive total"). Without `normalized` nothing checks the sum, so "sum to one" is guaranteed only with `normalized: true`. Renderer: the heaviest weight's badge is drawn by the renderer (`token-links-layout.js:172`, `:51-58`); a weight of exactly 0 draws no arrow (`:160`).

**Proposed entry** (the kept sentence first, unchanged, then one new sentence of 446 characters; about 565 characters in all):

> (kept, unchanged) For token-links, show the value of the heaviest weight on its link and say in the caption that the weights sum to one.
> (new) A token-links diagram has source and target [2-8 texts each, at most 24 characters] and queries [1-3 of {index, weights}]: index is the zero-based position of the query token in source, different in every query; weights has one number of 0 or more for each target token, in target order; set normalized to true, so that a query whose weights do not sum to about 1 is rescaled by the server to shares that do; without it every weight is at most 1.

| clause | support |
|---|---|
| source and target 2-8 texts, at most 24 characters | validator `token-links-spec.js:4` (the schema says 48) |
| queries 1-3 | validator `token-links-spec.js:14` |
| index zero-based, different in every query | validator `token-links-spec.js:24-25` |
| one weight per target, in target order | validator `token-links-spec.js:27-28` |
| "0 or more" | validator `token-links-spec.js:13` |
| "set normalized to true ... rescaled by the server to shares" | **server behaviour**, `derived.js:170-178` |
| "about 1" | the server's tolerance 0.98-1.02, `derived.js:176` |
| "without it every weight is at most 1" | validator `token-links-spec.js:29-30` |

Placement: the old sentence stays unchanged as the first sentence (so M3a's moved sentence is unchanged) and the new one follows; a descriptive sentence first would read more naturally, which is a one-line reorder that does not touch M3a's moved text.

**Consistent with:** `ml-self-attention-token-links`, `ml-transformer-attention-softmax` (3 depths), `ml-transformer-cross-attention` (3 sources, 6 targets), `ml-transformer-attention-across-distance`, `figure-retro-chunk-attention` (2 sources, 8 targets), `figure-gallery-depth-attention` (2 queries), `ml-transformer-parallel-attention-heads` (panels), kind-gallery entry 22. All 19 distinct specs pass every check above (2-8 tokens each at most 24 shown, the longest 18; 1-3 queries; distinct in-range indices; one weight per target; weights 0 or more; `normalized: true` on all 19; weights summing to 0.98-1.02 with each at most 1). No reference contradicts the wording. Two things the proposal does not test: no reference uses a weight of 0, and no reference omits `normalized`, so the "without it" clause is backed only by the validator.

## 3. block-stack

**Today's text: 82 characters, one sentence,** in the closing block (sentence 8 of 14, offset 1,112 of 1,736; main `explanation-references.js:308`; M2 line 7), verbatim (re-read by the lead): "Name block-stack components, including role-tagged inset steps, with noun phrases." Nothing in the kinds list or the label line.

**Fields its schema allows** (`block-stack-spec.js:12-23`):

- top level: `title` (required, 90), `caption` (optional, 140), `blocks` 2-6 items, `orientation` optional (`vertical` or `horizontal`), `edges` optional at most 4 of `{kind:"residual", from, to, merge?}`, `callouts` optional at most 4 of `{node, label at most 48, value? at most 16}`;
- each block: `id` (`^[A-Za-z][A-Za-z0-9_-]{0,31}$`, required), `label` (at most 60, schema 120, required), optional `repeat` (int 2-999), `repeatTo` (an id), `variant` (at most 14), `dims` (at most 18), `role` (`norm`, `attention`, `feedforward`, `embedding`, `output`, `changed`), `merge` (`add` or `multiply`), `inputs` (at most 2 of `{label at most 24}`), `detail` (int 1-3), `diagram` (one of three child shapes: `{kind:"flow", steps:[2-5 texts at most 60 or {label at most 60, role}]}`; `{kind:"layers", layers:[2-5 of {label at most 50, detail? at most 80}]}`; `{kind:"tensor", tensor:{...}}` with the tensor payload and its own at-most-8-cells rule).

None of the array counts or ranges reach Gemini. Validators (`block-stack-spec.js:26-63`): block ids unique; a horizontal stack allows no edges, callouts, inputs, merge or repeatTo, and its blocks may only hold a tensor child; `repeatTo` needs `repeat`, must name a later block and groups must not cross; each edge's `from` and `to` must be block ids with `to` the same block as `from` or later; each callout's `node` must be a block id. Server: nothing is derived; a `detail` marker that points at its own visual or at a missing or invalid one is removed silently (`learn-primitives.js:1518-1540`) and renumbered when visuals are dropped (`:1098-1121`), so a bad `detail` never fails a card. Renderer: `repeat` alone draws "×N" (`block-stack-layout.js:65`); `repeatTo` draws a bracket from the block through the target (`:383-387`).

**Proposed entry** (the kept sentence first, unchanged, then the new text; 876 characters in all, the kept sentence is 82 of them):

> (kept, unchanged) Name block-stack components, including role-tagged inset steps, with noun phrases.
> (new) A block-stack has blocks [2-6 of {id, label, role?, dims?, variant?, repeat?, repeatTo?, inputs?, merge?, diagram?}] drawn top to bottom, or with orientation "horizontal" one strip per block; label at most 60 characters, dims 18, variant 14; repeat 2-999 draws ×N, and with repeatTo (the id of a later block, with repeat, groups never cross) it counts every block from this one through that one; inputs [up to 2 {label}] are side inputs, joined by merge "add" or "multiply"; edges [up to 4 {kind:"residual",from,to}] bypass from a block to itself or a later block; callouts [up to 4 {node,label,value?}] annotate blocks; a horizontal stack has none of inputs, merge, repeatTo, edges or callouts; a block's diagram is {kind:"flow",steps:[2-5 texts or {label,role}]}, {kind:"layers",layers:[2-5 {label,detail?}]} or {kind:"tensor",tensor}, and in a horizontal stack only tensor.

| clause | support |
|---|---|
| blocks 2-6 | validator `block-stack-spec.js:20` |
| label at most 60, dims 18, variant 14; repeat 2-999 | validator `block-stack-spec.js:16-17` |
| repeatTo rules | validator `block-stack-spec.js:46-54` |
| inputs up to 2; merge enum | validator `block-stack-spec.js:18`, `:2` |
| edges up to 4, "to itself or a later block" | validator `block-stack-spec.js:21`, `:56-59` |
| callouts up to 4, node must be a block | validator `block-stack-spec.js:22`, `:61-63` |
| horizontal restrictions | validator `block-stack-spec.js:28-29`, `:37-41` |
| child shapes and 2-5 counts | validator `block-stack-spec.js:4-11` |
| "draws ×N", "counts every block from this one through that one" | renderer `block-stack-layout.js:65`, `:383-387` |
| `detail` | left out (question F) |

No server-behaviour claim, no pointer to another kind: flow, layers and tensor appear only as this kind's own child shapes, so rule 5 needs no marker. Droppable to shorten: the `callouts` clause (it appears in 1 of 107 specs), `variant 14` and `dims 18`, the `merge` mention. Addable: `detail` 1-3 (about 70 characters). `role` values are omitted because Gemini already sees the enum; `changed` is left unexplained (question H).

**Consistent with:** `ml-transformer-encoder-stack` (a repeat group with residual self-edges), `ml-llama-decoder-block`, `ml-gpt2-feedforward-expansion` (dims), `ml-transformer-token-embeddings` (horizontal, tensor children), `figure-gallery-layer-specific-token-lookup` (merge with inputs), `figure-attention-output-gate` (merge multiply), `ml-gemma-decoder-stack` deep (callouts, flow children with roles, two inputs without merge), `raschka-residual-gain-and-soft-logit-cap` (`detail`). Of the 107 distinct specs all pass every limit the entry states (blocks 2-6, ids, label at most 60, dims at most 18, variant at most 14, repeat 2-999, repeatTo rules, edges and callouts, 2-5 child steps and layers); the 8 horizontal specs follow the "none of ..." rule; 30 specs have `inputs` without `merge`, so `merge` is optional and the wording "joined by merge" is loose on that point. No contradiction found; the "noun phrase" rule was not tested mechanically.

---

## Questions for the owner (nothing is decided here; the lead's recommendation after each)

- A. **Panels.** With a panels comparison the panel diagram union always includes token-links (and block-stack when `blockStackPanels` is set), so under rule 2 every panels comparison card could receive the token-links entry (about 565 characters). Should kinds allowed inside panels get their entries? Recommendation: yes, as the spec says ("kinds the schema allows inside a comparison's panels or a transformation's states count").
- B. **No-plan cards.** Rule 4 sends every entry, so these three add about 1,739 characters of new text (about 1,941 counting the kept sentences separately) to every no-plan request, whose schema has only the 9 core kinds (plus the quant kinds when `quant` is set); the three kinds appear only if a reference or a required visual steers. Today's part 4 already names kinds the schema lacks, so this is new in size, not in kind. Accept, or send the three entries only when the schema allows their kind?
- C. **Tensor scope.** Tensor is mostly a payload inside other hosts: 90 payloads in 13 references inside transformation items, 42 in 3 references as block-stack children, and only 13 payloads in 4 references at top level. A transformation card with tensor items is allowed by `tensorHosts` but would get no tensor text, because the entry is chosen by kind. In scope or not?
- D. **Gemini's blindness to limits.** Gemini is told 48-character tokens (real 24), 24-character dimensions (real 12) and 120-character block labels (real 60) and sees no counts at all. Every limit left out of an entry is invisible to it, and a wrong number would cause refusals. Keep the entries as full as proposed, or shorten them (the variants above)? Recommendation: keep the limits that cause refusals, shorten the rest.
- E. **The token-links sentence.** It asks the author to "show the value of the heaviest weight on its link", which the renderer already does (`token-links-layout.js:172`); only 4 of the 19 reference token-links specs follow "say in the caption that the weights sum to one" (13 have captions without it, 2 have no caption). Kept unchanged because M3a moves it unchanged; the owner may want it reworded in a later step.
- F. **`detail`** (block-stack) is left out of the proposed entry; the server strips an invalid one, so omitting it is harmless. Add it (about 70 characters)?
- G. **`dimensions`** as "the shape of the whole tensor" is a reference convention, not enforced. Keep the wording or state only the limit (at most 12 characters)?
- H. **`role: "changed"`** (block-stack) is described only in the README (changed blocks highlighted in comparisons); the proposed entry does not define it.
- I. **Entry order.** Today's closing block puts block-stack before token-links and tensor has no position. Suggestion: tensor, token-links, block-stack, as the planner and `spec.js:154` order them. (The no-plan order is M3a's to document.)
- J. **"Set normalized to true"** lets the server change the author's raw numbers; prose that cites them needs the `{{d:...}}` token, which the shared token rule covers.

## Not checked

- No model run: nothing shows that the new wording changes any card.
- The request-hash and assembly tests of M2; layout fit refusals (for example 8 tokens of 24 characters in a narrow box); the 16,384-character spec cap (`spec.js:15`) for a large block-stack; references outside `libraryRefs()` (kind-gallery depth files and test fixtures); the noun-phrase rule and the caption wording; reference text and caption claims (for example granola's "bottom row totals 69 g"): only the schema and validator facts were checked.
- The effect on Gemini's 362-property schema limit (the entries add no schema properties).
- M2's `.md` file and main's text were compared on the three sentences and the kinds-block head only, not character for character (the lead re-read the two kept sentences in the M2 file).
- The lane's scripts (`schema-dump.mjs`, `limits-dump.mjs`, `conform.mjs`, `stats-tensor.mjs`, `stats.mjs`, `panel-kinds.mjs`, `find-text.mjs`, `compare-text.mjs`, `final-count.mjs`) are in `C:/s/sj-text-3c-out/` and not committed.
