# Scene family contract — proposal

**Status: implementation target from the owner's 2026-11-14 12:05 PT instruction.** This document changes no runtime contract. `registerFamily`, a
composition schema, reusable renderer parts and `check(brief, depth)` below are proposed interfaces, not implemented
exports. Claude Code owns the shared schema, registry, generator, pin, oracle, test-selection and benchmark migration.
The current toss and curve modules remain the compatibility baseline.

**Implementation receipt, owner 13:45 PT:** `registerFamily` landed on fast-path at `6eb21f3f2`; per-input signs at
`5b56fa253`. The historical inventory below describes the proposal's starting point. Typed composition admission
and the first stepper slice are tracked in [runtime progress](stepper-runtime-progress.md); this document's proposed
family-owned schema, data and check boundaries must not be mistaken for already implemented shared dispatch.

The goal is one family declaration that tells every consumer what a scene can show, what the model may fill and what
trusted code must verify. A family consists of **parts, compositions and rules**. A new subject should usually fill an
approved composition with bounded data; it should not require another hand-drawn template or model-written program.

Read this with the [scene composition guide](scene-composition-guide.md), the
[ten-question composition scorecard](scene-composition-scorecard.md) and the
[curve contract lessons](references/tutor-scene-examples.md). The guide and scorecard describe what makes a useful
composition and how to review one. Their composition JSON companions are review sketches, not an accepted runtime
schema. This document proposes the engineering boundary needed to build them.

## What exists today

The current family contract is shared between
[`interact-families.js`](../../../packages/control-plane/src/interact-families.js),
[`interact-plan-brief.js`](../../../packages/web/src/interact-plan-brief.js) and the family modules. Its exports are:

| Export | Current responsibility |
|---|---|
| `id`, `FAMILY` | Family identity and depth-to-template, role and input declarations. Depth keys are `brief`, `balanced`, `detailed`; the product presents Overview, Standard, Deep. |
| `INPUTS`, `ROLES` | Labels, units, meanings, reference descriptions and role-specific conventions. |
| `LIMITS`, `scalars` | Additional brief limits and scalar fields. The shared scalar parser currently assumes a nonnegative value; fixed input objects currently require a positive value. |
| `familyDescription(depth)`, `formulaGrammar`, `formulaRules(depth)` | The family-owned description, admitted formula language and fill rules. |
| `expandBrief`, `extractBrief` | Deterministic conversion between the brief and a complete ScenePlan. |
| `referenceCheck(brief, depth)` | Family admission against reference semantics; currently returns `{ ok, failures }`. |
| `templates`, `context(...)` | Template names and geometry/range context for the trusted generator. |
| Optional `independent: { id, domain }` | A still scene's independent coordinate, in place of a timeline. Curve declares `x` over `[-6, 6]`. |
| Additional curve metadata | `bounds`, `effects`, `markerInput` and a law-independent `pickCriterion`. |

The vertical-throw module does not currently export its pick sentence; the control-plane registry supplies it. Curve
exports its own. Curve's generic invariant check is followed by its logistic reference check: its geometric pick
sentence does not establish admission for every mathematical curve.

Registration is still distributed. A family entry alone does not update the ScenePlan template enum,
`TEMPLATE_ROLES`, `TEMPLATE_WORDS`, generator template/family tables, fixture and pin tables, oracle dispatch or
`scripts/ci/check-map.json`. The curve work needed all of these. Numeric readout metadata also travels through the
misnamed template `states()` hook. The proposed declaration consolidates these responsibilities; it must not describe
the present code as already having done so.

## Family ownership and fidelity

The family owns its admissible data, rules, role meanings, domains, state semantics, words, bindings and independent
reference. Renderer parts own drawing and measured geometry. A composition owns a constrained arrangement of those
parts and its allowed connections. The trusted assembler owns program generation.

Keep two supported forms behind this contract:

- **Reference templates:** the approved high-fidelity toss and curve scenes retain their templates, words, controls,
  geometry and complete-frame references. Registration migration must preserve their output. They are not reduced to
  generic boxes to make the abstraction fit.
- **Canonical compositions:** a model selects an approved composition and fills its constrained data. The same
  renderer parts serve many subjects. These are a proposed additional path, with their own fixtures and references.

