import { api } from './api.js';

let desmosScript;
// Also called on idle by learn-warmup.js: fetches and parses the SDK once, no calculator.
export async function loadDesmos(app) {
  if (window.Desmos) return window.Desmos;
  if (!desmosScript) desmosScript = (async () => {
    const { desmosApiKey } = await api(`/api/learn/graph-config?app=${encodeURIComponent(app)}`);
    if (!desmosApiKey) throw new Error('Desmos is not configured');
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      // Desmos is a browser SDK: its own API requires this public client key in the script URL.
      script.src = `https://www.desmos.com/api/v1.11/calculator.js?apiKey=${encodeURIComponent(desmosApiKey)}`;
      script.onload = resolve; script.onerror = () => { script.remove(); reject(new Error('Could not load Desmos')); };
      document.head.appendChild(script);
    });
    return window.Desmos;
  })().catch(error => { desmosScript = null; throw error; });
  return desmosScript;
}
const variable = name => name.replace(/_(.+)$/, '_{$1}');

export async function createDesmos(element, spec, saved, app, change) {
  const Desmos = await loadDesmos(app);
  const calculator = Desmos.GraphingCalculator(element, { expressions: true, sliders: true, keypad: true, images: false, folders: false, notes: false, links: false, actions: false, audio: false, capExpressionSize: true, autosize: false });
  if (saved.desmos) calculator.setState(saved.desmos);
  else {
    calculator.setExpressions([
      ...Object.entries(spec.parameters || {}).map(([name, p]) => ({ id: `parameter-${name}`, latex: `${variable(name)}=${p.value}`, sliderBounds: { ...(p.min !== undefined ? { min: String(p.min) } : {}), ...(p.max !== undefined ? { max: String(p.max) } : {}), ...(p.step !== undefined ? { step: String(p.step) } : {}) } })),
      ...spec.expressions.map(e => ({ id: e.id, latex: e.expression, ...(e.label ? { label: e.label, showLabel: true } : {}) })),
    ]);
    calculator.updateSettings({ xAxisLabel: spec.xAxis?.label || '', yAxisLabel: spec.yAxis?.label || '' });
    calculator.setMathBounds({ left: spec.xAxis?.min ?? -10, right: spec.xAxis?.max ?? 10, bottom: spec.yAxis?.min ?? -10, top: spec.yAxis?.max ?? 10 });
  }
  let applying = false;
  const snapshot = () => ({ desmos: calculator.getState(), expressions: calculator.getExpressions().filter(e => e.latex && !e.id.startsWith('parameter-')).map(e => ({ id: e.id, expression: e.latex })) });
  calculator.observeEvent('change.lesson', (_, event) => { if (!applying && event.isUserInitiated) change(snapshot()); });
  const helpers = Object.entries(spec.parameters || {}).map(([name]) => {
    const helper = calculator.HelperExpression({ latex: variable(name) });
    helper.observe('numericValue.lesson', () => {
      if (!applying && Number.isFinite(helper.numericValue)) change({ ...snapshot(), parameters: { [name]: helper.numericValue } }, 'graph_parameter_changed', { parameter: name, value: helper.numericValue });
    });
    return helper;
  });
  const reportBounds = () => {
    const bounds = calculator.graphpaperBounds?.mathCoordinates;
    if (!applying && bounds) change({ ...snapshot(), xAxis: { min: bounds.left, max: bounds.right }, yAxis: { min: bounds.bottom, max: bounds.top } }, 'graph_range_changed', { bounds });
  };
  calculator.observe('graphpaperBounds.lesson', reportBounds);
  reportBounds();
  calculator.observe('selectedExpressionId.lesson', () => {
    if (!applying && calculator.selectedExpressionId) change({ selectedTrace: calculator.selectedExpressionId }, 'graph_trace_selected', { traceId: calculator.selectedExpressionId });
  });
  return { resize: () => calculator.resize(), restore(state) { if (state.desmos) { applying = true; calculator.setState(state.desmos); applying = false; } }, destroy() { helpers.forEach(h => h.unobserve('numericValue.lesson')); calculator.destroy(); } };
}

export async function createPlotly(element, spec, saved, app, change) {
  const { default: Plotly } = await import('plotly.js-basic-dist-min');
  const data = spec.traces.map(t => ({ uid: t.id, name: t.label || t.id, type: t.type === 'bar' ? 'bar' : 'scatter', ...(t.type !== 'bar' ? { mode: t.type === 'line' ? 'lines' : 'markers' } : {}), x: [...t.x], y: [...t.y], visible: saved.traceVisibility?.[t.id] ?? true }));
  const axis = (initial, state) => ({ title: { text: initial?.label || '' }, ...(state?.min !== undefined && state?.max !== undefined ? { range: [state.min, state.max] } : initial?.min !== undefined && initial?.max !== undefined ? { range: [initial.min, initial.max] } : {}) });
  await Plotly.newPlot(element, data, { margin: { l: 55, r: 20, t: 20, b: 50 }, autosize: true, showlegend: true, dragmode: 'pan', xaxis: axis(spec.xAxis, saved.xAxis), yaxis: axis(spec.yAxis, saved.yAxis), uirevision: spec.id }, { responsive: false, scrollZoom: true, displaylogo: false });
  let applying = false;
  element.on('plotly_click', event => {
    const point = event.points?.[0];
    if (!point) return;
    const selectedPoint = { traceId: spec.traces[point.curveNumber].id, index: point.pointIndex ?? point.pointNumber, x: point.x, y: point.y };
    change({ selectedPoint }, 'graph_point_clicked', { point: selectedPoint });
  });
  element.on('plotly_relayout', () => {
    if (applying) return;
    const x = element.layout.xaxis?.range, y = element.layout.yaxis?.range;
    if (x?.every(Number.isFinite) && y?.every(Number.isFinite)) change({ xAxis: { min: x[0], max: x[1] }, yAxis: { min: y[0], max: y[1] } }, 'graph_range_changed', { x, y });
  });
  element.on('plotly_legendclick', event => change({ selectedTrace: spec.traces[event.curveNumber].id }, 'graph_trace_selected', { traceId: spec.traces[event.curveNumber].id }));
  element.on('plotly_restyle', () => { if (!applying) change({ traceVisibility: Object.fromEntries(spec.traces.map((t, i) => [t.id, element.data[i].visible ?? true])) }); });
  return { resize: () => Plotly.Plots.resize(element), async restore(state) {
    applying = true;
    try {
      const update = {};
      if (state.xAxis) update['xaxis.range'] = [state.xAxis.min, state.xAxis.max];
      if (state.yAxis) update['yaxis.range'] = [state.yAxis.min, state.yAxis.max];
      await Plotly.relayout(element, update);
      await Plotly.restyle(element, { visible: spec.traces.map(t => state.traceVisibility?.[t.id] ?? true) });
    } finally { applying = false; }
  }, destroy: () => Plotly.purge(element) };
}

export const graphRenderers = { desmos: createDesmos, plotly: createPlotly };
