# C11 independent math review — PASS

**PASS at final reviewed source cd9b905110a91df4294c5eeff8608d336803f1cb. No open Important/Critical math, numeric-data or flow findings.** The one temporal-caption finding against initial source faa124cc4396a63c3a6c37f3621059286ba33ca4 is fixed in cd9b90511 and retained below. Canonical base is C10 e6d7542cee6a36498ea55db2e88467b1d3b72eb9.

Read the frozen C11 content specifications, both implementation data/reference modules, related math tests, old GPT2 data/API and exact old-reference compatibility diff, plus scratch c11-config.json and c11-implementation-report.md. Source/data review and numeric probes are independent of root's broad suites. No repository edit, branch change, test suite, provider call, install, build, deployment or agent. Only this scratch report is written.

## Initial finding, fixed

**Important — Standard music caption asserted all three intervals overlap.** Initial NEW caption said “all 3 intervals overlap”. Independent reconstruction yields C4[0,500),E4[250,750),G4[500,750): C4 and G4 meet at the release/start boundary and have no positive-duration overlap. The phrase has overlapping pairs, not a three-way active interval.

Root's cd9b90511 changes only that Standard wording to “the 3 intervals follow the ordered event groups”, refreshes its NEW token receipt/default snapshots, and fixes the separate metadata-test expectation to compare original representativeKinds/representativeGapTypes/representativeLessons. The data, note endpoints, wait order, all other depths and probe remain unchanged. The representative-source test change preserves strict individual-source equality; it does not loosen the values being compared.

I reviewed the exact minimal diff and prepared/rasterized the actual Standard outgoing view after the fix on both normal and fast preparation. Corrected text is present; all three line endpoint pairs and integerTicks:true remain unchanged. The raw Standard receipt is178 tokens/hash c2dd2deab1a8acaa77fd98a4203752698f4d20b36332069f10aba5dfbae04819. Its parsed public spec hash is eed899af67174bb8cc10fe13a04d39276bc8f06b051b95e8abc049876b31e094; these hashes serialize different property-order stages. All five music raw main/detail receipt hashes independently match their current objects. **Finding closed.**

## Independent calculation evidence

Literal Python dot/matrix multiplication, stable exponentials, CDF membership, append traces and event-clock reconstruction were computed before reading root's c11-independent-values.json. They were then compared to the actual modules, with a byte guard ensuring the three numeric/legacy data modules still equal frozen faa124cc. The caption descendant changes no numeric input.

The successful focused probe compared **489 numeric scalars /815 recursive values**, including the48 legacy embeddingAt cases. Result-object SHA-256 is 6c0801840b19b5e017d44fbf5eaef8ab5faf54cc6e7b12f0c2765a1e32fc39d1. Root's later-opened independent receipt agrees on all three heads and both cache computations; receipt byte SHA-256 is56fb1c0b67f957e4c6a4613279e2de40ebfbe5fcf6956244776f2d9d9e75b1bb. It was a cross-check after independent derivation, not the arithmetic oracle.

### Shared tied head and common-offset probe

The fixed output vocabulary is birds,fly,EOS. BOS is input-only. E=[[2,0],[0,2],[1.5,1.5]] is3×2, each separately supplied final h is2×1, and z=Eh is3×1, no bias.

| Exact supplied state prefix | h | Independently computed z | Full-precision p | Greedy |
|---|---|---|---|---|
|BOS|[1,0]|[2,0,1.5]|[.5740969929676946,.0776955791485706,.3482074278837349]|birds|
|BOS birds|[0,1]|[0,2,1.5]|[.0776955791485706,.5740969929676946,.3482074278837349]|fly|
|BOS birds fly|[1,1]|[2,2,3]|[.21194155761708544,.21194155761708544,.5761168847658291]|EOS|

All logits/probabilities/greedy identities agree. The selected public case is BOS birds, with rounded full distribution [.078,.574,.348], same vocabulary slot order and MAX fly. Adding the common offset1 gives[1,3,2.5], leaves every raw probability and maximum unchanged, and does not change E or h.

Actual Standard/Deep graph operands are native numeric fields: h values[0,1] in2×1; E values[2,0,0,2,1.5,1.5] in3×2; Standard z values[0,2,1.5] in3×1; Deep rows[0,1],[2,3],[1.5,2.5] in3×2 with columns z/z+1. Both actual outgoing graphs contain exactly h→z and E→z edges. There is no h→E edge or claim that E generates supplied h. The graph's vertical placement does not turn the inputs into serial operations.

### Raw sampling and rounded displayed partition

For the selected BOS birds distribution, raw CDF=[0,.0776955791485706,.6517925721162652,1]. Public boundaries=[0,.078,.652,1] are rounded for display. The caption explicitly says rounded bounds/raw decision.

