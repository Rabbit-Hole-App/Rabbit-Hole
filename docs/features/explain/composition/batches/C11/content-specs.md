# C11 content specifications — generation and music

Binding C11 content:5 queue families,9 actual targets (5 NEW+4 REUSE),15 source headings and39 resolved visuals. Source authority is revision05d5f02f64b474dcf0f830050af4e34907fbdaa8. Keep the existing native schemas/renderers/author path; all substantive rendered-QA decisions below are consolidated into the binding shapes rather than conflicting appendices.

## Approved routing and catalog exception

Keep the authoritative **five queue rows, family identities, representative/alias roles and dedupe bases unchanged**. The music family retains original topic/module `music-tokenization`, forward-merged into batch topic `language-generation`. A source-specific target map sits alongside the family map; a family representative may legitimately route to an old complete example while uncovered aliases route to the queued NEW id.

| Actual target | Mode | Exact source coverage | Final catalog lessons |
|---|---|---|---|
| `ml-gpt2-music-event-tokens` |genuine REUSE|GPT2-62|retain08/15|
| `ml-music-tokenization-music-events-and-time` |NEW|GPT2-63|08/15|
| `ml-word2vec-prefix-guesses` |genuine REUSE, approved catalog exception|GPT2-02|[03] becomes[03,01] for this source only|
| `ml-language-generation-vocabulary-score-probabilities` |NEW|Transformer31, GPT2-25|03|
| `ml-kv-cache-decode` |genuine REUSE|GPT2-16,42|retain[]|
| `ml-language-generation-key-value-cache` |NEW|GPT2-41,49|[]|
| `ml-language-generation-greedy-versus-sampling` |NEW|GPT2-27|03|
| `ml-language-generation-autoregressive-feedback` |NEW|Transformer29,30; GPT2-07,15|[]|
| `ml-gpt2-continue-prefix` |genuine REUSE, dedicated-event highlighting accepted|GPT2-08|retain its existing01; source08 remains[]|

Root accepted **9 actual targets =5 NEW+4 REUSE**:10 headings in NEW content and5 through existing complete source-specific points. GPT2-08 routes to unchanged ml-gpt2-continue-prefix because its dedicated Choose flickers event plus literal enlarged-prefix dependency carries that point. This is dedicated-event highlighting, **not inline token emphasis**. Exact inline token styling remains an expressibility limit of that ordinary view. No queue/dedupe row changes or keyword-only duplicate is authorized.

Root approved the keyboard catalog delta **['03']→['03','01'] for exact source02 only**. Apply it as one explicit id-specific data-field exception outside the overlay, preserving03 and appending01. Source02's manifest lessons remain exactly['01','03']; no other source/catalog lesson changes. This introductory prefix-probability source justifies01 individually, not through a batch union or skip-gram association. The report must enumerate the one allowed catalog-field change; all old visuals, prompts, useWhen and other metadata remain intact.

Reuse overlays stay limited to their allowed prompts/keywords fields. Candidate reused paraphrases may be appended as additive prompt entries, not a new overlay paraphrases field. Do not place lessons, useWhen, sources or other forbidden fields in an overlay; the approved keyboard lesson delta is a separate explicit catalog data-field exception. Preserve old prompt/keyword entries, useWhen, all depth payloads/detail inheritance and historical token/hash receipts except the precisely authorized three smooth:false removals from reused music Deep, described below. Existing chapter associations and baseline picks remain history, not source-fidelity proof.

## Exact15 source headings and Elements

Brief roots are `docs/features/explain-on-canvas/handoff/figure-briefs/illustrated-gpt2/briefs.md` and `.../illustrated-transformer/briefs.md`; suffix `#figure-NN` is exact. Preserve full source metadata, including kinds, sequence and gapTypes, from the authoritative queue without applying a target's catalog union to every source.

