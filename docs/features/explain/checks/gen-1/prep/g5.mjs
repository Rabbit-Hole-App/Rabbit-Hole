// Read-only: property counts of single-kind schema bundles for Gemini. No network, no spend.
// Counter: the repo's own (explanation-fast-chain.js schemaProperties, identical to the test's `props` in explanation-gemini-illustration-bundles.test.js:11).
import { writeFileSync } from 'node:fs';
const root = 'C:/s/var-1';
const cp = p => import('file:///' + root + '/packages/control-plane/' + p);
const { prepareArtifactAuthorRequest } = await cp('src/learn-artifact.js');
const { stepRequest, forGemini, withoutBounds } = await cp('src/explanation-fast-chain.js');
const refs = await cp('src/explanation-references.js');
const { bundledAuthorSchema, CORE_KINDS, QUANT_KINDS, NEW_KINDS, listForm } = refs;
const log = console.log; console.log = () => {};

const props = s => (!s || typeof s !== 'object' ? 0 : Object.keys(s.properties ?? {}).length + Object.values(s).reduce((n, c) => n + props(c), 0)); // verbatim schemaProperties
const out = { notes: [], rows: [] };

const envFor = (interactions, profile) => ({ SMALL_ENV: 'test', ...(profile ? { EXPLANATION_MODEL_PROFILE: profile } : {}), GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', ...(interactions ? { EXPLANATION_INTERACTIONS: 'true' } : {}) });
const full = interactions => { const p = prepareArtifactAuthorRequest(envFor(interactions, null), { command: 'explanation', args: 'zzz', depth: 'standard' }); return p.body.tools.find(t => t.name === 'make_explanation').input_schema; };
const unionOf = schema => { const v = schema.properties.visuals.items; const spec = (v.oneOf ?? v.anyOf).find(x => x.properties.spec).properties.spec; const u = spec.properties.diagram; return u.oneOf ?? u.anyOf; };
const kindOf = b => b.properties?.kind?.const;

const run = interactions => {
  const F = full(interactions);
  const allKinds = unionOf(F).map(kindOf);
  const res = { interactions, fullAuthorSchemaProps: props(F), allKinds, mixedRef: {} };
  // reference points: the unsteered bundle, via the real request path (Gemini)
  const gem = (args, extra = {}) => stepRequest({ provider: 'google', model: 'gemini-3.5-flash-lite' }, 'low', prepareArtifactAuthorRequest(envFor(interactions, 'google-low'), { command: 'explanation', args, depth: 'standard', ...extra }).body).response_format.json_schema.schema;
  const fw = (args, extra = {}) => stepRequest({ provider: 'fireworks', model: 'm' }, 'low', prepareArtifactAuthorRequest(envFor(interactions, 'fireworks-low'), { command: 'explanation', args, depth: 'standard', ...extra }).body).response_format.json_schema.schema;
  res.unsteeredGemini = props(gem('how does the water cycle work?'));
  res.unsteeredNonGemini = props(fw('how does the water cycle work?'));
  const req = kinds => ({ visualRequirements: { items: kinds.map((diagramKind, i) => ({ id: `vr-${i + 1}`, kind: 'diagram', diagramKind, purpose: `Show the ${diagramKind}` })) } });
  res.mixedRef.plotHeatmapBlockstack_gemini = props(gem('Show the numeric summaries and their assembly', req(['coordinate-plot', 'heatmap', 'block-stack'])));
  res.mixedRef.plotHeatmapBlockstack_nonGemini = props(fw('Show the numeric summaries and their assembly', req(['coordinate-plot', 'heatmap', 'block-stack'])));
  res.mixedRef.quantBundle_nonGemini = props(fw('x', req(['coordinate-plot'])));
  res.mixedRef.quantBundle_gemini = props(gem('x', req(['coordinate-plot'])));
  res.mixedRef.newBundle_gemini = props(gem('x', req(['box-plot'])));
  res.mixedRef.newBundle_nonGemini = props(fw('x', req(['box-plot'])));
  // Gemini's own reduction on top (explanation-fast-chain.js geminiRequestSchema) is what stepRequest returns above.

  // single-kind bundles: the repo's bundledAuthorSchema with the flags diagramBundle would set, then the union cut to the one kind.
  const flagsFor = (kind, extra = {}) => ({ quant: QUANT_KINDS.includes(kind), fresh: NEW_KINDS.includes(kind), tensor: kind === 'tensor', tokenLinks: kind === 'token-links', blockStack: kind === 'block-stack', ...extra });
  const single = (kind, extra = {}) => {
    const b = bundledAuthorSchema(F, flagsFor(kind, extra));
    const v = b.properties.visuals.items, spec = (v.oneOf ?? v.anyOf).find(x => x.properties.spec).properties.spec, u = spec.properties.diagram, key = u.oneOf ? 'oneOf' : 'anyOf';
    u[key] = u[key].filter(x => kindOf(x) === kind);
    return b;
  };
  // Gemini view = stepRequest's reduction (withoutBounds + forGemini: list forms, derive/op/t removed); "with derive" = the same minus the withoutDerived step.
  const keepAll = new Set([...NEW_KINDS, 'tensor', 'token-links', 'block-stack']);
  const geminiWithout = s => forGemini(withoutBounds(s), keepAll);
  // with derive/op/t: list forms applied by hand for comparison/transformation exactly as forGemini does, without stripping derive/op/t.
  const geminiWith = s => { const c = withoutBounds(s); const v = c.properties.visuals.items, spec = (v.oneOf ?? v.anyOf).find(x => x.properties.spec).properties.spec, u = spec.properties.diagram, key = u.oneOf ? 'oneOf' : 'anyOf';
    u[key] = u[key].map(b => (['transformation', 'comparison'].includes(kindOf(b)) ? listForm(b) : b)); return c; };
  const variants = { default: {} };
  const rows = [];
  for (const kind of allKinds) {
    const base = single(kind);
    const row = { kind, geminiWithout: props(geminiWithout(base)), geminiWith: props(geminiWith(base)), nonGeminiAsBundled: props(base), derivePresent: JSON.stringify(base).includes('"derive":{'), opPresent: /"op":\{/.test(JSON.stringify(base)), forms: {} };
    // composed / flag forms
    if (kind === 'comparison') { const s = single(kind, { panels: true }); row.forms.comparisonPanels = { nonGemini: props(s), geminiAsIs_noListForm: props(withoutBounds(s)) }; const s2 = single(kind, { panels: true, blockStackPanels: true }); row.forms.comparisonPanels_blockStackPanels = { nonGemini: props(s2) }; }
    if (kind === 'transformation') { const s = single(kind, { states: true }); row.forms.transformationVisualStates = { nonGemini: props(s), geminiAsIs_noListForm: props(withoutBounds(s)) }; const t = single(kind, { tensorHosts: ['transformation'] }); row.forms.transformationTensorItems = { nonGemini: props(t), geminiWithout: props(geminiWithout(t)) }; const both = single(kind, { states: true, tensorHosts: ['transformation'] }); row.forms.transformationStates_tensor = { nonGemini: props(both) }; }
    if (kind === 'flow') { row.forms.flowTensorNodes = { nonGemini: props(single(kind, { tensorHosts: ['flow'] })) }; row.forms.flowParallelPaths = { nonGemini: props(single(kind, { parallelPaths: true })) }; row.forms.flowTensor_parallel = { nonGemini: props(single(kind, { tensorHosts: ['flow'], parallelPaths: true })) }; }
    if (kind === 'relationship') row.forms.relationshipTensorNodes = { nonGemini: props(single(kind, { tensorHosts: ['relationship'] })) };
    if (kind === 'coordinate-plot') { row.forms.compactPlots = { nonGemini: props(single(kind, { compactPlots: true })), geminiWithout: props(geminiWithout(single(kind, { compactPlots: true }))) }; }
    rows.push(row);
  }
  res.rows = rows;
  // two-kind bundles: a few representative pairs; and the worst pair among all kinds (Gemini view without / with derive)
  const two = (a, b) => { const s = bundledAuthorSchema(F, { ...flagsFor(a), quant: QUANT_KINDS.includes(a) || QUANT_KINDS.includes(b), fresh: NEW_KINDS.includes(a) || NEW_KINDS.includes(b), tensor: a === 'tensor' || b === 'tensor', tokenLinks: a === 'token-links' || b === 'token-links', blockStack: a === 'block-stack' || b === 'block-stack' });
    const v = s.properties.visuals.items, sp = (v.oneOf ?? v.anyOf).find(x => x.properties.spec).properties.spec, u = sp.properties.diagram, key = u.oneOf ? 'oneOf' : 'anyOf'; u[key] = u[key].filter(x => [a, b].includes(kindOf(x))); return s; };
  const pairs = [];
  for (let i = 0; i < allKinds.length; i++) for (let j = i + 1; j < allKinds.length; j++) { const s = two(allKinds[i], allKinds[j]); pairs.push({ pair: [allKinds[i], allKinds[j]], without: props(geminiWithout(s)), with: props(geminiWith(s)) }); }
  pairs.sort((x, y) => y.with - x.with);
  res.worstPairsWith = pairs.slice(0, 8); res.bestPairWith = pairs.at(-1);
  res.pairsOverLimitWith = pairs.filter(p => p.with > 362).length; res.pairsTotal = pairs.length;
  res.pairsOverLimitWithout = pairs.filter(p => p.without > 362).length;
  res.samplePairs = pairs.filter(p => [['flow', 'comparison'], ['coordinate-plot', 'bar-chart'], ['box-plot', 'histogram'], ['heatmap', 'box-plot'], ['transformation', 'bar-chart'], ['block-stack', 'tensor']].some(q => q.every(k => p.pair.includes(k))));
  return res;
};
console.log = log;
for (const interactions of [true, false]) { out[interactions ? 'withInteractions' : 'noInteractions'] = run(interactions); }
// which bundle flags would a library reference add on the Gemini path today: dropped kinds (NEW kinds) -> see canWriteKind
const ff = await cp('src/explanation-fast-chain.js');
out.canWriteKind = Object.fromEntries(['heatmap', 'sample-set', 'histogram', 'box-plot', 'coordinate-plot'].map(k => [k, { geminiNoKeep: ff.canWriteKind({ provider: 'google' }, k), geminiKept: ff.canWriteKind({ provider: 'google' }, k, new Set([k])) }]));
writeFileSync('C:/s/gen1-prep/g5.json', JSON.stringify(out, null, 1));
log('done');