The declared half-open ownership is correct: u=.04 and .06 both select birds, while greedy is fly. Independent boundary checks select slots[0,1,2,2] at u=[0,b1,b2,1−epsilon]. Draws−.01,1 and NaN are rejected. Exact b1/b2 belongs to the following interval; rounded boundaries are not used to select. No undeclared continuation on BOS birds birds is generated; an exact missing-prefix call is rejected.

Actual public CDFs retain all three intervals, left-closed/right-open ownership, marker.04→.06 and the identical [.078,.574,.348] probability detail. The probe changes only u; its invariant sampled/greedy identities are correctly labeled.

### Exact generation, stop order and source-memory scope

| Run | Emitted tokens | Final internal prefix | Stop | Visible text |
|---|---|---|---|---|
|Empty ordinary, limit3|birds,fly,EOS|BOS birds fly EOS|eos|birds fly|
|Empty limit2|birds,fly|BOS birds fly|limit|birds fly|
|Prompt birds, limit2|fly,EOS|BOS birds fly EOS|eos|birds fly|

Each after-prefix equals its exact before-prefix plus that call's selected token. Each next call uses the prior after-prefix. EOS is appended before stopping, has priority when coincident with the count limit, and causes no post-stop state lookup. An additional empty limit4 call still stops at the third emitted EOS; prompted limit2 stops at EOS on its second token. The prompt's birds is supplied, not generated in that run. BOS/EOS omission from visible text is an explicit serialization rule.

The actual Standard timeline has five temporal events: encode once,start,emit birds,emit fly,EOS stop; Overview compresses start/first emission into a four-event trace with the literal next BOS birds prefix. Standard/Deep next-call details use the exact appended arrays, including marker literals. Deep's stop-case matrix matches all three independent runs.

Source S0=[1,0],S1=[0,1],WK=I,WV=diag(2,1) gives source K=[[1,0],[0,1]],V=[[2,0],[0,1]]. The native memory2×4 tensor is[1,0,2,0,0,1,0,1], row S0/S1 and K0/K1/V0/V1 columns. Every call holds the exact same sourceMemory object pointer. The head function selects separately supplied h by exact prefix and has no numerical memory input. The captions explicitly state this temporal/interface scope. Thus source-before-generation order does not falsely claim a computed M→h dependency. Fixed source memory is separate from the growing layer-local cache.

### Layer A cache, scale, append and full-prefix reprojection

Supplied rows are P0=[1,0],P1=[0,1],P2=[1,1],P3=[−1,1]; WQ=WK=I,WV=diag(2,1), head width2. H=K in the public caption is valid for these declared maps. Each V=[2h0,h1].

| Current call | Raw qKᵀ/√2 | Raw normalized weights | Raw context aV |
|---|---|---|---|
|P2,q=[1,1]|[.7071067811865475,.7071067811865475,1.414213562373095]|[.2482550782577231,.2482550782577231,.5034898434845538]|[1.5034898434845538,.7517449217422769]|
|P3,q=[−1,1]|[−.7071067811865475,.7071067811865475,0,1.414213562373095]|[.06458483864659637,.26565361202674675,.13098547884644676,.5387760704802101]|[−.6864115059743341,.9354151613534036]|

At P2, public K/V rows are[1,0,2,0],[0,1,0,1],[1,1,2,1]. At P3 the same rows remain and[−1,1,−2,1] is appended. P2 becomes old without changing its id/data; P3 is current. No future row participates.

Independent calculation from full supplied H agrees with cache reuse+append at each same prefix/query. Both fullBase/fullDeep objects match the independent K/V,weights/context. Only stored earlier K/V is invariant across calls: current q,normalization set,weights and context legitimately change. The actual public grids name the selected layer, position origins, both K/V coordinates, maps and scaled softmax; details retain all3 or4 weights in the same order.

Shown weights [.248,.248,.503] and[.065,.266,.131,.539] sum.999 and1.001 because display is rounded. Raw rows normalize to1; contexts are computed with raw weights. No display-only adjustment or claim of equal across-time contexts is present.

### All music events, stable ids and simultaneous distinct-pitch probe

Full stable type/value vocabulary has exactly8 ids:

0 Velocity72;1 Start60;2 Wait250;3 Start64;4 Release60;5 Start67;6 Release64;7 Release67.

The10 performed event ids are[0,1,2,3,2,4,5,2,6,7]. Three identical Wait250 events retain id2 and advance time; they do not add notes.

| Clock ms | Base ids /performed order | Probe ids /performed order |
|---|---|---|
|0|[0,1] /Velocity72,Start60|same|
|250|[2,3] /Wait250,Start64|same|
|500|[2,4,5] /Wait250,Release60,Start67|[2,5,4] /Wait250,Start67,Release60|
|750|[2,6,7] /Wait250,Release64,Release67|same|