| Queue family / role | Exact heading | Verbatim prompt | Exact source Elements | Source lessons |
|---|---|---|---|---|
| music / representative |GPT2-62|Music can be tokenized into a vocabulary that encodes changes in pitch, timing and loudness.|New event IDs grouped by note onset, note release, velocity and elapsed time, with the fact that an event can change timing without adding a note.|08/15|
| music / alias |GPT2-63|Note onset, elapsed time and note release events reconstruct a performed phrase with overlapping notes.|A new phrase with a few pitch-duration segments, matching event order and cumulative time, and unambiguous simultaneous note changes.|08/15|
| vocabulary / representative |GPT2-02|Keyboard suggestions illustrate the same basic next-token task as a language model.|A new prefix, several possible continuations, and their ranked chances without recreating the keyboard interface.|01/03|
| vocabulary / alias |Transformer31|A learned projection produces one score for each vocabulary entry and softmax turns those scores into next-token probabilities.|Decoder state, fixed vocabulary order, one logit and normalized probability per candidate, and the maximum marked.|03|
| vocabulary / alias |GPT2-25|The output layer projects a hidden vector to one score per token in the vocabulary.|Hidden state, shared embedding weights when discussing GPT-2, and scores aligned with vocabulary slots.|03|
| cache / representative |GPT2-16|The next inference step processes the new token while earlier context remains available.|Two time steps, the new token as the active query, and previous keys and values reused as context.|[]|
| cache / alias |GPT2-41|The cache keeps a layer's earlier keys and values for future token queries.|One cache row per earlier position, labelled key and value entries, and a selected layer.|[]|
| cache / alias |GPT2-42|A new token query can score cached earlier keys without recomputing their projections.|Cached earlier keys and values, new query and new cache entries, then a read of old and current rows.|[]|
| cache / alias |GPT2-49|A decoder head uses stored earlier keys as well as the newly computed key when scoring context.|New query, origin of each key, and weights normalized across the same allowed positions.|[]|
| selection / representative |GPT2-27|Greedy selection and sampling can choose different next tokens from the same distribution.|Same normalized weights, the highest-probability token, and a labelled example draw selecting a different candidate.|03|
| feedback / representative |Transformer29|The encoder computes source memory before the decoder begins to predict target tokens.|Source encoding once, encoder keys and values held fixed, the first target prefix, and one prediction feeding the next step.|[]|
| feedback / alias |Transformer30|Autoregressive generation appends each predicted token to the prefix and repeats until a stop token or limit.|Ordered inference steps, the same fixed source memory, visibly growing target prefix, and a labelled stopping event.|[]|
| feedback / alias |GPT2-07|A causal decoder reveals one predicted token at each successive generation step.|Seed prefix, ordered prediction events, and one visible token appended per event.|[]|
| feedback / alias |GPT2-08|The token just predicted becomes part of the next autoregressive input.|Two consecutive prefixes with the newly appended token highlighted and the next call visibly dependent on it.|[]|
| feedback / alias |GPT2-15|Generation can begin from a special start condition even with no user text.|A start condition, first model prediction, and an explicit distinction from continuing a supplied prompt.|[]|

The unchanged dedupe meanings are: music vocabulary plus cumulative-time reconstruction of one phrase; vocabulary projection followed by probabilities, with tying an explicit GPT2 variant; successive layer-local cache storage/read/append; two selection rules over the same normalized distribution; and repeated growing-prefix generation with encode-once and optional empty/start variants. Feedback's `flowReturnRequirement` remains `conditional`: a genuine unrolled timeline is allowed. No false acyclic-flow return arrow is required.

## Ordinary old-view evidence and accepted GPT2-08 coverage

Fresh read-only author preparation inspected four existing targets at brief/balanced/detailed on normal and fast profiles:24 local request preparations, with no provider invocation. All returned their native parent ids; none became a single variant. Each profile exposes at most3 visuals. These are existing-payload observations, not tests or acceptance of any new C11 routing.

The ordinary Balanced `ml-gpt2-continue-prefix` author payload is a timeline titled “Autoregressive text generation in GPT-2”, with exactly:

| Time | Actual label | Actual detail |
|---|---|---|
|Prompt|Read “the hall light”|An empty prompt can start from a special token.|
|First step|Choose “flickers”|absent|
|Second step|Use “the hall light flickers” as the prefix|absent|

Its caption is “Each choice becomes part of what the model reads on the next step.” Balanced sends no detail. Both normal/fast send this same native timeline. Parsed outgoing primary compact hash is `58a6fd44ed324d1dcdb03f235828c189de878295fa0106d5738aee45dd41040c`; the audit's raw catalog primary hash is `abb46bc2184c80b688b1a006b812ebc215c17ef99e0b0c5f436e1dc393162df3`. Those hashes cover different JSON property-order stages; do not compare raw catalog serialization with parsed author serialization as a content-drift test.

There is a dedicated choice event singling out flickers. There is no inline style, emphasis field or typeset highlight around flickers inside the enlarged prefix. Overview has the same three events; Deep adds the accurate six-probability bar extra and a more precise caption, not inline token emphasis. The second event is the first computed output; the next-prefix event is an input to a later call, not evidence of a second computed prediction. The empty-start detail is a note, not a displayed empty-start inference or stop event.

Root accepted the ordinary dedicated-event interpretation for source08. The separate Choose flickers event and the exact enlarged-prefix input dependency carry the source point; the old id, all three timelines, Deep bar detail, useWhen and catalog01 remain unchanged, while source08 retains lessons[]. This does not grant coverage for07/15 or Transformer29/30, which use the NEW full trace.

Report the boundary literally: **dedicated-event highlighting is present; inline token emphasis is absent**. Exact inline styling remains an expressibility limit, not a new task or an excuse to modify old bytes. Do not add KaTeX boxes, emphasized words or another formatting workaround. New feedback uses ordinary Emit/Next-call labels with exact prefixes. No duplicate id or conditional tenth source route is introduced.

Other reused ordinary points are complete: music62 shows four categorical vocabulary groups including Wait250/id2 without a note; keyboard02 shows prefix “a small robot sorts” and bars seeds=.620, bulbs=.278, packs=.102; symbolic cache16/42 shows eight messages across Decoder/KV cache/Attention at t and t+1, explicitly projecting only the new q/k/v, appending new k/v, reading all old/current pairs and returning context. It is296 tokens and704px tall at408 in the audit, with no detail or depth override. Preserve it rather than shortening it. Old dimensional receipts are evidence only for those old payloads, not new C11 visual QA.

## Data namespaces, identities and rounding

Keep three independent new calculation namespaces: shared language output head/prefix runs; selected-layer self-attention cache; fixed source-memory argument. Music derives from the existing original event arrays without mutating them. Similar vector widths do not imply shared learned parameters between these namespaces.

