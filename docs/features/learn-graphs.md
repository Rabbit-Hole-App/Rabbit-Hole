# Interactive lesson graphs (regular dev)

One `interactive-graph` tldraw shape renders a validated `interactive_plot` operation. `renderer: desmos` selects mathematical expressions and sliders; `renderer: plotly` selects numeric line/scatter/bar traces. Examples in tests are illustrative specifications, not lesson-specific implementation. No model-generated JavaScript, eval, executable callbacks, 3D, heatmaps or advanced controls.

## Behavior

The frame selects/moves/resizes through tldraw. The inner graph receives pointer, wheel and keyboard interaction without dragging its parent. Both renderers are loaded on demand. Desmos uses its documented public browser SDK key, returned only after app authorization; the fal credential remains server-only. Plotly uses the locally bundled basic distribution and needs no key.

Desmos state, current expressions, parameter values, selected expression and ranges stay in shape props. Plotly ranges, selected point/trace and trace visibility also stay there. `getGraphContext(editor, shapeId)` and the shape utility's `getGraphContext(shapeId)` expose semantic data, and canvas selection includes it for the tutor. Structured `learn-graph-event` events carry `graph_parameter_changed`, `graph_point_clicked`, `graph_range_changed` or `graph_trace_selected` with graph identity and live context. Point-click coordinates are provided by Plotly; Desmos exposes expression selection and parameter/range changes through its public API.

Personal graphs autosave in IndexedDB, scoped by account/workspace/app, and restore on reload with their page and placement. This matches personal notes' browser-local scope; it is not cross-device course publication. Deletion removes the saved shape. Notes use the same shape utilities; their gallery has a graph card, while opening a note restores the interactive graph.

## Checklist

- [x] Shared validated operation, one shape and renderer adapters.
- [x] Expressions/sliders and line/scatter/bar.
- [x] Live semantic context and structured events.
- [x] Serialized state and browser persistence.
- [x] Unit tests and review.
- [x] Deploy regular dev with the Desmos SDK key.
- [x] Real browser checks for both engines, interaction isolation, movement, resize, context and reload.

## Results (2026-09-17)

Deployed to regular dev, version `f9eecc05-48e0-4898-b618-3198ecc94214`. All 52 focused graph, video, explanation, chat, review and paper tests passed. Live and private BYOC were not deployed.

The browser used real Desmos and Plotly engines with fixture specifications (no model charges): changing the Desmos slope updated live semantic context; Plotly line/scatter/bar rendered, hover and point selection worked, and wheel zoom/pan changed graph ranges without moving its frame. Frame movement and resize worked. Reload retained parameters, selected point, ranges, placement and size. Selecting the frame and pressing Delete removed the graph, including after reload. Evidence: `.small/learn-graphs-check.json` and `.small/learn-graphs.png`.

One real Claude explanation workflow generated both renderer specifications and passed its explanation review on the first pass. Both graphs rendered in the deployed app. Evidence: `.small/learn-graphs-real.json` and `.small/learn-graphs-real.png`. These test graphs use explicitly illustrative data, not app measurements.

Browser testing caught native wheel events reaching both the embedded plot and tldraw. The graph host now stops native wheel bubbling after the engine handles it; pointer events are marked handled for tldraw while remaining available to the graph engine.

To try it, type `/graph sigmoid` in the Learn composer (the **Explain on canvas** button this once used was removed on 2026-09-29). Use the graph interior to explore and its top frame to move/select it. Personal graph state currently persists in this browser only.

Sources: [Desmos API 1.11](https://www.desmos.com/api/v1.11/docs/index.html), [Plotly events](https://plotly.com/javascript/plotlyjs-events/), [Plotly function reference](https://plotly.com/javascript/plotlyjs-function-reference/).
