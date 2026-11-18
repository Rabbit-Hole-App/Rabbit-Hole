// VAR-1 bench plan builder (offline, no provider call). Writes plan.json:
//  (1) numeric cells: the section-6 plan's 303 items (101 distinct prompt x depth cells x runs; same prompts, so the arms compare with section 6), run on BOTH arms;
//  (2) variation items: for ten of the fifteen varied references, one prompt (the reference's own first prompt) asked twice, run on the AFTER arm only (items idx 1000+).
// A variation prompt is kept only if, offline, the reference is the first non-shape reference selected for it AND two request seeds draw different varied inputs.
//   node plan.mjs [afterTree]
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const after = process.argv[2] ?? 'C:/s/var1-bench-trees/after';
const imp = p => import(pathToFileURL(`${after}/packages/${p}`).href);
const { diagramReferences } = await imp('web/src/tutor-diagrams/reference-library.js');
const { prepareArtifactAuthorRequest } = await imp('control-plane/src/learn-artifact.js');
const env = { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'google-low', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', EXPLANATION_INTERACTIONS: 'true' };
const at = (root, path) => path.split('.').reduce((node, key) => node?.[key], root);
const pick = (prompt, seed) => { const log = console.log; console.log = () => {}; try { return prepareArtifactAuthorRequest(env, { command: 'explanation', args: prompt, depth: 'standard', requestSeed: seed }); } finally { console.log = log; } };

const base = JSON.parse(fs.readFileSync('C:/s/sprint2-evidence/card-numbers/section-6/plan.json', 'utf8'));
const varied = diagramReferences.filter(r => r.vary), kept = [], dropped = [];
for (const ref of varied) {
  const prompt = ref.prompts?.[0];
  const a = prompt && pick(prompt, 'plan-A'), b = prompt && pick(prompt, 'plan-B');
  const first = a?.diagramReferences?.find(r => !r.shape);
  const spec = x => x?.diagramReferences?.find(r => r.id === ref.id)?.spec?.diagram;
  const differs = spec(a) && spec(b) && Object.keys(ref.vary).some(p => at(spec(a), p) !== at(spec(b), p));
  (first?.id === ref.id && differs ? kept : dropped).push({ id: ref.id, prompt, firstId: first?.id ?? null, differs: Boolean(differs) });
}
const chosen = kept.slice(0, 10);
const variation = chosen.flatMap((c, i) => [1, 2].map(rep => ({ set: 'vary', prompt: c.prompt, depth: 'balanced', rep, refId: c.id, arms: ['after'], idx: 1000 + i * 2 + rep - 1 })));
const items = base.items.map(it => ({ ...it, arms: ['before', 'after'] }));
const plan = { meta: { source: 'section-6 plan.json (303 items, 101 distinct prompt x depth cells) + 20 variation items', numericItems: items.length, variationItems: variation.length, variationReferences: chosen.map(c => c.id), notSelectedOffline: dropped }, items: [...items, ...variation] };
fs.writeFileSync(new URL('./plan.json', import.meta.url), JSON.stringify(plan, null, 1));
console.log(`plan.json: ${items.length} numeric items on both arms (${items.length * 2} runs) + ${variation.length} variation runs on the AFTER arm = ${items.length * 2 + variation.length} runs`);
console.log('variation references:', chosen.map(c => c.id).join(', '));
console.log('varied references with no usable offline prompt (not in the variation set):', dropped.map(d => `${d.id} (first=${d.firstId}, differs=${d.differs})`).join('; ') || 'none');