Every numeric result derives from declared operands. Retain unrounded values through softmax, cumulative probabilities, weighted contexts, token choice and probes. Derive display arrays once:3 decimals for probabilities/scores/attention contexts and displayed CDF bounds, exact small integers/halves for table/state operands and integer ms for music. Labels round for display only; rounded probabilities need not sum exactly1. Use approximate equality if displayed operands were rounded. Never repair a sampling decision or probability sum from displayed bars. Scalar tolerances for independent exponential arithmetic accommodate last-bit platform differences; no pretyped CDF boundary or rounded score becomes a computational input.

Stable identities: vocabulary slot0/1/2; exact token-array prefix keys; layer id A and absolute cache position P0…P3; source-memory row S0/S1; music token id determined by the full type/value pair, event index by performed order and note identity by pitch/onset. A text token's string is not a substitute for its position id.

## Shared language head, projection, selection and generation

Output vocabulary, in fixed slot order, is **birds, fly, <eos>**. `<bos>` is input-only and is excluded from this output vector. The same supplied toy table E is the input lookup and output projection operand; no second independent output table and no bias:

| Slot / input token | E coordinate0 | E coordinate1 |
|---|---:|---:|
|0 birds|2|0|
|1 fly|0|2|
|2 <eos>|1.5|1.5|

E has shape3×2; lookup selects a row of width2. Supplied final states h have shape2×1; output z=E h has shape3×1. At fixed slot j, z_j is the dot product of E's row j and h. Softmax uses exp(z_j−max z) divided by the sum over exactly all three output slots. The same table identity is visible in the input-row labels and the output operation. “Learned projection” describes the source's parameter role; these tiny weights and final states are supplied illustrations, not training or full decoder results.

| Exact internal call prefix | Supplied h | Computed z | Full-precision p, approximately | Greedy token |
|---|---|---|---|---|
|[<bos>]|(1,0)|(2,0,1.5)|(.574096992967695,.077695579148571,.348207427883735)|birds|
|[<bos>,birds]|(0,1)|(0,2,1.5)|(.077695579148571,.574096992967695,.348207427883735)|fly|
|[<bos>,birds,fly]|(1,1)|(2,2,3)|(.211941557617085,.211941557617085,.576116884765829)|<eos>|

Each h is a separately supplied final state for that exact prefix, not the selected input row and not a decoder-state transition calculated by this toy. A missing prefix has no declared state or next prediction; in particular sampling birds after BOS birds does not license a later call on BOS birds birds. Greedy is argmax of full-precision p; deterministic lowest-slot tie-breaking is the declared general rule, although each chosen maximum here is unique.

Projection probe: add the same c=1 after the output projection to every z entry while keeping E/h/vocabulary fixed. For the Standard prefix BOS birds, z=(0,2,1.5) becomes (1,3,2.5), while every normalized p and the maximum fly stay unchanged. Other supplied prefixes similarly shift to (3,1,2.5)/(3,3,4). Show actual shifted numeric score cells. This is softmax common-offset invariance, not a change in the tied table or an inference about arbitrary parameter equivalence.

Selection case uses only the BOS birds distribution above. Full CDF boundaries are b0=0, b1=p0≈.077695579148571, b2=p0+p1≈.651792572116265, b3=1. Candidate j owns [b_j,b_(j+1)); valid supplied u is in[0,1). Use the first full-precision cumulative boundary strictly greater than u; an exact internal boundary belongs to the next interval. The final endpoint1 denotes the whole normalized unit interval, not a renormalization from displayed bars. A declared uniform u=.04 chooses birds, while greedy chooses fly. Deep changes only u to.06, still inside birds' interval: sampled birds and greedy fly stay unchanged. No empirical sampling-frequency or better-output claim is made.

Serialization/start/append/stop contract:

1. Empty user text initializes internal prefix[<bos>]. A supplied user prompt birds initializes[<bos>,birds]; BOS is a special condition, not an ordinary user word. The state lookup key is the entire ordered token array, with a consistent literal serialization; display joins are not parsed back into a state key.
2. Before each call, select its supplied h by exact prefix identity, calculate all z/p and choose the greedy token. Append that token to the internal prefix and emitted-token trace, including an emitted EOS marker.
3. Test EOS immediately after append. It stops the run with reason eos and no further state lookup. Otherwise stop at the declared max-new-token count if reached. EOS takes priority if both conditions happen on the same emitted token.
4. The empty ordinary run emits birds, fly, <eos>, ends with internal[<bos>,birds,fly,<eos>] and visible text “birds fly”. Visible text excludes BOS/EOS; their omission is serialization policy, not silent truncation of a prediction.
5. With empty input and limit2, only birds/fly are emitted; internal prefix is[<bos>,birds,fly], stop reason limit, same visible text. EOS is not invented or emitted afterward. With supplied prompt birds, the two declared calls emit fly/EOS and stop eos; the prompt's birds was supplied, not generated in that run.

Fixed source-memory variant for Transformer29/30: supplied source rows S0=(1,0), S1=(0,1); source Wk=I2 and Wv=diag(2,1). Derive once Ksrc=((1,0),(0,1)), Vsrc=((2,0),(0,1)), store as memory M, and pass that same immutable-by-convention object/value to every target call. Source encoding precedes all prediction events; no later re-encoding is shown. This is a declared temporal/interface illustration: h is supplied, not computed by M or a full Transformer. The temporal order carries no numeric M→h dependency, and no edge/label may claim such a computation. It is distinct from the growing self-attention cache A below.

