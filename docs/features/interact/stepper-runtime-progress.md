# Stepper runtime progress

Owner instruction: 2026-11-14 13:45 PT. References stay byte-identical. Merge sort at Brief proves the parts and
generator first; TCP follows the dynamic native step domain; mitosis follows last. Grid and before/after remain
reference-only. Both prerequisite contract changes are merged through `74c042ec1`.

## Family module and data

`interact-family-stepper.js` owns the depth/composition declarations, typed roles, independent step coordinate,
strict family brief schema, expansion/extraction, preset-anchor checks and parameter metadata. All nine companion
data sets round-trip exactly and reference briefs retain the approved HTML's title, copy, instructions and heading.
There is no timeline, formula quantity or JSON encoded inside `scene.words`. Native item ids normalize to
`state0`, `state1`, and so on while semantic state ids remain in typed data.

`check` reports its structural/binding coverage explicitly. `referenceCheck` fails closed with `reference_unproved`
until the separately required independent state/readout invariants and six semantic negatives are implemented.
The family is not added to the built-in pick before shared admission is safe. Renderer modules are supplied by the
next ordered commit; no placeholder drawing is registered.

The codec interns strings, object shapes and repeated subtrees, including repeated regions between variants.
These lossless packet sizes are computed in `interact-stepper-data.test.mjs`:

| Subject | Brief bytes | Balanced bytes | Detailed bytes |
|---|---:|---:|---:|
| Merge sort | 3,134 | 4,437 | 5,220 |
| TCP | 3,212 | 5,284 | 5,972 |
| Mitosis | 4,087 | 6,538 | 7,909 |

The trusted decoder is 507 bytes. Detailed mitosis's full data declaration is 8,429 bytes; this is **data plus
decoder**, not a measurement of a finished mitosis program. Its drawing and complete 16 KiB source proof come last.
The fixture copy pool is host-side and is not included in a generated program.

## Shared hooks still needed

The registration migration derives the template/role/word tables and generator lookup, but it does not yet carry a
typed state table through the product:

1. **Family brief dispatch:** honor `family.briefSchema(depth)` in the shared `briefSchema(depth, family)` helper
   before its legacy flat formula fallback. `interact-families.js` must preserve this hook instead of replacing it.
   The family already exports `{ jsonSchema, parse, keys }`. Its `keys.composition` describes the nested typed data.
2. **Typed plan data:** admit `plan.scene.data` through the selected registered template's
   `templateData[name].sceneDataSchema`. Require it for that template, reject unknown keys with precise `scene.data`
   paths, and refuse unsolicited data for legacy templates. Current ScenePlan admission rejects exactly
   `scene.data`; the same registered Brief plan with that field omitted otherwise validates.
3. **Fill and check text:** when live fill is integrated, derive the composition key description and teaching rules
   from the family. `fillSystem` currently lists formula-only key classes and `formulaProblems` reads
   `{ role, point, got, expected }`; stepper checks return `{ code, path, message }`. Preserve those paths rather than
   reporting `formula undefined`. The approved composition guide/scorecard belong to this composing context.

No generator change is needed: `family.context({ scene }) -> { range, units }`, then `template.geometry(range)`,
already transports the admitted composition to the trusted assembler. The first proof uses a temporary registration
of the actual descriptor in tests; it does not bypass ScenePlan admission in the product or activate a broken pick.

Dynamic native domains and per-family object budgets remain Claude Code's accepted work. Variant changes keep the
current step and clamp it into a shorter domain atomically, as the approved HTML does. Reset chooses the first state
and default variant. No dummy states or fabricated clock are used.
