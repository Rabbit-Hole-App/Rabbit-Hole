// applyCalculations: 201865bdf (before) vs 08eab4313 (after). Which cards stop being checked for a prose number; the "?" check stays.
const load = async root => { const w = await import(`file:///${root}/packages/web/src/tutor-diagrams/reference-library.js`); const c = await import(`file:///${root}/packages/control-plane/src/explanation-calculation.js`); return { refs: w.diagramReferences, apply: c.applyCalculations }; };
const OLD = await load('C:/s/sj-verify/old'), NEW = await load('C:/s/sj-four');
const ref = (T, id) => T.refs.find(r => r.id === id);
const fence = spec => '```rh-diagram\n' + JSON.stringify(spec) + '\n```';
const author = (T, id, inputs, change = d => d) => { const r = ref(T, id), diagram = structuredClone(r.template.diagram); for (const [n, v] of Object.entries(inputs)) diagram.variables.find(x => x.name === n).value = v; return { version: 1, diagram: change(diagram) ?? diagram }; };
const FLOW = { version: 1, diagram: { kind: 'flow', title: 'Steps', nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b' }] } };
const withTitle = (T, id, title) => { const s = structuredClone(ref(T, id).spec); s.diagram.title = title; return s; };
const cases = T => {
  const sm = author(T, 'softmax-probabilities', { weightsA: [39, 33, 28], weightsB: [10, 10, 80] });
  const conf = ref(T, 'confusion-matrix-counts').spec, tok = ref(T, 'ml-self-attention-token-links');
  const mean = author(T, 'regression-mean-baseline', {}, d => { [2, 2, 2, 8, 6].forEach((y, i) => { d.series[0].points[i].y = y; }); return d; });
  const R = id => ref(T, id);
  return [
    ['none ref (confusion), prose 0.70', [R('confusion-matrix-counts')], { title: 't', body: `Right 0.70 of the time.\n\n${fence(conf)}` }],
    ['none ref (confusion), caption 0.70', [R('confusion-matrix-counts')], { title: 't', body: fence({ ...conf, diagram: { ...conf.diagram, caption: 'Right 0.70.' } }) }],
    ['none ref (confusion), section text 0.70', [R('confusion-matrix-counts')], { title: 't', body: fence(conf), more: [{ title: 's', text: 'It is 62.5% right.' }] }],
    ['none ref (token links), prose 0.7', [tok], { title: 't', body: `Weights near 0.7.\n\n${fence(tok.spec)}` }],
    ['function ref (softmax) + softmax diagram, prose 0.70', [R('softmax-probabilities')], { title: 't', body: `Input A puts 0.70 on Cat.\n\n${fence(sm)}` }],
    ['function ref (softmax) + softmax diagram, prose 0.39', [R('softmax-probabilities')], { title: 't', body: `Input A puts 0.39 on Cat.\n\n${fence(sm)}` }],
    ['function ref (mean) + mean diagram, 70%', [R('regression-mean-baseline')], { title: 't', body: `At 70% of it.\n\n${fence(mean)}` }],
    ['function ref (softmax) + a flow diagram only, prose 0.70', [R('softmax-probabilities')], { title: 't', body: `Rate 0.70.\n\n${fence(FLOW)}` }],
    ['function ref (softmax), no fence, prose 0.70', [R('softmax-probabilities')], { title: 't', body: 'Rate 0.70 and 12%.' }],
    ['function ref (softmax), fence is not JSON, prose 0.70', [R('softmax-probabilities')], { title: 't', body: 'Rate 0.70.\n\n```rh-diagram\nnot json\n```' }],
    ['function ref (softmax), the diagram is of another kind (confusion) + prose 0.70', [R('softmax-probabilities')], { title: 't', body: `Rate 0.70.\n\n${fence(conf)}` }],
    ['[softmax, confusion] refs, only the confusion diagram, prose 0.70', [R('softmax-probabilities'), R('confusion-matrix-counts')], { title: 't', body: `Rate 0.70.\n\n${fence(conf)}` }],
    ['[softmax, confusion] refs, both diagrams, prose 0.70', [R('softmax-probabilities'), R('confusion-matrix-counts')], { title: 't', body: `Rate 0.70.\n\n${fence(sm)}\n\n${fence(conf)}` }],
    ['[softmax, mean] refs, softmax diagram only, prose 0.70 (mean did not run, softmax did)', [R('softmax-probabilities'), R('regression-mean-baseline')], { title: 't', body: `Rate 0.70.\n\n${fence(sm)}` }],
    ['"?" in a none-reference diagram', [R('confusion-matrix-counts')], { title: 't', body: fence(withTitle(T, 'confusion-matrix-counts', 'Counts of ?')) }],
    ['"?" in a flow diagram under a softmax ref that did not run', [R('softmax-probabilities')], { title: 't', body: fence({ ...FLOW, diagram: { ...FLOW.diagram, title: 'Steps of ?' } }) }],
    ['"?" + prose 0.70 on a none ref (which problem wins)', [R('confusion-matrix-counts')], { title: 't', body: `Rate 0.70.\n\n${fence(withTitle(T, 'confusion-matrix-counts', 'Counts of ?'))}` }],
    ['no declared ref at all, prose 0.70', [], { title: 't', body: 'Rate 0.70.' }],
  ];
};
const co = cases(OLD), cn = cases(NEW);
const short = r => (r.problem ? r.problem.split(':')[0] : 'accepted') + (r.steps.length ? ` (steps ${r.steps.length})` : '');
let changed = 0;
for (let i = 0; i < co.length; i++) {
  const o = OLD.apply(co[i][2], co[i][1]), n = NEW.apply(cn[i][2], cn[i][1]);
  const flag = short(o) === short(n) ? 'same   ' : 'CHANGED'; if (flag === 'CHANGED') changed++;
  console.log(`${flag} ${co[i][0].padEnd(86)} before: ${short(o).padEnd(42)} after: ${short(n)}`);
}
console.log('changed', changed, 'of', co.length);