## Selected-layer numeric cache

Layer A has supplied causal input rows P0=(1,0), P1=(0,1), P2=(1,1); maps Wq=Wk=I2, Wv=diag(2,1). For row h_i, k_i=h_iWk, v_i=h_iWv; q_current=h_currentWq. At P2, old positions are P0/P1 and current is P2:

| Position / origin | K0 | K1 | V0 | V1 | q dot K /sqrt2 | Normalized weight |
|---|---:|---:|---:|---:|---:|---:|
|P0 old|1|0|2|0|.7071067811865475|.2482550782577231|
|P1 old|0|1|0|1|.7071067811865475|.2482550782577231|
|P2 current|1|1|2|1|1.414213562373095|.5034898434845538|

Current q=(1,1); a=softmax(qK^T/sqrt2) normalizes over exactly P0/P1/P2. Context=aV=(1.5034898434845538,.7517449217422769). No future row participates. These are standalone layer inputs/maps, not a reproduction of every layer of a trained decoder or a measured cache speedup.

Deep appends P3 input(-1,1), giving q=(-1,1), k3=(-1,1), v3=(-2,1). Scores over P0…P3 are(-.7071067811865475,.7071067811865475,0,1.414213562373095); weights are(.06458483864659637,.26565361202674675,.13098547884644676,.5387760704802101); context=(-.6864115059743341,.9354151613534036). P0…P2 K/V numbers remain identical; P2's role becomes old at the next call without changing its identity/data. The current query and normalization set change, so weights/context are not asserted equal across time.

Implicit probe compares two paths **at the same prefix**: reuse earlier K/V plus append only the current pair versus reproject all identical supplied causal H rows with the same maps. Their K/V, weights and context must agree independently at P2 and again at P3. Across calls only store-prefix K/V values are invariant; weights/context legitimately change. Each real decoder layer would have its own cache; source memory M is a separate fixed store.

## Music reconstruction from the existing phrase

Clone the imported old `musicEvents` array and every nested type/value event pair, and clone the old `musicTokenIds` vocabulary array, before any probe. Derive the base/probe cases from those copies; never reorder or edit the imported arrays. Preserve the old module API and every exported value, including old notes and token IDs. Keep the cloned vocabulary in original order rather than rebuilding first-occurrence IDs from reordered events. The fixed type/value vocabulary is0 Velocity72,1 Start60,2 Wait250,3 Start64,4 Release60,5 Start67,6 Release64,7 Release67. There are8 unique IDs and10 performed events; every Wait250 reuses id2. A wait adds time without adding a note. Velocity72 precedes all starts and is retained as the phrase's supplied loudness.

| Event index | Token id | Event | Clock after event, ms |
|---:|---:|---|---:|
|0|0|Velocity72|0|
|1|1|Start60|0|
|2|2|Wait250|250|
|3|3|Start64|250|
|4|2|Wait250|500|
|5|4|Release60|500|
|6|5|Start67|500|
|7|2|Wait250|750|
|8|6|Release64|750|
|9|7|Release67|750|

Derive onset/release intervals by active pitch at the accumulated clock: C4/pitch60=[0,500], E4/64=[250,750], G4/67=[500,750], durations500/500/250ms. At500,60 releases and67 starts; at750,64 and67 release. No active note remains. Store note identity by pitch/onset so output-array order cannot fake a changed phrase.

The full ordered trace fits four equal-clock groups, not an illegal ten-event ordinary timeline:

| Clock | Ordered ids | Ordered event text |
|---|---|---|
|0ms|0,1|Velocity72; Start60|
|250ms|2,3|Wait250; Start64|
|500ms|2,4,5|Wait250; Release60; Start67|
|750ms|2,6,7|Wait250; Release64; Release67|

Deep swaps only Release60 and Start67 at the same500ms clock with no intervening wait: that group's ids become2,5,4, event order Wait250; Start67; Release60. Recompute clocks/active notes and obtain the same three intervals and total750ms. This commutation claim is limited to these distinct-pitch simultaneous operations. Do not change Wait250's duration under id2, infer that same-pitch operations commute or treat an ID as a numeric magnitude.

## Concrete native depth plans — full Standard routes

Every NEW top-level reference copies its Standard spec/detail. Explicitly set detailSpec:null in **all NEW Overview overrides** so the Standard detail is not inherited. Replace each Deep detail deliberately. Production shallow-merges depth overrides with the top level before preparing the author request; inventory/token/width/schema checks must inspect those resolved views. A missing detail property is not the same as no outgoing detail. Do not clear any old reused inheritance or payload to simplify the inventory.

