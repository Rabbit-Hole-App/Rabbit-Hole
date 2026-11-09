# Rabbit Hole Tutor diagram components

Tasks: `8de91403-f6ec-4d2d-bf13-64a4e108ec3f` and `dbcebf0b-7299-4268-8011-7ad03a40772a`

This is a static SVG renderer for the written Explanation card. It takes a versioned semantic spec, lays it out deterministically, and uses React to render SVG elements. The author supplies labels, roles, and relationships. The renderer supplies geometry, connectors, type, and fills.

## Entry points

- `TutorDiagram.js` exports the default React component. Use `<TutorDiagram spec={value} fallback={existingContent} />`. The spec can be an object or a JSON string. Invalid specs use the caller's fallback. The component measures its container and keeps the text at native size when a dense diagram needs horizontal scrolling.
- `renderTutorDiagram(value, width)` in the same module returns `{ element, width, height }` for deterministic static rendering and geometry tests. It throws on invalid input.
- `spec.js` exports `parseTutorDiagram(value)` for backend validation and `tutorDiagramJsonSchema` for a structured-output request. The runtime parser is authoritative for topology, references, distinct branch labels, and matrix row lengths. `describeTutorDiagram(parsedSpec)` produces the readable diagram text for context, copying, and accessibility.
- `examples.json` retains the original saved-spec fixtures. `reference-library.js` is the current author/reference registry: 176 examples across 24 kinds and all 21 Phase 02 lessons. Its `ml-*-references.js` sources contain complete JSON plus natural prompts and selection keywords.
- `packages/control-plane/src/explanation-references.js` selects at most two relevant examples and supplies them to the **actual** `prepareArtifactAuthorRequest` system context in `learn-artifact.js`. Repairs reuse that context. Required kinds filter examples; they never justify an unrelated example. When the required kind matches a comparison/visual-transformation leaf, selection can excerpt that leaf as a standalone valid spec, with a deterministic part ID and its source reference ID. Ordinary conceptual requests retain the full composition. Required-kind validation remains strict. Unknown topics can receive no example and still use the schema.
- [Phase 02 handoff](../../../../docs/features/explain-on-canvas/handoff/phase02-library/README.md) records the implementation, acceptance limits and exact sources. [Generated gallery](../../../../docs/features/explain-on-canvas/handoff/phase02-library/references/index.html) renders the same reference objects.

## Components and formats

Every spec has the shape `{ "version": 1, "diagram": { "kind": "...", "title": "...", ... } }`. A diagram can also have a caption.

| Kind | Authored input | Rendered components |
|---|---|---|
| `flow` | Nodes with `id`, `label`, `role`; directed edges with `from`, `to`, optional `label` | Process boxes, decision diamonds, outcome pills, elbow arrows, branch labels, skip lanes |
| `comparison` | Columns with `heading` and `items` | Colored headers, outlined cells, dashed column dividers |
| `timeline` | Events with `time`, `label`, optional `detail` | Time pills, event cards, connected markers |
| `sequence` | Actors with `id` and `label`, messages with `from`, `to`, and `label`. Self-messages may appear anywhere. At least one message must go between different actors, and ordinary messages separate self-messages. | Actor boxes, lifelines, directed arrows, labelled loops for self-messages |
| `matrix` | Column labels; rows with `heading` and `cells` | Column headers, row headers, data cells |
| `layers` | Ordered layers with `label`, optional `detail` | Stacked color blocks with wrapped labels and details |
| `cycle` | Ordered step labels | Step boxes, arrows, outer return connector |
| `figure` | Figure preset and named callouts. Free-body figures take direction, magnitude, and unit | Cell, cross-section, or free-body drawing; linked callout badges; proportional force arrows |
| `tree` | Nodes with `id`, `label`, and optional `parent`. With `layout: "binary"`, each child also supplies `side: "left"` or `"right"`. | Indented hierarchy or a top-down binary tree with the approved branch styling |
| `relationship` | Labeled nodes and directed links with relationship labels | Directional lanes with clear endpoints, including reciprocal links |
| `transformation` | Before and after item lists, operation, optional zero-based item mappings | Two states, operation banner, and labeled mappings |
| `argument` | Claim, support, objections, conclusion. Evidence can include a source label | Evidence lanes joined to a conclusion |
| `number-line` | Explicit domain, value markers, intervals with open or closed endpoints | Scaled ticks, numbered markers, interval segments |
| `coordinate-plot` | Two labeled axis domains, optional units, line or scatter series. Set `smooth: false` on a line series for straight segments. | Linear axes, monotone cubic line paths, exact point values, distinct series symbols |
| `bar-chart` | Labeled signed values and optional unit | Horizontal bars with a shared zero baseline |
| `t-account` | Account label, optional unit, debit and credit entries | Debit and credit columns, totals, balance side |
| `waterfall` | Opening value, signed changes, optional unit | Floating change bars, running totals, computed closing balance |