The first composition forms are an algorithm over a collection, a protocol between parties, a cycle of phases and a
pipeline such as retrieval-augmented generation. Their spatial meaning is fixed by the composition: collection order,
party lanes, phase order and pipeline stage order are distinct structures. A single unconstrained node-and-edge canvas
does not cover their semantics.

## One registration, derived consumers

Add one `registerFamily(descriptor)` declaration per family in a shared pure registry. Registration validates and
freezes the declaration; it does not start services or register through import side effects. A central list imports
each declaration once. There must be no second list a new family author has to discover.

The following is an illustrative target interface. Its field names are a proposal; the referenced exports stand for
concrete, reviewed family data and pure functions, not placeholders resolved by a model.

```js
export const stepperFamily = registerFamily({
  id: stepper.id,
  contractVersion: 1,
  pickCriterion: stepper.pickCriterion,
  sdk: { schemaVersion: 1, sdkVersion: 'sdk-8' },

  module: stepper, // expandBrief, extractBrief, descriptions, context, check
  inputs: stepper.INPUTS, // includes numeric domains and fixed/range policy
  roles: stepper.ROLES,
  limits: stepper.LIMITS,
  scalars: stepper.scalars,
  coordinate: stepper.coordinate, // resolves the discrete domain from this brief
  depths: stepper.FAMILY.depths,
  rules: stepper.rules,

  parts: stepper.parts, // binding schemas + trusted renderer exports
  compositions: stepper.compositions, // bounded data schemas + layout presets
  templates: stepper.templateDescriptors, // id, depth, roles, words, readouts, build
  briefSchema: stepper.briefSchema,
  check: stepper.check,

  fixtures: stepperFixtures, // id -> { depth, brief/plan, referenceProgram, cases }
  pins: stepperPins, // alias -> depth -> fixture id; direct ids derive from fixtures
  oracle: stepperOracle, // pure, independent expected values/states for the cases
  negativeBriefs: stepperWrongBriefs, // six isolated defects + expected code/path
  benchmark: { request: stepperBenchmarkRequest },
  verification: {
    sources: stepperSourcePaths,
    sharedParts: stepperPartIds,
    tests: stepperTestPaths,
    browserChecks: stepperBrowserCheckIds,
  },
});
```

A template descriptor contains the actual role map, exact flat word keys with lengths and meanings, numeric/text
readout definitions, bindings, and a trusted build export. The brief and plan schemas consume that descriptor rather
than copying its enum, roles or word list elsewhere. Existing template modules may be adapted without changing their
source output. A composition descriptor similarly names its allowed parts, data/state schema and layout preset.

| Consumer | Derived from the same declaration |
|---|---|
| Pick and fill | Family id, geometric pick sentence, depth availability, description, admitted fields, names, domains and rules. |
| Brief/ScenePlan validation and formula scope | Known template/composition ids, roles, words, bindings, numeric policy and independent coordinate. |
| Generator | Template implementations or approved composition assemblers, geometry context and explicit readout metadata. |
| Pins and fixtures | Fixture ids, aliases, depth maps and capture cases, including the existing toss/ledge/toss-mvp aliases. |
| Oracle and reference checks | Expected values/states, invariants, coordinate domains, role bindings and capture coverage. |
| CI selection | Source-to-test mappings, shared-part dependants and existing browser check ids with their runner metadata. |
| Benchmark | Family availability, request, schema, fixtures, oracle and depth coverage; the benchmark retains its operational switches and spend controls. |

**No per-family check-map edit.** Claude Code makes a one-time change so the check selector consumes a deterministic
projection of `verification` together with the existing non-family map. If a generated map is retained, CI must verify
that it matches the declarations; it is not hand-maintained family registration. A shared part change selects all
registered dependent families. A missing source classification, nonexistent test/check, duplicate id, missing depth
fixture or absent required oracle is an admission error. The receipt must distinguish registered, selected, executed,
passed and uncovered checks; a green workflow that selected none is insufficient.

Descriptors, family semantics, parts and pure oracles must import safely in both the browser and Worker. Node test
runners and CI tooling consume path strings through their own adapters. Runtime modules must not import `node:fs`,
test harnesses, deployment code, credentials or server environment access. Keep schema metadata in cycle-safe pure
modules: the present plan/formula import cycle is not permission to add registry access at module initialization that
reads an uninitialized binding.