| NEW target | Overview main / resolved detail | Standard main / resolved detail | Deep main / resolved detail |
|---|---|---|---|
| music |2-series coordinate plot: C4/E4 subset of the three-note phrase, explicit endpoints, no detail|3-series pitch/time coordinate plot of all three segments;4-row teaching matrix with full ordered IDs/events|Same3-series plot after the simultaneous-event swap; recomputed4-row group matrix with changed500ms order|
| vocabulary head |3 probability bars for BOS birds, labelled slots and maximum fly; no detail|Native3-tensor relationship graph: independent given h(2×1) and supplied shared E(3×2) each feed z(3×1); matching3-bar probability detail|Same independent operand graph; z tensor3×2 has columns z/z+1; unchanged matching3-bar probability detail|
| numeric cache |2 old-position rows×4 K/V columns, selected layer A; no detail|3 position rows×4 columns K0/K1/V0/V1, old/current labels;3 attention-weight bars over exactly P0/P1/P2|4 position rows×4 K/V columns with P3 new;4 weight bars for the recomputed current query|
| greedy/sampling |Full3 probability bars, selected identities and supplied draw.04; no detail|Complete3-interval CDF number-line and actual.04 marker as PRIMARY; unchanged full3 probability bars as DETAIL|Same CDF primary with only draw changed to.06; unchanged full3 probability bars detail, same sampled/greedy identities|
| feedback |4-event timeline: memory prepared; empty start→birds; next call→fly; EOS stop. Ordinary Emit/Next-call labels use exact prefixes; no detail|5-event timeline below, plus numeric2×4 source-memory tensor|Same full5-event ordinary timeline, plus3-row teaching matrix comparing empty ordinary, empty limit2 and supplied-birds runs|

Music plot axes are Time/ms0…750 and Pitch number59…68, with three named line series C4/E4/G4 and exact two endpoints per note, integerTicks:true on the pitch axis at the data-derived domain59..68 (accepted by actual normal/fast schemas), no smoothing field. Explicit points are the safe outgoing author form. Matrix columns Token IDs/Ordered events plus clock row headings retain all10 events via four groups; each full cell is≤40 characters. Native timing coordinates supply magnitude; IDs/event labels are categorical. Standard main/detail together carry source63's full point; the old reused vocabulary alone is never called a reconstruction. Overview is explicitly only two overlapping notes C4=[0,500]ms/E4=[250,750]ms from the supplied three-note phrase; it does not claim a full trace. Standard/Deep retain all three notes and all clock groups, Deep embeds the actual reorder probe rather than adding a fake comparison metric.

Vocabulary Standard/Deep primary is a native relationship graph with exactly three numeric tensor nodes and layout:graph. Independently given h and supplied shared E each feed score node z; there is NO h→E edge and no detail:2 cue. Standard h has shape2×1, E3×2 and z3×1. E's rows are explicitly birds/fly/EOS and features0/1; z uses the same row order. The caption states h/E are given, E also supplies input lookup rows, z=Eh has no bias and fly is maximal. The same table identity is visible as an operand, never depicted as generated by h. Probability detail carries all three normalized candidates/slots with maximum marked. Deep keeps the same h/E and makes z a3×2 tensor: rows birds=(0,1),fly=(2,3),EOS=(1.5,2.5), columns base z then z+1. This is the actual common-offset probe with unchanged probabilities, not a horizontal six-value strip or a missing matrix operand. Graph nodes each have at most8 numeric cells; both input edges name the actual operand relationship. Overview remains full3 probability bars/no detail. Frozen primary entity count6Overview versus10Standard (3nodes/3labels/2edges/2edge labels) satisfies the genuine richer mechanism without padding.

Cache main title: “Layer A keeps one K/V row per position”. Columns K0/K1/V0/V1; rows P0 old,P1 old,P2 current (Deep P0 old/P1 old/P2 old/P3 current). The visible caption supplies actual q, identities H=K because Wq=Wk=I2, Wv=diag(2,1), and the same-position normalization rule. Exact Standard caption content: “Layer A: $q=(1,1)$, $W_q=W_k=I$, $W_v=\operatorname{diag}(2,1)$, $H=K$. $a=\operatorname{softmax}(qK^\top/\sqrt{2})$ over shown rows; weights rounded.” Deep replaces q with $q=(-1,1)$ and otherwise uses the same formula/maps. Origin prose is omitted because old/current is already explicit in the row labels. Each caption is below140 shown characters under the existing math-aware counter. The score column from the audit's tentative five-column plan is deliberately omitted: it is not required by41/49; all raw scores are still recomputed in data, and the probability detail encodes every normalized weight. Cache Overview/Standard use an explicit numeric color range0..2; Deep uses−2..2 so the new negative K/V values remain in range. Weight bars use unit Weight and projection/selection bars use unit Probability; each is≤12 characters. K/V columns are named numerical features, not a claim of one shared physical unit. An optional context output is not planned; if later drawn it requires actual numeric cells, not a prose-only result.

The cache grid's **native short-label minimum is444px** at a408 request (24 padding+100 row heading+4×80 cells). It fits680, but408 readability remains a mandatory actual visual gate; contact-sheet fit ratio is408/444≈.9189, not an automatic app shrink. This is disclosed rather than claimed to be an exact408 fit. Four short labels/integer K/V cells avoid the audit's denser five-column524px minimum. If full-grid preview is not readable, root must approve a faithful native depth/detail reshaping before implementation; do not quietly transpose away the explicit per-position-row requirement, drop a key/value coordinate, use a15-cell tensor or change the renderer.

Sampling number-line min0/max1 contains all3 half-open intervals, not the old six-candidate partial partition. Labels name candidates; draw marker carries u and sampled identity; greedy maximum fly is explicitly named in the primary CDF caption and matching probability-bar label. Probability bars for both rules come from the same array and candidate order. Raw interval endpoints derive from full-precision p; only displayed from/to values round the raw CDF to3 decimals:0,.078,.652,1. The visible caption says bounds rounded/decision raw. Sampling membership never uses these rounded boundaries or rounded bars. Deep moves only the draw marker and recomputes its membership; no generated continuation is made for an undeclared sampled prefix.

