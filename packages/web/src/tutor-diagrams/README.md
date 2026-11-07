# Rabbit Hole Tutor diagram components

Task: `8de91403-f6ec-4d2d-bf13-64a4e108ec3f`

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

Flow represents one connected acyclic graph. Decision nodes need two or three distinctly labeled branches. Use cycle for a simple feedback loop. Use the Zod schema and the example fixtures for exact bounds and fields.

## Approved visual treatment

The renderer uses the existing `--viz-surface` for the background and existing RH theme tokens for neutral text and lines. Colored nodes retain dark outlines and dark label ink. The component fills are process blue `#8DBFEF`, decision amber `#E5AA46`, outcome teal `#67B9A0`, comparison olive `#95A448`, and comparison coral `#F58371`. The model cannot provide raw SVG, CSS, coordinates, URLs, or palette overrides.

## Claude integration handoff

1. Cherry-pick the additive library commit onto the active Tutor implementation base. The `chatgpt/tutor` branch carries handoff history and is behind the current app.
2. Use the existing written Explanation author and renderer. In current main, start at `ExplanationBody` in `LearningBlocks.jsx` and its rich Markdown blocks in `Md.jsx`. One compatibility-friendly way to persist the new diagrams is a versioned `rh-diagram` JSON fence recognized only for Explanation body and More content. Use the existing block parser and card surface. Expose the library's plain-text description to copying and Tutor context.
3. Validate every new spec through `parseTutorDiagram` before delivery. Count the visible labels and captions against the existing Depth content caps, including diagrams inside collapsed More sections. Keep prose readable when a diagram is unavailable. Preserve the existing readers for saved Mermaid fences, standalone `/diagram` cards, source Markdown, and interactive `VisualSpec` scenes.
4. After the current Celeris benchmark, run the same fixtures through the proposed author-to-card route at the actual Explanation width. Confirm the provider accepts the emitted JSON Schema before adopting it. Record first-valid and eventual-valid rates, render-to-paint and end-to-end latency. Include narrow and dark appearance, body and More, save/reload, invalid input, and one saved Mermaid card.
5. Switch newly authored static Tutor diagrams to this library after the integration passes. Retire an old renderer only after its stored content and other callers are covered.

## Focused local checks

From the repository root with existing web dependencies installed:

```sh
node --test packages/web/src/tutor-diagrams/*.test.mjs
```

The fixtures exercise deterministic rendering and narrow widths without an author or model. Browser fit, real provider schema acceptance, and persisted Explanation behavior require integration evidence.
