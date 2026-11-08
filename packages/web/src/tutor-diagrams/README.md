# Rabbit Hole Tutor diagram components

Tasks: `8de91403-f6ec-4d2d-bf13-64a4e108ec3f` and `dbcebf0b-7299-4268-8011-7ad03a40772a`

This is a static SVG renderer for the written Explanation card. It takes a versioned semantic spec, lays it out deterministically, and uses React to render SVG elements. The author supplies labels, roles, and relationships. The renderer supplies geometry, connectors, type, and fills.

## Entry points

- `TutorDiagram.js` exports the default React component. Use `<TutorDiagram spec={value} fallback={existingContent} />`. The spec can be an object or a JSON string. Invalid specs use the caller's fallback. The component measures its container and keeps the text at native size when a dense diagram needs horizontal scrolling.
- `renderTutorDiagram(value, width)` in the same module returns `{ element, width, height }` for deterministic static rendering and geometry tests. It throws on invalid input.
- `spec.js` exports `parseTutorDiagram(value)` for backend validation and `tutorDiagramJsonSchema` for a structured-output request. The runtime parser is authoritative for topology, references, distinct branch labels, and matrix row lengths. `describeTutorDiagram(parsedSpec)` produces the readable diagram text for context, copying, and accessibility.
- `examples.json` contains runnable, complete fixtures for each kind.

## Components and formats

Every spec has the shape `{ "version": 1, "diagram": { "kind": "...", "title": "...", ... } }`. A diagram can also have a caption.

| Kind | Authored input | Rendered components |
|---|---|---|
| `flow` | Nodes with `id`, `label`, `role`; directed edges with `from`, `to`, optional `label` | Process boxes, decision diamonds, outcome pills, elbow arrows, branch labels, skip lanes |
| `comparison` | Columns with `heading` and `items` | Colored headers, outlined cells, dashed column dividers |
| `timeline` | Events with `time`, `label`, optional `detail` | Time pills, event cards, connected markers |
| `sequence` | Actors with `id` and `label`; messages with `from`, `to`, and `label` | Actor boxes, lifelines, directed message arrows |
| `matrix` | Column labels; rows with `heading` and `cells` | Column headers, row headers, data cells |
| `layers` | Ordered layers with `label`, optional `detail` | Stacked color blocks with wrapped labels and details |
| `cycle` | Ordered step labels | Step boxes, arrows, outer return connector |
| `figure` | Figure preset and named callouts. Free-body figures take direction, magnitude, and unit | Cell, cross-section, or free-body drawing; linked callout badges; proportional force arrows |
| `tree` | Nodes with `id`, `label`, and optional `parent`. With `layout: "binary"`, each child also supplies `side: "left"` or `"right"`. | Indented hierarchy or a top-down binary tree with the approved branch styling |
| `relationship` | Labeled nodes and directed links with relationship labels | Directional lanes with clear endpoints, including reciprocal links |
| `transformation` | Before and after item lists, operation, optional zero-based item mappings | Two states, operation banner, and labeled mappings |
| `argument` | Claim, support, objections, conclusion. Evidence can include a source label | Evidence lanes joined to a conclusion |
| `number-line` | Explicit domain, value markers, intervals with open or closed endpoints | Scaled ticks, numbered markers, interval segments |
| `coordinate-plot` | Two labeled axis domains, optional units, line or scatter series | Linear axes, data marks, exact point values, distinct series symbols |
| `bar-chart` | Labeled signed values and optional unit | Horizontal bars with a shared zero baseline |
| `t-account` | Account label, optional unit, debit and credit entries | Debit and credit columns, totals, balance side |
| `waterfall` | Opening value, signed changes, optional unit | Floating change bars, running totals, computed closing balance |


Flow represents one connected acyclic graph. Decision nodes need two or three distinctly labeled branches. Relationship supports cycles with labeled directions, and cycle shows a simple repeating process. Use the Zod schema and example fixtures for exact bounds and fields.

Figure callouts refer to anchors defined by the local schematic. See the three figure fixtures for anchor names and the free-body vector inputs. Chart coordinates are numeric data in the declared domains. The renderer maps that data to the visual scale. Both accounting kinds use integer minor units and accept amounts with up to two decimal places.

Any label, title, caption, heading or item may hold maths in the card prose's delimiters (`$...$`, `\(...\)`, `$$...$$`, `\[...\]`). The renderer typesets each formula with KaTeX in a `foreignObject` (`math.js`), measures it whole from its TeX so its box holds it, never splits it across lines, and sets a formula taller than a line (a fraction, a sum with limits) smaller so it fits that line. TeX that KaTeX refuses stays as its source text. A formula counts against a text limit by what it shows: delimiters, braces and spaces are free and a command such as `\frac` counts one; its source may be up to twice the limit.

## Approved visual treatment

The renderer uses the existing `--viz-surface` for the background and existing RH theme tokens for neutral text and lines. Colored nodes retain dark outlines and dark label ink. The component fills are process blue `#8DBFEF`, decision amber `#E5AA46`, outcome teal `#67B9A0`, comparison olive `#95A448`, and comparison coral `#F58371`. The expansion adds concept lavender `#B9A4E8`, exception rose `#E8A3B7`, and context slate blue `#A8BBD0`. The model supplies semantic inputs and data values. SVG, CSS, layout positions, asset URLs, and fill assignments are renderer-owned.

## Claude integration handoff

1. Cherry-pick the additive library commit and then the expansion commit onto the active Tutor implementation base. If the first commit is already present, bring over only the expansion. The `chatgpt/tutor` branch carries handoff history and is behind the current app.
2. Use the existing written Explanation author and renderer. In current main, start at `ExplanationBody` in `LearningBlocks.jsx` and its rich Markdown blocks in `Md.jsx`. One compatibility-friendly way to persist the new diagrams is a versioned `rh-diagram` JSON fence recognized only for Explanation body and More content. Use the existing block parser and card surface. Expose the library's plain-text description to copying and Tutor context.
3. Validate every new spec through `parseTutorDiagram` before delivery. Count the visible labels and captions against the existing Depth content caps, including diagrams inside collapsed More sections. Keep prose readable when a diagram is unavailable. Preserve the existing readers for saved Mermaid fences, standalone `/diagram` cards, source Markdown, and interactive `VisualSpec` scenes.
4. After the current Celeris benchmark, run the same fixtures through the proposed author-to-card route at the actual Explanation width. Confirm the provider accepts the expanded JSON Schema before adopting it. Include examples from science, math, humanities, and accounting. Record first-valid and eventual-valid rates, render-to-paint and end-to-end latency. Include narrow and dark appearance, body and More, save/reload, invalid input, and one saved Mermaid card.
5. Switch newly authored static Tutor diagrams to this library after the integration passes. Retire an old renderer only after its stored content and other callers are covered.

## Focused local checks

From the repository root with existing web dependencies installed:

```sh
node --test packages/web/src/tutor-diagrams/*.test.mjs
```

The fixtures exercise deterministic rendering and narrow widths without an author or model. Browser fit, real provider schema acceptance, and persisted Explanation behavior require integration evidence.