Recommended feedback Standard timeline uses five genuine temporal events, avoiding both a flow back-edge and an overfull eight-message sequence:

| Event | Label content | Detail content |
|---|---|---|
|Encode once|Encode source once; keep memory M|Ksrc/Vsrc fixed before the first prediction|
|Start|Call on <bos>; empty user text|Supplied birds would begin from the second declared prefix|
|Prediction1|Emit birds; append it|Next call uses <bos> birds|
|Prediction2|Emit fly; append it|Next call uses <bos> birds fly|
|Stop|Emit <eos>; append marker and STOP|No further call; visible text is birds fly|

All event labels≤55 and details≤90 shown characters. The actual prefix arrays generate these literal next-call strings; no pretyped next prefix is disconnected from append logic. Use ordinary Emit and Next-call labels only. Source08's accepted dedicated-event highlighting is carried by the unchanged reused old view; no inline token styling, KaTeX box/emphasis or equivalent workaround is added to the new trace.

The numeric memory extra is one2×4 tensor, rows S0/S1, columns K0,K1,V0,V1, values row0=(1,0,2,0), row1=(0,1,0,1). Its caption defines K=S and V=Sdiag(2,1), source rows supplied, fixed M at all calls, and supplied decoder h separate. It is exactly8 cells. Deep replaces it with a3-row×2-column teaching matrix: columns Stop reason/Final internal prefix; rows Empty ordinary=(eos after3,<bos> birds fly <eos>), Empty limit2=(limit after2,<bos> birds fly), Prompt birds=(eos after2,<bos> birds fly <eos>). Caption says all display “birds fly”, distinguishes supplied versus generated birds, and fixes the same memory/head. This is the concrete stop-limit probe; it does not continue a run after it stopped.

All main/detail routes are native: plot, matrix, relationship graph, bar-chart, heatmap, number-line, timeline and tensor. No new Standard composition or new single is planned. If implementation later proposes an eligible composition, its actual outgoing native single must carry the same full source point/data and preserve strict parent/single set equality; a partial leaf or keyword-only duplicate is not sufficient.

## Narrow routing vocabulary and five paraphrases per actual target

Exact source prompts go only to the target carrying that source point. Keep all old documented prompt picks. The following are additive candidates pending later old-pick replay; no broad generation/music/cache/softmax keyword is added merely to outrank an old point.

**REUSE music62 — `ml-gpt2-music-event-tokens`.** Phrases: `music pitch timing loudness vocabulary`; `event ids onset release velocity`. UseWhen remains unchanged. Five proposed paraphrases:

1. Show music pitch timing loudness vocabulary with stable event ids.
2. Which event ids onset release velocity entries change the performance?
3. Explain music pitch timing loudness vocabulary without drawing a keyboard.
4. Why can event ids onset release velocity include a time shift with no note?
5. Keep repeated waits in the same music pitch timing loudness vocabulary slot.

**NEW music63.** Phrases: `music event clock reconstruction`; `simultaneous note changes`. UseWhen: reconstruct the declared complete event order, accumulated clocks and overlapping note intervals; exclude a vocabulary table alone, weighted token links, a real recording claim or arbitrary event commutativity. Five paraphrases:

1. Trace music event clock reconstruction from ids to overlapping notes.
2. Which simultaneous note changes occur at the same accumulated clock?
3. Keep every wait in music event clock reconstruction.
4. Swap the two distinct-pitch simultaneous note changes and recompute intervals.
5. Match music event clock reconstruction to every onset and release.

**REUSE keyboard02 — `ml-word2vec-prefix-guesses`.** Phrases: `keyboard ranked continuation chances`; `fixed prefix next token alternatives`. Keep its standalone-next-word useWhen, old probabilities and original03; only the explicitly approved01 catalog addition is permitted. Five paraphrases:

1. Show keyboard ranked continuation chances after the fixed robot prefix.
2. Compare fixed prefix next token alternatives without recreating a keyboard interface.
3. Why do keyboard ranked continuation chances have different bar lengths?
4. Keep the same observed words while showing fixed prefix next token alternatives.
5. Distinguish keyboard ranked continuation chances from skip-gram training pairs.

**NEW projection31/25.** Phrases: `tied vocabulary head scores`; `candidate logit probability slots`. UseWhen: show the supplied decoder state, actual shared input/output table, aligned raw logits and full softmax output with maximum; exclude score-only text, positional attention, binary class probabilities and claimed full-decoder inference. Five paraphrases:

1. Compute tied vocabulary head scores from the given hidden state and table.
2. Keep candidate logit probability slots aligned with the input lookup rows.
3. Show the numeric operands behind tied vocabulary head scores.
4. Add the same score offset to candidate logit probability slots and renormalize.
5. Why are tied vocabulary head scores different from attention scores over positions?

**REUSE symbolic cache16/42 — `ml-kv-cache-decode`.** Phrases: `new token query reuse earlier projections`; `successive cache append read steps`. Old native sequence/useWhen/lessons[] stay unchanged; no numeric-row coverage is attributed to it. Five paraphrases:

