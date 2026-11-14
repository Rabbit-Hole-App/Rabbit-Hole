# Stepper contract preflight

Checked after the owner's 2026-11-14 12:05 PT approval. This is preparation for the ordered implementation, not a
stepper runtime implementation or an additional release gate. The reference pictures and composition payloads remain
unchanged. Read with [the implementation sequence](stepper-implementation.md).

## The shared registration fix is still pending

The checked fast-path tip is `5b56fa253c8ee94de5ac3261c4e1db24f6a18a2d`. It supplies the per-input sign fix:
`[id, kind, { sign: 'positive' | 'nonnegative' | 'any' }]`, retaining the old defaults for existing families. It has
been merged into this lane. The family registry still declares a hand-written array in
`packages/control-plane/src/interact-families.js`; one-place `registerFamily` is not present. The owner explicitly
requires both fixes to land and be merged before runtime family work. No replacement schema or registration tables
have been added here.

Two further shared representation seams need to be included or resolved by the contract work. The registration/sign
changes alone cannot establish either of the following properties.

## The approved TCP control has a variant-dependent domain

The Standard TCP reference has five states without loss and six with loss; Deep has six/eight. The HTML derives
slider maximum, boundary buttons and counter from the selected `variant.states.length` and clamps selection when
switching to a shorter variant.

The current native program path does not do this:

- `packages/web/src/explain-program/ProgramScene.jsx:353` reads `manifest.inputs`; line 405 passes only each static
  declaration to `programInputWidget(input)`.
- `packages/web/src/explain-program/program-card.js:207` builds widget items exclusively from `input.items`.
- `packages/web/src/SceneControls.jsx:98` derives the slider range, disabled boundaries and counter from that array.
- `packages/web/src/explain-program/contract.js:97` admits a strict static `items` array; event validation and
  `resolveInputs` also use its length.

The preflight probe confirms that passing a different selected option to the existing widget helper still produces
the same five items. A guest clamp cannot change the host slider. Padding the shorter variant would introduce dead
positions and contradict the approved counter/rail. The shared control contract needs an explicit current-variant
domain route with atomic selection clamping; this lane has not changed the host or input contract.

## Faithful primitive lowering exceeds the frame budget

The counts below are computed by executing the checked-in HTML model/view scripts over every admitted state and
option. A mark is a painted SVG primitive, not a group. The estimate combines a straight polyline plus arrowhead into
one native `sdk.arrow`; bent arrows still need a path and arrow. It is a concrete estimate for faithful primitive
lowering, not a proof against every possible admitted semantic encoding.

| Composition | Depth | Cases | SVG marks, max | Primitive Frame estimate, max | Picture alone, Frame estimate | Naive compact variant bytes |
|---|---|---:|---:|---:|---:|---:|
| Merge sort | Brief | 4 | 64 | 64 | 53 | 2,170 |
| Merge sort | Balanced | 12 | 77 | 77 | 55 | 6,770 |
| Merge sort | Detailed | 16 | 100 | 100 | 55 | 8,472 |
| TCP | Brief | 3 | 29 | 26 | 17 | 2,479 |
| TCP | Balanced | 11 | 48 | 45 | 22 | 9,400 |
| TCP | Detailed | 14 | 71 | 69 | 22 | 12,016 |
| Mitosis | Brief | 4 | 70 | 67 | 56 | 4,978 |
| Mitosis | Balanced | 12 | 112 | 107 | 83 | 18,102 |
| Mitosis | Detailed | 16 | 165 | 158 | 109 | 24,833 |

`CONTRACT_LIMITS.objects` and `Frame.objects.max(...)` enforce **60 objects per frame** in
`packages/web/src/explain-program/contract.js:27,317`. The separate `objectsTotal: 240` does not change that cap. Deep
mitosis's picture alone has 116 SVG marks, estimated as 109 Frame objects after native-arrow consolidation, before
the rail, callout, readouts or completed trace. The parser probe rejects 61 otherwise valid objects on `objects`.

Polyline points are not the present constraint: the largest checked frame has 230 points and the longest path has
15, under the existing 10,000/2,000 limits. Source is a separate compiler risk: copying full Balanced/Deep mitosis
variants already exceeds the 16 KiB source cap before drawing code. Interning common regions/words and projecting
data can reduce this; naive payload size must not be misreported as a lower bound on optimized source.

## Existing helpers do not provide a faithful packing shortcut

- SDK-8 is the props/figures branch in `sdk.js:55–74`; it does not include the raster, cyclic or Medium extensions.
  No helper from another branch has been substituted.
- `sdk.callout` in `sdk-figures.js:74–79` silently keeps only four lines. The approved wrapped callouts reach nine
  including title and reason. Multiple/manual boxes can retain the words, but consume frame objects and need a
  deliberate style mapping.
- Frame objects are strict. The probes reject arbitrary `dashed`, `size` and `fill` fields. There is no generic
  dashed/unfilled ghost primitive under this tuple. Semantic role/opacity fields are available; they do not grant
  arbitrary SVG styling.
- `frame-look.js:55–60` treats every circle of diameter at least `BODY_MIN` as a body regardless of role. Mitosis
  cell/nucleus circles would inherit body identity treatment. The probe confirms this for a neutral cell outline.
- `sdk.diagram` counts as one object, but its spec must pass `parseTutorDiagram`. The existing fixed `figure: 'cell'`
  does not admit chromosome/spindle/phase payloads; the text-only `cycle` allows at most seven steps
  (`tutor-diagrams/spec.js:79–83`). There is no existing raw-geometry or approved phase-glyph escape hatch. Merely
  wrapping the picture in `sdk.diagram` cannot admit it.

Before the parts commit can promise reference fidelity, the shared contract needs an agreed legal representation
for these whitelisted bound parts. A registry-admitted semantic-part route through an existing figure would itself
need schema/renderer support that is absent today. This lane has not implemented that route, increased budgets,
added an SDK helper, or removed approved glyphs. The required representation decision belongs with the shared
contract owner; it must preserve the frozen tuple's compatibility requirements explicitly.

## Family-owned normalization and reference strategy

The six requested modules are recorded in [family-contract.md](family-contract.md): rail, picture, callout, readouts,
previous-state ghost and status line. TCP status copy currently originates inside `drawPicture`; expansion must make
it explicit selected-state data for `status-line`. The counter/trace uses the rail or readouts, not another cursor.
Some reference ids, such as `per-nucleus`, need explicit normalization for stricter manifest readout names. These
are family-owned normalization tasks, not reasons to change the scientific content or create another registry.

For equality, independently lower the checked-in HTML geometry and data into the agreed legal Frame representation,
then compare it with the separately generated program at every case. Do not obtain expected frames by invoking the
production parts. The accepted representation must be settled first; the current primitive route fails the budget.
Existing TutorDiagram layout modules also import React/primitives and reach KaTeX; they return React elements rather
than guest Frame JSON, so they are not an audited pure Worker-geometry import.

## Reproduction

```sh
node docs/features/interact/references/stepper-sdk-audit.mjs
node --test docs/features/interact/references/stepper-*.test.mjs
```

[The saved receipt](references/stepper-sdk-audit.json) contains all nine measured rows over 92 state/variant cases,
the active SDK limits and the expected-refusal probes. The script reads references and existing SDK/contract code;
it emits no production plan or program and makes no provider/browser/deployment call. This does not claim measured
window fit, browser interaction, a live fill, or completed runtime acceptance.
