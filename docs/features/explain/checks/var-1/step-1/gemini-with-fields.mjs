// usage: node gemini-with-fields.mjs <worktree root>  (the tree's explanation-fast-chain.js patched so Gemini keeps derive/op/t)
// -> property counts of Gemini's request schema with the two fields added: unsteered, the largest over every reference prompt, the mixed bundle, and how many reference prompts
// are over 362 BEFORE geminiRequestSchema's own reduction (bundledAuthorSchema: quant/fresh) has to run.
const root = process.argv[2];
const w = await import('file:///' + root + '/packages/web/src/tutor-diagrams/reference-library.js');
const imp = p => import('file:///' + root + '/packages/control-plane/' + p);
const { prepareArtifactAuthorRequest } = await imp('src/learn-artifact.js');
const { stepRequest } = await imp('src/explanation-fast-chain.js');
const env = { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'google-low', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', EXPLANATION_INTERACTIONS: 'true' };
const props = s => (!s || typeof s !== 'object' ? 0 : Object.keys(s.properties ?? {}).length + Object.values(s).reduce((n, c) => n + props(c), 0));
const log = console.log; console.log = () => {};
const gem = (args, extra = {}) => { globalThis.__pre = []; const s = stepRequest({ provider: 'google', model: 'gemini-3.5-flash-lite' }, 'low', prepareArtifactAuthorRequest(env, { command: 'explanation', args, depth: 'standard', ...extra }).body).response_format.json_schema.schema; return { final: props(s), pre: globalThis.__pre.at(-1) ?? null, text: JSON.stringify(s) }; };
const un = ['how does the water cycle work?', 'how does the TCP handshake work?', 'stack vs queue'].map(a => { const g = gem(a); return [g.final, g.text.length]; });
let maxFinal = [0, ''], maxPre = [0, ''], over = [], withDerive = 0;
for (const r of w.diagramReferences) { const g = gem(r.prompts[0]); if (g.final > maxFinal[0]) maxFinal = [g.final, r.id]; const p = g.pre ?? g.final; if (p > maxPre[0]) maxPre = [p, r.id]; if (p > 362) over.push([r.id, p]); if (g.text.includes('"derive"')) withDerive++; }
console.log = log;
console.log(JSON.stringify({ unsteered: un, maxFinalOverReferences: maxFinal, maxBeforeReductionOverReferences: maxPre, referencesOver362BeforeReduction: over.length, over, referencesWhoseFinalSchemaCarriesDerive: withDerive, references: w.diagramReferences.length }, null, 1));
