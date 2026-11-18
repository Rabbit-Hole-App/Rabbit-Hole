// usage: node props.mjs <worktree root>  -> property counts: full author schema, Gemini unsteered, max Gemini bundle over every reference prompt
const root = process.argv[2];
const w = await import('file:///' + root + '/packages/web/src/tutor-diagrams/reference-library.js');
const spec = await import('file:///' + root + '/packages/web/src/tutor-diagrams/spec.js');
const imp = p => import('file:///' + root + '/packages/control-plane/' + p);
const { prepareArtifactAuthorRequest } = await imp('src/learn-artifact.js');
const { stepRequest } = await imp('src/explanation-fast-chain.js');
const env = { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'google-low', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', EXPLANATION_INTERACTIONS: 'true' };
const props = s => (!s || typeof s !== 'object' ? 0 : Object.keys(s.properties ?? {}).length + Object.values(s).reduce((n, c) => n + props(c), 0));
const log = console.log; console.log = () => {};
const gem = args => stepRequest({ provider: 'google', model: 'gemini-3.5-flash-lite' }, 'low', prepareArtifactAuthorRequest(env, { command: 'explanation', args, depth: 'standard' }).body).response_format.json_schema.schema;
const fw = args => prepareArtifactAuthorRequest(env, { command: 'explanation', args, depth: 'standard' }).body.tools[0].input_schema;
const unsteered = ['how does the water cycle work?', 'how does the TCP handshake work?', 'stack vs queue'].map(a => { const s = gem(a); return [props(s), JSON.stringify(s).length]; });
let maxG = [0, ''], maxF = [0, ''];
for (const r of w.diagramReferences) { const p = r.prompts[0]; const g = props(gem(p)), f = props(fw(p)); if (g > maxG[0]) maxG = [g, r.id]; if (f > maxF[0]) maxF = [f, r.id]; }
console.log = log;
console.log(JSON.stringify({ fullAuthorSchema: props(spec.tutorDiagramAuthorJsonSchema), fullParserSchema: props(spec.tutorDiagramJsonSchema), unsteeredGemini: unsteered, maxGeminiBundle: maxG, maxNonGeminiBundle: maxF, references: w.diagramReferences.length }));
