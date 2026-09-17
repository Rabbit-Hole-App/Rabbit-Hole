// Pure semantic context: no engine instances, executable callbacks or screenshots.
export function graphContext(shape, compact = false) {
  if (shape?.type !== 'interactive-graph') return null;
  const { spec, state } = shape.props;
  return { objectId: shape.meta.objectId || spec.id, renderer: spec.renderer, concept: spec.concept,
    expressions: (state.expressions || spec.expressions || []).slice(0, compact ? 12 : undefined).map(e => compact ? e.expression.slice(0, 300) : e.expression),
    traces: (spec.traces || []).map(trace => {
      if (!compact || trace.x.length <= 24) return trace;
      const indices = Array.from({ length: 24 }, (_, i) => Math.round(i * (trace.x.length - 1) / 23));
      return { ...trace, x: indices.map(i => trace.x[i]), y: indices.map(i => trace.y[i]), sampled: true, totalPoints: trace.x.length, sampleIndices: indices };
    }),
    parameters: { ...Object.fromEntries(Object.entries(spec.parameters || {}).map(([k, v]) => [k, v.value])), ...state.parameters },
    xAxis: { ...spec.xAxis, ...state.xAxis }, yAxis: { ...spec.yAxis, ...state.yAxis },
    selectedPoint: state.selectedPoint || null, selectedTrace: state.selectedTrace || null, traceVisibility: state.traceVisibility || {},
  };
}
export const getGraphContext = (editor, shapeId) => graphContext(editor.getShape(shapeId));

export function emitGraphEvent(editor, shapeId, type, detail) {
  const context = getGraphContext(editor, shapeId);
  if (context) editor.getContainer().dispatchEvent(new CustomEvent('learn-graph-event', { bubbles: true, detail: { type, graphId: context.objectId, ...detail, context } }));
}