Independent interval reconstruction yields C4(pitch60),onset0/release500,duration500; E4(pitch64),250/750,duration500; G4(pitch67),500/750,duration250. All have velocity72, total clock750, no active notes remain. Pitch/onset ids60@0,64@250,67@500 are unchanged by the swap. Distinct-pitch release/start commute at the same clock with no wait moved; arbitrary event commutativity is not claimed.

Overview explicitly shows only C4/E4. Standard/Deep native plotted endpoints preserve all three notes; both four-row event matrices retain all10 performed events and their stable ids. Pitch axis is59..68 with integerTicks:true in both actual normal/fast payloads. Actual Standard native output is420×595 at408: readable native text/segments, a modest scrolling width rather than a forced408 gate. Root owns full39-view/schema acceptance; this review independently inspected the fixed music view and its exact coordinates.

## Legacy API and precise compatibility boundary

The old GPT2 data file is byte-identical to canonical C10 and retains SHA-256 58e03fe88f24dc5eff64136d4bfd9bd297ffe11f40a97b4c802c947dcf09bf89.

Before dynamically importing C11 modules in the ephemeral review probe, captured original exports/values and object references. After all new imports, repeated derivations and mutation of local returned NEW event/note copies:
- All17 old export names and16 nonfunction values agree with the pre-C11 root API baseline and the pre-import snapshot.
- All48 token×position embeddingAt cases independently equal original table row plus position row, with the old3-decimal behavior.
- Original events array, every nested event pair, vocabulary array, notes array and every note object retain identity and content.
- Old constructor/softmax/qkv/model-size/music results remain unchanged. The new music module clones events/pairs/vocabulary; it does not freeze or mutate old arrays.

The exact old-reference source diff removes smooth:false from only the three two-point Deep music series, as authorized. No old coordinates/operands/axes/data result changes. Root's compatibility proof reports old fast-schema invalid→new valid, identical dimensions, equivalent canonical semantic SVG and identical PNG pixels at320/408/680/720/960. I inspected that proof and the exact source diff; I did not rerun its five-width image comparison. Raw SVG bytes differ by equivalent two-point polyline versus M/L path, which is disclosed rather than called byte-identical.

The accepted old-prefix boundary remains dedicated-event highlighting present /inline token emphasis absent. No new false numeric prediction, inline styling or full stop trace is attributed to that unchanged reused timeline.

## Actual outgoing/native verification and review limits

On final cd9b90511, independently prepared **20 normal/fast requests** for the five NEW references at Standard/Deep. Their **20 distinct main/detail fields** match across modes. Checked actual native operand arrays, graph directions, per-position K/V/origins/weights, complete rounded CDF, exact stop cases, full music groups/points and corrected caption. All10 selected main views fit680 when requested680. Native requested408 widths are408 for head/selection/feedback,444 for cache and420 for music; no arbitrary exact408 gate is imposed.

Actual outgoing main hashes:
| NEW case | Standard | Deep |
|---|---|---|
|head|cef3374224252bd79f2dffa534f00284554e8108aad8b7a6e1b993fe620b9929|9ddbe6a24aa6397cd9452bfe19306f200dc35e1c7d6ec4ebfee1c360fd5738f9|
|cache|dfb7659bd88ef7c2aefe8d40a53ae88191e60cd7b98fbd4ffcfc25ddc6d4f9a8|dfe83c6fb8fa7b960c49bbca565c464b961745f3eb0ebd98e6aa33a66582f6cb|
|selection|7e4b615a5bbae01d13762b09c8deb938136bf6fc773537f5366d93af2b471cf1|d50329c5e733e45c8d536cf7698ebe4f8be4d398fa53f01e287c4ec5639ae9cf|
|feedback|bb919e59b168bf4e74c27d557c5b1c140321b076709e289be418c2fd2dc174f1|08bcddeb8ea73faa4e3e1127825ab260fda73f0917cafd9c18806fa73f90b236|
|music|eed899af67174bb8cc10fe13a04d39276bc8f06b051b95e8abc049876b31e094|c9ce94b58069d955b1b46cd625e1460405e279cccaf960eec46af78cdc35c573|

Direct native SVG raster inspection additionally checked Standard head408×844, confirming two independent input wires and correctly oriented numeric matrices, and the corrected Standard music420×595. These are exact renderer outputs, not new visual designs. Five new Overview null detail overrides were also checked; no stale Standard detail leaks into Overview. No broad replay, test suite, schema bundle run, snapshot generation or publication was repeated.

The parent retains ownership of final full prior replay, affected suites, complete source-integrity audit, all39-view QA, normal/fast schema gates and publication. This independent PASS establishes the reviewed math/data/flow scope and closes the corrected caption finding; it does not substitute for those gates.

