# Family contract fixes before the third family

Status: proposal, no code. Written 2026-11-14 from Codex's curve-sliders deliverables 1 to 6 (`design/family-curve`, merged into `design/fast-path` at `834146e80`) and his contract notes in `docs/features/interact/references/tutor-scene-examples.md` (sections "Remaining contract detail resolved in 3", "Protected fill blocker", "Contract lessons for the next family"). Line numbers are on `834146e80`.

## 1. Friction: what adding the curve family touched outside its own files

Files Codex had to edit that are not his own new modules (`git diff 4ea5f0557 834146e80`, interact paths):

| # | File and line | What he had to add | Why it is friction |
|---|---|---|---|
| 1 | `packages/web/src/interact-plan.js:218` | the three template names in the `scene.template` `z.enum([...])` | A closed enum in the plan schema lists every template of every family. |
| 2 | `packages/web/src/interact-templates/generate.js:3-17` | three imports, three entries in `TEMPLATES`, the family in `FAMILIES` | The generator holds a second list of families and a template table. |
| 3 | `packages/web/src/interact-formula.js:21-27` | `TEMPLATE_ROLES` rows for each template (lanes, roles, `independent`) | Roles live in a table keyed by template, away from the family that owns them. |
| 4 | `packages/web/src/interact-formula.js:49` | `...curveWords` merged into the words table (`TEMPLATE_WORDS`) | Same: words are shared data outside the family. |
| 5 | `packages/web/src/interact-formula.js:150-156` | `formulaScope` reads `TEMPLATE_ROLES[template].independent` so `x` is readable and `t` is not | The declared independent variable reached the generator context but not formula parsing; a first attempt failed until this was added. |
| 6 | `packages/control-plane/src/interact-families.js:10-23` | an import and a hand-written registry entry (`id`, `pickCriterion`, `module`) | A third list of families. The entry is boilerplate: it is the same four lines for every family. |
| 7 | `packages/control-plane/src/interact-design-pin.js:18-31,38` | three `PLAN_OF` rows, a `CURVE_DEPTHS` map, a `PIN_DEPTHS` entry, the `pinnedFixtureId` lookup | Pins are a fourth table. Codex already turned the selector into data (`PIN_DEPTHS`), but each family still adds rows to two maps. |
| 8 | `packages/web/src/interact-plan-fixtures.js:3-4,278-279` | imports and a `curvePlans` object returned by `interactFixtures()` | A fifth place: the shared fixtures file builds the family's pinned plans. |
| 9 | `packages/control-plane/src/interact-oracle.js:12,253` | an import and one more `?? curveLogisticOracle(plan)` in the oracle chain | The oracle is a long hand-written `??` chain. |
| 10 | `scripts/ci/check-map.json` | eight existing rows edited, fourteen rows added | Every new source file needs a row, and the `check-map` class test fails until it has one. Codex's notes record that "the final check-map test identified the curve source files as unclassified". |
| 11 | `packages/web/src/interact-formula.js` (grammar, `SCALAR_FUNCTIONS`) and `interact-plan.js` (`ScalarExpr`) | six functions in the parser, evaluator, interval bounds and the JSON schema | Needed by this family, and correctly shared; recorded because the fill text and the formula grammar must change with it (done through the family's `formulaGrammar`). |

Further friction recorded in Codex's notes (no code reference needed):

- **Template ownership is scattered.** Names are in the plan enum (1), roles and words in the formula tables (3, 4), templates and families in the generator (2), pick data in the control-plane registry (6). "A template descriptor should own those declarations together."
- **Numeric precision lives under `template.states`.** The curve family uses the states hook to carry numeric readout metadata.
- **Fixed inputs are positive-only** (section 3 below). The curve family worked around it by keeping hidden constants as family data (`fixedOf` in `interact-family-curve-sliders.js:49`) and writing their literals in provider formulas.
- **Invariants are prose, not data.** Output bounds, the derivative role, marker binding and parameter-effect directions need structured declarations that the pin, the reference programs and the checks reuse.
- **Oracle capture names differ**: a still scene uses `default`, a timed scene `start` and `end`.
- **Before a grid or a stepper:** declare the cell, index or state domain first; do not force a matrix or a list of states into independent scalar roles or a timeline.

The contract changes already made (`42a8d0c48`, `05aa537c4`, `0cb05eeee`) removed three earlier leaks (brief schema, generator context, fill text). The items above are what is left.

## 2. Proposal: one-place family registration

Goal: a family is one directory. Adding it needs no edit to a template table, the registry list, a pin table, the oracle chain, the plan enum, or `check-map.json` rows.

### Shape

A family module exports one descriptor, `family`, in `packages/web/src/interact-families/<id>/index.js`. It extends today's contract (`FAMILY`, `INPUTS`, `ROLES`, `LIMITS`, `scalars`, `referenceCheck`, `expandBrief`, `extractBrief`, `familyDescription`, `formulaGrammar`, `formulaRules(depth)`, `templates`, `context`, optional `independent`) with four more members:

```
templates: { '<name>': { generate, states, roles: { lanes, roles, independent? }, words: [[path, max, what], ...] } }
pickCriterion: '<string>'
pins: { '<depth>': { id: 'curve-logistic-brief', plan: () => expandBrief(brief, depth, ...) } }   // the plan builders the fixtures and the pin read
oracles: [ plan => verdict | null ]                                                               // consulted in order
tests: [ '<test file>', ... ]                                                                    // for the check-map class test
```

`templates` replaces the two shared tables (`TEMPLATE_ROLES`, `TEMPLATE_WORDS`) and the generator's `TEMPLATES`: each template entry carries its generator, its states hook, its roles and its words, so one descriptor owns them ("a template descriptor should own those declarations together").

### One index

One file, `packages/web/src/interact-families/index.js`, is the only place that lists families:

```
export const FAMILY_MODULES = Object.freeze([verticalThrow, curveSliders])
```

Everything else is derived from it:

| Today (hand-written) | Derived from `FAMILY_MODULES` |
|---|---|
| `TEMPLATES` and `FAMILIES` in `generate.js:15,17` | `Object.assign({}, ...modules.map(m => m.templates))` and the module list |
| `TEMPLATE_ROLES`, `TEMPLATE_WORDS` in `interact-formula.js:21-49` | built from each `templates[name].roles` / `.words` |
| `formulaScope` independent lookup (`interact-formula.js:155`) | unchanged, reads the derived `TEMPLATE_ROLES` |
| `INTERACT_FAMILIES` in `interact-families.js:23` | `modules.map(m => ({ id, pickCriterion, module }))`, the boilerplate in one `map` |
| `PLAN_OF` / `PIN_DEPTHS` in `interact-design-pin.js:18-31` | built from each `pins` |
| `curvePlans` in `interact-plan-fixtures.js:278` | `Object.fromEntries` over each `pins` |
| `interactOracle` `??` chain (`interact-oracle.js:253`) | the legacy oracles first, then `modules.flatMap(m => m.oracles)` |
| `scene.template` enum (`interact-plan.js:218`) | see risk 1 below |

### check-map

Put each family in its own directory (`packages/web/src/interact-families/<id>/**` for the module, data, briefs, programs, templates and check; `packages/control-plane/src/interact-families/<id>/**` for the oracle and design-time check) and add **two glob rows once**, each mapped to the families' contract tests (`interact-family-contract.test.js`, plus a convention glob for `interact-family-*.test.js`). The class test only requires a class for every tracked file, so a new family directory needs no new row. Each family's own tests are named in its `tests` member and verified by one new test that every listed file exists and is mapped.

### Migration steps

1. Add the index and the derived tables with **toss only**; switch `generate.js`, `interact-formula.js`, the registry, the pin and the fixtures to read them. Tests that prove nothing moved: `interact-family-contract.test.js` (schema, key lists, family description and fill text per depth against the stored snapshot), `interact-templates.test.js`, `interact-template.test.js`, `interact-design.test.js`, `interact-design-pick.test.js`, the toss round trip and frame-equality tests, `check-map.test.mjs`.
2. Move the curve family into `interact-families/curve-sliders/` and replace its hand registrations with the descriptor members. Proof: the curve tests (`interact-curve-pins.test.js`, `interact-curve-templates.test.js`, `interact-family-curve*.test.js`, `interact-family-curve-sliders.test.mjs`) pass unchanged except for import paths.
3. Delete the hand tables and the check-map rows for the moved files; add the two glob rows.

### Risks

1. **Import cycle through the plan enum.** `interact-plan.js` is imported by `interact-formula.js`, and the enum needs template names. Replace the closed enum with `z.string().regex(...)` plus a check in `planProblems` against the registry, or keep a small leaf file listing template names. The JSON schema for `scene.template` becomes a pattern, which changes the plan schema's serialised form; the toss plans stay valid and unchanged.
2. **Bundle size.** All families are always loaded (they already are today, through the registry). The Worker grew 114,548 bytes with the curve family and the fast path together; a new family adds its own templates and data only.
3. **Derived tables hide a mistake.** A family that omits a template's `roles` would now fail at import time, not at first use; add a startup test that every template has roles, words and a generator.
4. **Moving curve files changes `check-map` and import paths** in Codex's files; do it as the coordinator's change on `design/fast-path` before deliverable 3 so his lane does not rebase across it.

## 3. Proposal: fixed-input schema change

### Where the positive-only rule is today

- `packages/web/src/interact-plan-brief.js:45`: a fixed input is `z.object({ fixed: num.positive() }).strict()`. This is the only positive-only validator on inputs. It came from gravity: the Overview fixes gravity (`FAMILY.depths.brief.inputs = [['launchSpeed','range'],['gravity','fixed']]`, `interact-family-vertical-throw.js`).
- `interact-plan-brief.js:17,30`: the **JSON schema** sent to the model for a fixed input is `{ fixed: number }` with no bound, so the provider may return 0 or a negative number and the zod parse then refuses it.
- `interact-plan-brief.js:37-40`: a range input is already **signed** (`min`, `max`, `default` finite; `step` positive; `min < max`; default inside the range).
- `interact-plan-brief.js:44`: a family scalar is `num.min(0).max(s.max)` (non-negative, from `launchHeight`).
- Plan level (`interact-plan.js:196` number controls; `:223` `fixedValues: z.record(id, scalar)`): signed already.

So the plan accepts signed values; only the brief's fixed-input and scalar validators assume the toss. A curve midpoint `x0` of 0 or a negative one cannot be a fixed brief input, which is why the curve family keeps its constants as hidden family data and writes literals into the formulas (`interact-family-curve-sliders.js:49`, and the fill text tells the model to write `0` and `1` as literals).

### The minimal change

Let a family declare the sign of each fixed input and scalar, defaulting to today's rule:

- `INPUTS` entries stay `[id, kind]`; add an optional third element: `[id, 'fixed', { min: -Infinity }]` for any finite number, or `{ min: 0 }` for non-negative. **Omitted means positive-only, exactly as today**, so the toss declarations do not change.
- Scalars (`{ id, description, max }`) gain an optional `min` (default `0`, today's rule).
- In `briefSchema` replace `num.positive()` at `interact-plan-brief.js:45` with a validator built from the declared `min`; replace `num.min(0)` at `:44` the same way.
- The model-facing JSON schema is unchanged in shape for the toss (`{ type: 'number' }`, no bound). For a declared-signed input add a `description` sentence ("any number"); a toss input keeps its current description. The JSON schema property list for the toss is byte-identical (the `toss-family-snapshot.json` test).
- `keyLines` in `interact-design-fill.js:19` prints the input kind ("one number, fixed") today; for a declared-signed input print "one number, fixed, any number" instead, so the toss fill text is unchanged.

### Effect and proof

- **Toss plans and brief:** unchanged. The existing snapshot test (`packages/control-plane/test/fixtures/toss-family-snapshot.json`, `interact-family-contract.test.js`) proves the JSON schema, key lists and fill text per depth do not move.
- **Curve:** may expose `x0` and `xMarker` as fixed brief inputs at the Overview (midpoint at zero) instead of hiding them; this is a choice for deliverable 3, not a requirement, so the curve passes as it is.
- **Stepper:** needs fixed inputs that are not positive (a step index starting at 0). It depends on this change.
- **Tests to add:** a stub family with a fixed input declared signed accepts `-1` and `0`; the same input undeclared refuses them; the toss snapshot is unchanged.

Not covered: signed `step` for ranges (a step stays positive), and a range whose declared sign differs from its members.