## Coordinates and numeric domains

Every scene chooses one evaluation coordinate:

| Form | Required declaration and behavior |
|---|---|
| Timed | `t` plus the plan's timeline. End, markers and bounds are family rules; only this form exposes time/playback semantics. |
| Continuous still | `independent: { id, domain: [min, max] }`, with no timeline or `t`. Curve remains the current example. |
| Discrete still | A proposed integer-domain variant of `independent: { id, domain }`, with no timeline. The stepper's admitted values resolve to `0..states.length - 1` for the current data. |

The discrete variant is a schema extension, not something the current two-number domain already expresses. Its
descriptor must name the state collection and the integer-domain rule. Parsing, formula scope where applicable,
controls, geometry, interval/index checks, captures and the oracle all use the same resolved domain. A shorter state
table updates the selection and rail together; a stale out-of-range index fails admission or is reset according to
one declared input-change policy. It must not address a missing row or silently draw the previous scene. Elapsed
seconds must not be invented for an algorithm, handshake or biological phase.

Numeric inputs declare finite domain constraints in family data, including inclusive/exclusive ends, integer versus
real values and range/fixed policy. **Zero and negative fixed values are valid whenever that domain admits them.**
The same declaration drives provider JSON Schema, local parsing, expansion, formula substitution and reference checks.
This replaces the shared `fixed: positive()` and nonnegative-scalar assumptions. Positive gravity, mass and steepness
remain their families' rules; launch height, force direction, units and marker time do not become universal rules.
Changing that policy must not broaden an existing toss brief accidentally.

Keep the legacy toss wire schema, fill text and program bytes through a compatibility adapter during migration.
Today its provider fixed-number schema is less restrictive than its local positive-only parser. Do not silently
change that schema while claiming byte-identical compatibility: enforce the existing local rule for legacy toss,
and derive provider/local domains consistently for the new descriptor version. A stricter legacy wire format needs
an explicitly reviewed version change.

## Renderer parts and bindings

Reusable parts belong under `packages/web/src/interact-templates/`. They are renderer code built from the approved
palette and the existing frozen SDK-8 primitives. They are not new SDK helpers, new capabilities or a reason to change
the SDK fingerprint. Each part publishes its binding schema, named anchors/regions, measured bounds and applicable
layout constraints. The assembler supplies coordinates from an approved preset; the model does not.

| Part id | Required binding and ownership |
|---|---|
| `step-rail` | Current integer selection, ordered state ids/labels, the aha state id and the resolved domain. It shares the control's cursor. Its completed-trace/progress presentation derives from that selection and introduces no extra cursor or clock. |
| `fixed-picture` | An approved picture/picture variant plus stable semantic region ids. Per-state bindings name emphasis and admitted payload variants. Geometry and anchors belong to the renderer. |
| `readouts` | Declared quantities or typed state fields, with label/unit/format and source state. This includes bounded counters and their denominators. Values derive from those sources, not unrelated model-written display strings. |
| `active-callout` | A scalar existing region/entity/part anchor, bounded word keys and a state predicate. It explains the selected state at that anchor and does not duplicate the numeric readout row. |
| `ghost-previous` | The same picture/state schema and a declared predecessor relation. At the first state it draws no predecessor; otherwise it reads the preceding admitted state's bindings. |
| `status-line` | A bounded status id/text from the selected state, with its semantic data source and applicable predicate. TCP's line such as “Server has not yet heard Client” is explicit plan data bound here, rather than prose invented inside the picture renderer. |

These are the owner's six stepper renderer-part modules. Counters live in `readouts`; completed trace/progress is a
`step-rail` presentation. The approved reference sketches use earlier descriptive kind names; runtime normalization
must map them explicitly rather than create a second parts registry. `status-line` is an explicit binding addition,
with the approved TCP appearance preserved.

An unknown part, word key, role, region, state id, variant, source path or incompatible binding type fails with its
precise brief path. No unbound decoration is accepted: every explanatory highlight, arrow, ghost, number and callout
must point to declared state/data and a teaching purpose. Structural picture artwork may be fixed renderer data, but
its semantic regions are declared rather than guessed from pixels. Approved colors, typography, layering, annotation
clearance and clipping stay renderer responsibilities.