1. Show new token query reuse earlier projections across two decoder steps.
2. Trace successive cache append read steps for the current key and value.
3. Which new token query reuse earlier projections avoids processing old tokens again?
4. Keep old and current pairs available in successive cache append read steps.
5. Follow successive cache append read steps without claiming a timing benchmark.

**NEW numeric cache41/49.** Phrases: `layer cache row origins`; `current query cached positions`. UseWhen: show selected-layer position-indexed numeric K/V entries and actual current query with normalized weights over exactly old/current positions; exclude fixed cross-attention memory, generic packed projections, future-key normalization and speed claims. Five paraphrases:

1. Show layer cache row origins for old and current positions.
2. Normalize attention for the current query cached positions only.
3. Keep K and V coordinates attached to their layer cache row origins.
4. Append one pair and recompute current query cached positions.
5. Compare layer cache row origins with full-prefix reprojection on the same inputs.

**NEW greedy/sampling27.** Phrases: `same distribution selection rules`; `greedy maximum sampled draw`. UseWhen: compare argmax and one declared uniform draw over the same full normalized vocabulary distribution; exclude changed temperatures/distributions, partial CDFs, empirical frequency claims and feedback to undeclared states. Five paraphrases:

1. Compare same distribution selection rules without changing the probabilities.
2. Show the greedy maximum sampled draw choosing different tokens.
3. Locate a labelled draw in all intervals of the same distribution selection rules.
4. Move only the draw while keeping the greedy maximum sampled draw comparison fixed.
5. Explain why same distribution selection rules do not rank sample quality.

**NEW feedback29/30/07/15.** Phrases: `growing prefix stop event`; `encode once generation trace`. UseWhen: show complete computed toy-head choices, actual append dependencies, fixed source memory prepared before prediction, BOS versus a supplied prompt and an explicit EOS/limit stop; exclude observed training labels, a fully computed Transformer state claim and a fictitious flow loop. Five paraphrases:

1. Trace an encode once generation trace through an explicit stop token.
2. Show each growing prefix stop event from the actual appended token arrays.
3. Distinguish an empty start from a supplied prompt in an encode once generation trace.
4. Keep source memory fixed while comparing the growing prefix stop event with a token limit.
5. Show the emitted token and exact next-call prefix in an encode once generation trace.

**REUSE old08 — `ml-gpt2-continue-prefix`.** Phrase candidate: `newly predicted token next prefix`; retain its old useWhen, visuals and catalog01. Dedicated-event highlighting is accepted; inline styling is absent. Five additive prompt candidates for the existing id:

1. Show the newly predicted token next prefix dependency in the hall-light example.
2. Which newly predicted token next prefix event feeds the second call?
3. Follow the newly predicted token next prefix after choosing flickers.
4. Explain the newly predicted token next prefix without inventing another prediction.
5. Keep the enlarged input in the newly predicted token next prefix example literal.

Reused views receive no new computed-depth probe or redrawn primitive. Their arithmetic/payload preservation is checked as-is; the related NEW music/cache/head/feedback targets supply the missing nontrivial computed probes.

## Effective primitive and author boundaries

Read actual domain-composed schemas. Coordinate plots allow up to5 series through ml-plot, not the stale base3; music uses3. Number-line permits at most3 intervals, exactly the new candidate count. Tensor payloads permit up to4 rows and8 columns but at most8 visible cells total. The proposed E3×2, h2×1, z3×1, Deep score3×2 and source-memory2×4 are individually legal. Heatmaps permit≤6 rows/6 columns; cache3×4/4×4 stays bounded. Ordinary timelines permit≤8 events; using five unrolled generation events and four grouped music events avoids ten-event overflows. Sequence remains≤4 actors/8 messages; no such new sequence is necessary. Teaching matrix cells stay≤40 characters, with no truncation.

A block's `merge` joins **after that block**. A residual from block from to block to branches from the from-block's incoming value before executing that block, bypasses the entire range **through the to-block**, and joins after it. Do not use either to imply an operand is added before its own block or to draw a return loop. The projection graph has exactly the two genuine operand edges h→z and E→z, with no h→E edge or merge/residual; temporal generation uses a real unrolled timeline. No invented link or false edge is needed to connect independent cases.

The author omits panels and stacked total. Fast bundling examines both selected main/detail and exposes the selected native kinds/illustration payloads; exact new prepared requests must be inspected after authorization. List transformation is not visual transformation; naked tensors, relationships, sequences or transformations cannot be smuggled into unsupported panel children. No nested compositions or3-child eligibility exception is proposed.

Default outgoing depth resolution shallow-merges old/top-level Standard and the selected override, then parses. Preserve old reuse merging, including the old music Deep plot and old prefix Deep bars. For new Overviews use explicit null detail overrides; all Deep replacements above are intentional. Every actual resolved primary/detail/single must later independently be≤300 compact cl100k tokens and fit680;408 readability is a separate preview/contact-sheet gate. Native SVGs overflow horizontally in the app rather than auto-shrinking. The cache444px boundary is disclosed above; no other new shape is promised as measured before authored JSON exists.

