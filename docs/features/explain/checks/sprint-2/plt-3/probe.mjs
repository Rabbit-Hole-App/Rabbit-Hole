import { PRIMITIVES } from 'file:///C:/s/teaching-palette/packages/control-plane/src/learn-primitives.js';
import { withFormulaSeries } from 'file:///C:/s/teaching-palette/packages/control-plane/src/explanation-formula-series.js';
import { bundledAuthorSchema, diagramBundle } from 'file:///C:/s/teaching-palette/packages/control-plane/src/explanation-references.js';
const base = { ...PRIMITIVES.explanation.schema };
base.required = Object.keys(base.properties);
const on = withFormulaSeries(base);
const find = s => { const v = s.properties.visuals.items; const spec = (v.oneOf ?? v.anyOf).find(x => x.properties.spec).properties.spec; const u = spec.properties.diagram; return (u.oneOf ?? u.anyOf).find(b => b.properties.kind.const === 'coordinate-plot'); };
console.log('flag-on schema carries the anyOf in the full schema:', Boolean(find(on).properties.series.items.anyOf));
for (const [name, bundle] of [['quant bundle, no compact plots', { quant: true }], ['quant bundle, compactPlots', { quant: true, compactPlots: true }], ['core only (no plot kind)', {}]]) {
  try { const out = bundledAuthorSchema(on, bundle); const v = out.properties.visuals.items; const spec = (v.oneOf ?? v.anyOf).find(x => x.properties.spec).properties.spec; const u = spec.properties.diagram; const p = (u.oneOf ?? u.anyOf).find(b => b.properties.kind.const === 'coordinate-plot');
    console.log(name, '=> bundled OK; plot branch present:', Boolean(p), p ? 'series.items has anyOf: ' + Boolean(p.properties.series.items.anyOf) : ''); }
  catch (e) { console.log(name, '=> THROWS', e.constructor.name + ': ' + e.message); }
}
for (const [name, bundle] of [['flag OFF quant', { quant: true }]]) { try { bundledAuthorSchema(base, bundle); console.log(name, 'OK'); } catch (e) { console.log(name, 'THROWS', e.message); } }