## Model-writable composition data

The model may choose a known canonical form and layout preset, fill bounded subject data and words, declare the
state/transition story and connect approved part bindings. It may not write JavaScript, functions, coordinate pairs,
arbitrary CSS, arbitrary graph layouts, executable expressions outside the existing formula grammar, or an untyped
object bag. Trusted code validates, resolves bindings and assembles the program with zero model calls.

The exact JSON envelope is a shared-schema decision. Before runtime admission, each composition must supply:

- A closed schema with known keys and explicit hard maxima for parts, states, transitions, collection items,
  parties/phases/stages, words and string lengths. Limits are concrete per depth; provider schema and local parser
  enforce the same limits. The family-owned fill schema admits the composition id together with its typed payload,
  using the provider's supported strict schema forms. Do not insert another orchestration stage or accept arbitrary
  nested payloads through the present flat-brief parser. If a provider requires a preselected schema, Claude Code
  must resolve that within the shared fill contract and report the constraint. A valid but visually overfull state
  still fails the measured layout check.
- A typed state-table variant: collection states identify admitted items/indices and active ranges; protocol states
  identify parties, messages and party state; cycle states identify phases and bounded phase-specific variants;
  pipeline states identify stages, admitted records and stage status. They do not masquerade as unrelated scalar
  formula roles. IDs are stable and unique, and every cross-reference is resolved.
- A bounded initial state, ordered/reachable states, legal transitions, terminal/loop policy, predecessor relation and
  one explicit observation at the state that demonstrates the intended idea. The state table is checkable data,
  not a prose claim that the transition happened.
- Exact word slots and typed readout sources, units and precision. Words belong to the brief/plan, not renderer
  literals; reused labels have one source. Existing line/combined-heading length and legibility constraints apply.
- An admitted part set, complete binding graph and fixed layout preset for each depth. A depth adds explanatory
  content through reviewed variants, not freeform spatial edits or a silently different scientific rule.

For example, changing collection length must recompute the valid index/step domain, readouts, progress, active regions
and ghost source together. A protocol state cannot send a message from an undeclared party; a cycle cannot highlight
an unrelated phase; a pipeline cannot display a retrieved record with no declared record/stage provenance. These are
family/composition rules, not facts inferred from captions by a model judge.

## Deterministic checking and deliberate failures

Each registered family exposes `check(brief, depth)`. The common admission runner resolves the family from its
descriptor and runs schema/domain, binding, transition/invariant and independent-reference checks in a stable order.
Family-specific rules remain permitted, but the runner and result format do not branch on subject titles or ids.
No network, random sampling, model call or renderer repair is part of this check.

Proposed result shape:

```js
{
  ok: false,
  checked: { schema: 1, domains: 3, bindings: 6, transitions: 5, reference: 6 },
  failures: [{
    code: 'state_transition',
    path: 'states.2',
    message: 'The declared update does not produce this state.',
    rule: 'declared-update',
    caseId: 'next-from-1',
    point: { step: 2 },
    got: { /* bounded diagnostic data */ },
    expected: { /* independently derived bounded data */ },
  }],
}
```

Paths refer to the offending provider-brief field, even when the checker works on an expanded plan. Expansion must
retain the mapping needed to identify that field. Failure codes, ordering, tolerances, case order and diagnostic
limits are explicit. Unsupported or unproved semantics fail with a structured reason; absence of an applicable oracle
cannot count as a pass. `checked` reports what actually ran, and later checks blocked by an earlier failure are not
counted. A wrong but well-formed brief must fail the relevant semantic path, not an unrelated catch-all exception.

Success is `{ ok: true, failures: [], checked }`; `ok` is true exactly when the failure list is empty and all
applicable checks completed. A bounded human-readable `message` accompanies every machine-readable code/path.
The fill can present a stable line such as `states.2: The declared update does not produce this state.` without
inventing a physics role for the error. Malformed inputs produce structured schema failures rather than throwing
through the pipeline.

Keep independent references independent. An oracle must not obtain its expected state by calling the generator's
same transition function or by reading the model's asserted result. Curve's numerical derivative, declared bounds,
marker binding and parameter effects are reusable checks; the logistic closed form remains additional family
admission. An interval enclosure that cannot prove a bound is reported as unproved, not correct.