Tentative targets, not measured acceptance: music plot/event table about150–260 tokens each; projection independent three-tensor operand graph about230–300 and probability bars about100–150; cache main about180–280 and weights about100–170; selection bars/complete three-interval number-line about120–270; feedback five-event timeline about210–300 and memory/stop-case extra about120–230. If any exceeds300 or is unreadable, first shorten repeated labels/captions without deleting operands, fixed vocabulary slots, position origins, full event groups, exact targets, source memory, accepted dedicated-event coverage or stops. A remaining failure returns to root as an expressibility issue; no silent detail-only source substitution, numeric string table, schema change or broad budget promise is authorized.

Approved-route inventory is25 NEW resolved visuals:5 Overview mains;5 Standard mains+5 details;5 Deep mains+5 details. Four reused ids add14 unchanged existing depth views: music4, keyboard3, cache3, prefix4. Total39, by depth9/14/16. These are content-plan counts, not actual token/render/schema receipts. No new eligible Standard composition means no new single is currently needed; every later design change must preserve the same-point native author route and strict single equality.

## Remaining evidence and read-only scope

The08 dedicated-event interpretation and one keyboard01 catalog addition are accepted content decisions; the exact legacy music compatibility exception below is additionally authorized. Source-split manifest rows must preserve all15 exact headings and individual lessons, original family/dedupe rows and subject-local modules. Future implementation must derive all head/memory/cache/event data from declared operands; compare independent arithmetic, offset invariance, same-position normalization, cache-versus-full-reprojection, exact prefix appends/stop serialization, sampling boundary membership and distinct-pitch event-swap invariance. A new normalized distribution must never be inferred from a rounded label or a next prefix with no supplied state.

Actual author checks later cover every exact source and narrow paraphrase at all three depths on normal/fast and planned/unplanned routes, native parent ids and all present detail/single specs. Broad old-pick replay, old serialized payload preservation, strict singles, token/hash budgets, linter, snapshots and408/680 previews/contact sheets remain root-owned gates. The implementation report records measured acceptance; this content contract alone does not claim those checks passed. The fresh24 old request preparations and independent scalar/vector/event recomputations are read-only preparation, not a model call, test suite, new-spec acceptance or visual QA.


## Final rendered-QA decisions, preservation and interfaces

Selection's full3-bar Overview has6 primary entities. Standard/Deep CDF primary has8 (3intervals+3labels+1draw+1label), with all3 probability bars retained as detail. Deep changes only u=.04→.06 and recomputes raw membership. Music's explicit2-note Overview has6 entities versus9 for all3 Standard note segments; full event trace remains in Standard/Deep matrix. All five NEW Overview overrides use detailSpec:null, while REUSE depth inheritance remains unchanged. Total inventory remains25 NEW+14 REUSE=39, by depth9/14/16. No new Standard composition/single is introduced.

Author-schema checks confirmed y.integerTicks:true on both actual normal/fast music requests; the chosen NEW pitch domain remains data-derived59..68, recording integer tick mode in new data. The old REUSE music Deep fractional tick wrapping remains visually unchanged; no legacy axis edit is authorized.

Root-authorized precise data compatibility exception: remove ONLY smooth:false from the3 Deep series of ml-gpt2-music-event-tokens in gpt2-figure-references.js. Root evidence composition-overnight/c11-legacy-music-compatibility-proof.json proves fast schema invalid before/valid after and identical canonical semantic SVG/PNG pixels at320/408/680/720/960; representation changes only from polyline to equivalent M/L path. Keep points, numeric data, styles and every other field unchanged. Historical token receipts stay historical; disclose the exact3paths, raw payload/file hash and SVG representation changes. This is not a missing expressive capability and requires no serializer/schema/tooling workaround. Old gpt2-figure-data.js API/values/identity stay exactly frozen. All other old fields stay exact except additive REUSE prompts/keywords and the separate keyboard catalog lesson03→03,01 exception. Source02 remains01,03; source08 remains[] despite old prefix catalog01.

Modules: composition-language-generation-references.js exports4 NEW refs/derived from topic-language-generation-data.js with separate language/cache/sourceMemory namespaces; composition-music-tokenization-references.js exports1 NEW ref/derived from topic-music-tokenization-data.js. Combined topic-language-generation-sources.json preserves5 full families and9 source-partition association rows, all15headings exactly once. topic-language-generation-overlays.js contains only prompts/keywords for4 REUSE ids, with five additive prompt paraphrases per actual target. No lessons/useWhen/paraphrases/source field in overlays. Registry applies the one explicit keyboard catalog delta separately. Own subject-local tests/token receipts only; no new old-data mutation.

Before any C11 imports, canonical C10 API baseline captures all17 gpt2-figure-data exports (16nonfunction values) and48 embeddingAt(token,position) cases, plus raw file hash. A dedicated isolated control-plane test imports old data first, captures array/nested-pair/notes identities and all values, then dynamically imports new music data/references and rechecks after repeated derivations/local probe mutation. Authored web tests stay static because their frozen linter forbids dynamic import; no lint waiver. Music reconstruction clones every old pair and the vocabulary in original order before swapping distinct-pitch same-clock events; ids are never rebuilt from reordered first occurrences. All old API values/objects remain unchanged.

Root owns full prior replay/full suites/snapshots/bulk preview/sheets/independent review/publication. Each resolved main/detail independently<=300 compact tokens,680fit,actual408readable; numeric cache native444 is explicit. No new dependency, provider, deployment, schema, renderer, author prompt or tooling capability. The accepted graph/CDF/tick/legacy compatibility decisions above supersede earlier serial-stack or full-precision-display alternatives.