Flow represents one connected acyclic graph. Decision nodes need two or three distinctly labeled branches. Relationship supports cycles with labeled directions, and cycle shows a simple repeating process. Use the Zod schema and example fixtures for exact bounds and fields.

Figure callouts refer to anchors defined by the local schematic. See the three figure fixtures for anchor names and the free-body vector inputs. Chart coordinates are numeric data in the declared domains. The renderer maps that data to the visual scale. Both accounting kinds use integer minor units and accept amounts with up to two decimal places.

Any label, title, caption, heading or item may hold maths in the card prose's delimiters (`$...$`, `\(...\)`, `$$...$$`, `\[...\]`). The renderer typesets each formula with KaTeX in a `foreignObject` (`math.js`), measures it whole from its TeX so its box holds it, never splits it across lines, and sets a formula taller than a line (a fraction, a sum with limits) smaller so it fits that line. TeX that KaTeX refuses stays as its source text. A formula counts against a text limit by what it shows: delimiters, braces and spaces are free and a command such as `\frac` counts one; its source may be up to twice the limit.

## Phase 02 extensions (2026-11-08)

This batch added four kinds to the original 17. Nine original kinds have additive variants. Old version-1 JSON without the new fields keeps its existing rendering.

| Kind | New supported fields / variant | Primary source |
| --- | --- | --- |
| `heatmap` | Numeric `rows[].cells`, columns, explicit `range`, masked nulls and indexed highlights | `ml-statistical-*` |
| `sample-set` | Stable sample IDs, classes/weights; group memberships, explicit replacement, omissions and exact out-of-bag complements | `ml-statistical-*` |
| `histogram` | `binEdges`, count/proportion series, markers; unequal-width bins require `density` | `ml-statistical-*` |
| `box-plot` | Quartiles, median, observed whiskers, fences and labelled outliers on an explicit axis | `ml-statistical-*` |
| `tree` | `layout: binary/hierarchy/dendrogram`, child `edgeLabel`, count/detail/pruned; `highlightPath`, merge heights and cutoff | `ml-topology-*` |
| `relationship` | `layout: graph`, each node drawn once, separate directed/reciprocal routes and labelled ledger | `ml-topology-*` |
| `flow` | `fork` and `merge` for simultaneous branches. Arrivals from three or more edges use distinct top ports and staggered approaches. | `ml-topology-*` |
| `coordinate-plot` | Linear/log axes, up to five series, step/stem series, low/high uncertainty, bounded annotations in data coordinates. Use `endLabel: true` for an open line ending at the x-axis maximum. A line with `closed: true` uses periodic cubic interpolation by default and joins its last vertex to its first. Provide at least three distinct vertices in order. | `ml-plot-*` |
| `bar-chart` | `variant: grouped/stacked`, categories, series; signed stacks calculated separately around zero | `ml-plot-*` |
| `timeline` | `layout: scaled-lanes`, numeric domain/unit, lanes with intervals/events and cutoffs | `ml-data-*` |
| `matrix` | `layout: teaching`, stable row IDs, emphasis and missing/changed cell states | `ml-data-*` |
| `comparison` | `variant: panels`, two or three real leaf diagrams; declared shared axes must match | `ml-composition-*` |
| `transformation` | `variant: visual`, before/after leaf diagrams, operation and preserved/mapped sample identity | `ml-composition-*` |

`spec.js` combines strict schemas, base checks and each domain's numeric/topology validation. Nested children are validated with the same rules. Compositions cannot contain other compositions. The whole JSON stays within the existing 16,384-character cap whether supplied as an object or string. Runtime validation remains stronger than JSON Schema: a provider accepting the schema does not prove mathematical correctness.

Plots accept point, segment, vector, reference-line, rectangle, polygon, circle, ellipse and band annotations. Coordinates are **data values** inside declared domains, never authored pixels. Circles/ellipses are axis-aligned data geometry; nonlinear axes can change their apparent shape. Large teaching diagrams retain native text and scroll using the existing component, rather than shrinking labels. A three-panel comparison stacks at narrow widths and can be tall.

A highlighted tree path is root-to-descendant, not an arbitrary traversal order. Inorder traversal uses visit annotations on the actual structure. A family descendant hierarchy has one root and one parent per child; a multiple-parent pedigree needs a relationship graph.

## Static illustration kinds

| Kind | Schema and layout modules | Supported structure |
| --- | --- | --- |
| `tensor` | `tensor-spec.js`, `tensor-layout.js` | Up to eight visible cells, optional numbers, name and dimension label. The payload also works in flow, relationship, transformation and block stacks. |
| `token-links` | `token-links-spec.js`, `token-links-layout.js` | Weighted links between token rows. Comparison panels use compact token boxes with a 56 px minimum. Two six-token panels fit from 912 px. |
| `block-stack` | `block-stack-spec.js`, `block-stack-layout.js` | Inset flows, tensors or layers, residual arrows, repeat groups, add and multiply joins, side inputs, callouts and detail indices. A comparison can use two of these stacks and highlight changed blocks. |