Every family registers six deliberate bad briefs, each derived from a good brief with one isolated semantic error.
They stay schema-valid when testing semantics, and each fixture declares the expected first code and brief path.
For the current curve baseline these are slope sign, slope scale, output bounds, steepness direction, midpoint
direction and marker-readout offset. Keep those exact defects and path assertions in migration.

For a stepper composition, the six required failure classes are an incorrect state update, wrong active region,
wrong readout source/value, callout attached to the wrong known region, ghost bound to the wrong known state and
counter/progress inconsistent with the selected state. Use valid ids and types to isolate those semantic failures;
unknown-binding and out-of-domain tests separately exercise admission. Each composition form also needs its legal
transition/domain fixtures; six negative cases are a minimum admission demonstration, not total test coverage.

## Acceptance and migration boundary

Implementation acceptance requires the following evidence. This proposal does not claim those checks have run:

| Acceptance | Required evidence |
|---|---|
| Toss and curve unchanged | All existing schema, fill-text, round-trip, frame-equality, template-gate and oracle tests pass unchanged. All four toss plans and three curve depths retain their controls, words, numeric results and complete reference frames; existing pins still apply. |
| Round trip | `extractBrief(expandBrief(brief, depth))` preserves all admitted brief data. Expanding the extracted brief reproduces the complete captured frames, quantities, readouts and words, not only a screenshot subset. |
| Reference equality | Trusted template/composition output matches independently authored reference programs at all registered default, checkpoint and boundary cases, including the discrete last state and first-state ghost behavior. |
| Zero-model build | Registered pinned briefs reach the real template/composition build, validate the runtime tuple, bindings/hash, source and manifest, then pass layout, effect and independent-oracle checks with zero model calls and no outbound fetch. |
| Complete coverage receipt | Capture names and budgets come from the descriptor. Trace-only probes and unavailable images are identified accurately; omitted images are not claimed as checked. |
| Window fit | Actual complete cards fit at 1440 × 900, Chat open, 100% zoom, at Overview/Standard/Deep and the longest admitted words/states. Headless description estimates do not establish this. |
| Registration completeness | A new family needs one declaration; schema, generator, pick, pins, fixtures, oracles and affected-test selection derive from it. A shared-part edit selects its dependent families. |
| Failure quality | The six bad briefs fail first at their declared codes/paths, and unknown bindings/domain errors fail before generation. |
| Fill benchmark | From the reviewed prompt alone, n=10 per depth with Flash Lite and the family switch: report first try, after one correction, fallback, first failing line, latency and technically clean counts separately. Preserve toss/curve results and report against the family's approved target. A source or mocked-provider test is not a bench pass. |

Claude Code migrates consumers once, retaining adapters for the current family exports while introducing the proposed
descriptor. The first slice should register existing toss and curve data without changing output; only then add
canonical composition support and the discrete state schema. Do not ship a composition JSON sketch as a ScenePlan
because it looks similar.

Persisted plans and sealed programs are compatibility constraints. Preserve existing schema-1 template ids, slot/word
keys, mode/timeline meaning, fixture aliases, hash inputs and SDK tuple/fingerprint. New composition/state-table
fields need an explicit schema/version policy and load/validate/share coverage. Do not rewrite saved plans on read or
accept unknown ids through a permissive fallback. Where an old field is adapted, establish that rebuilding preserves
its frame and that already sealed programs still load. A metadata reorganization alone must not invalidate them.

Claude Code owns benchmark family/request/oracle selection, clone operation and the exact operational switches. The
existing curve handoff specifies:

```sh
node scripts/interact/bench-design-mvp.mjs --family curve-sliders --model gemini-3.5-flash-lite --depth all --n 10 --concurrency 2 --cap-usd 2
```

That command records the required run shape, not authorization or a claim that it was run. A stepper benchmark needs
its reviewed request, depth fixtures, oracle and family switch first. The documentation/reference work makes no paid
call, deployment, live fit measurement or shadow-judge claim.

Before implementation, settle the composition JSON envelope and versioning, concrete per-depth data/word limits,
approved picture regions/variants, and the existing native control route for discrete selection. Those decisions
belong in the shared schema and approved compositions. They must not reintroduce another family registry or a new
SDK-8 helper.