The registry includes their reference prompts and keywords. `explanation-references.js` adds the matching fields to the fast-author bundle. The natural-width renderer uses the existing scroll viewport. [Previews, JSON and test receipts](../../../../docs/features/explain-on-canvas/handoff/phase02-library/illustration-primitives.md)

## Approved visual treatment

`teaching-theme.js` owns the exact tokens from the approved `tree-splits-and-impurity.svg` at commit `012d4ae3dfd9b20ef14156bea89c2632b844cc46`:

| Role | Value |
| --- | --- |
| Surface / inset | `#fffefa` / `#f6f8f4` |
| Ink / muted | `#202723` / `#5d675f` |
| Primary blue / soft blue | `#426db2` / `#eaf1fb` |
| Secondary warm accent / soft warm | `#b86232` / `#f8ece3` |
| Semantic green / soft green | `#267657` / `#e7f3ed` |
| Border / connector | `#e3e7e0` / `#b9c3b9` |

New teaching layouts scope these tokens inside their SVG. Legacy layouts retain their earlier `primitives.js` palette and theme variables so saved content is not silently restyled. The card shell is unchanged. The model supplies labels, relationships and data; geometry, font sizes, line styles, palette and fills belong to the renderer.

## Adding another kind or reference

1. Add the strict shape and domain checks to the relevant `ml-*-spec.js` module; add its layout to that domain's `ml-*-layouts.js`. A new domain also needs registration in `spec.js` and `layouts.js`.
2. Implement readable description and visible text for every new rendered field. Keep legacy behavior when an extension is absent.
3. Add complete, mathematically checked `ml-*-references.js` examples with stable ID, lesson IDs, natural prompts, keywords and `useWhen`. The registry is the single source for author context and exported visual references. Do not put author-only examples in `examples.json` and assume they are loaded.
4. For a new kind, add explicit-request recognition in `explanation-visuals.js` where applicable. Update concise guidance in `explanation-references.js`, not a separate unofficial schema.
5. Run focused numeric/layout, saved-JSON, request-selection and repair tests. Export references with `node packages/web/scripts/export-explanation-references.mjs`, then inspect affected actual renders. Keep real-provider selection and dev acceptance separate from fixture success.

## Claude integration handoff

Read [the current handoff](../../../../docs/features/explain-on-canvas/handoff/phase02-library/README.md). The schema → server validation → saved `rh-diagram` fence → `Md.jsx` → `TutorDiagram.js` path is already wired in this branch, including relevant author examples. This is an implementation, not a proposal to hook up later.

Integrate it with the active release rather than replacing active `learn-artifact.js` / `learn-primitives.js` / `explanation-visuals.js` wholesale. Preserve Claude's binary selection rules and the separate three-visual release. This branch keeps its base's visual count and budgets unchanged. New kinds require a coordinated reader/writer deployment: an older reader falls back to JSON for unknown kinds.

## Focused local checks

From the repository root with existing web dependencies installed:

```sh
node --test packages/web/src/tutor-diagrams/*.test.mjs packages/control-plane/test/explanation-references.test.js packages/control-plane/test/explanation-diagram-kinds.test.js packages/control-plane/test/explanation-visuals.test.js packages/control-plane/test/explanation-validation.test.js packages/control-plane/test/learn-artifact.test.js
npm run build --workspace=packages/web
node packages/web/scripts/export-explanation-references.mjs
```

The fixtures exercise deterministic rendering and narrow widths without calling a model. Backend tests use the actual request/validation path with a scripted provider. Browser fit, live provider schema acceptance and generated-card save/reopen still require dev evidence. The existing math test needs `linkedom` available in the test environment; it is not a production dependency of this change.

`kind-gallery.json` is one neutral example per kind (token budget in `kind-gallery.token-budget.json`); `kind-gallery-depths.json` has an Overview, Standard and Deep version of each, and the planner path attaches the one for the planned kind at the card's depth. `content-contract.js` lints reference and gallery text in `reference-content-contract.test.mjs`; `formula-sampler.js` fills a plot series from a formula behind `EXPLANATION_FORMULA_SAMPLER=on`; `correction-corpus*.fixtures.mjs` are rejected/corrected spec pairs (`packages/control-plane/scripts/explanation-correction-corpus-report.mjs` runs them through the server corrections); `reference-single-variants.js` holds the one-diagram variants of two-panel references, sent by default. After an intended rendering change, regenerate the snapshots with `UPDATE_TUTOR_SVG_SNAPSHOTS=1 node --test packages/web/src/tutor-diagrams/svg-snapshots.test.mjs` and read the diff (`node packages/web/scripts/explanation-svg-snapshots.mjs --before <old tree> --out <empty dir>`).
