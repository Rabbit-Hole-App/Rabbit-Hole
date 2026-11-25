// Independent verifier harness (sj-verify2): main vs branch, byte for byte, for every string the eight wired modules export and for every request the
// explanation author path builds from them. No provider call. usage: node bytecmp.mjs <mainRoot> <branchRoot> [out.json]
import { writeFileSync } from 'node:fs';
const [mainRoot, branchRoot, outFile = 'C:/s/sj-verify2/bytecmp.json'] = process.argv.slice(2);
const realLog = console.log;
const quiet = f => { console.log = () => {}; try { return f(); } finally { console.log = realLog; } };
const MODS = ['agents/learn-artifact.js', 'chat-depth.js', 'explanation-fast-chain.js', 'explanation-interactions.js', 'explanation-planner.js', 'explanation-references.js', 'learn-artifact.js', 'learn-primitives.js'];
const ARM = { main: mainRoot, branch: branchRoot };
const load = async root => {
  const imp = p => import('file:///' + root + '/' + p);
  const mods = {};
  for (const m of MODS) mods[m] = await imp('packages/control-plane/src/' + m);
  mods.slash = await imp('packages/web/src/agent/slash.js');
  mods.lib = await imp('packages/web/src/tutor-diagrams/reference-library.js');
  mods.models = await imp('packages/control-plane/src/explanation-models.js');
  return mods;
};
const M = {};
for (const arm of Object.keys(ARM)) M[arm] = await load(ARM[arm]);

const diffs = [];
const stat = { exportedNames: 0, stringLeaves: 0, stringChars: 0, otherLeaves: 0, calls: 0, callChars: 0, requests: 0, requestChars: 0 };
const note = (kind, where, a, b) => diffs.push({ kind, where, main: String(a).slice(0, 160), branch: String(b).slice(0, 160) });

// flatten any value into path -> string leaves (functions: their name only; their source is the code that changed)
function flat(value, path, out, seen = new WeakSet(), depth = 0) {
  if (typeof value === 'string') return void out.set(path, value);
  if (value === null || ['number', 'boolean', 'undefined', 'bigint'].includes(typeof value)) return void out.set(path, `#${typeof value}:${String(value)}`);
  if (typeof value === 'function') return void out.set(path, `#fn:${value.name}`);
  if (typeof value === 'symbol') return void out.set(path, `#sym:${String(value)}`);
  if (value instanceof RegExp) return void out.set(path, `#re:${value}`);
  if (seen.has(value) || depth > 14) return void out.set(path, '#cycle-or-deep');
  seen.add(value);
  if (value instanceof Set) { [...value].forEach((v, i) => flat(v, `${path}{${i}}`, out, seen, depth + 1)); return; }
  if (value instanceof Map) { [...value].forEach(([k, v]) => flat(v, `${path}<${String(k)}>`, out, seen, depth + 1)); return; }
  for (const key of Reflect.ownKeys(value)) if (typeof key === 'string') { out.set(`${path}.${key}#key`, '1'); flat(value[key], `${path}.${key}`, out, seen, depth + 1); }
}
const compareFlat = (where, a, b) => {
  const fa = new Map(), fb = new Map();
  flat(a, '', fa); flat(b, '', fb);
  for (const k of new Set([...fa.keys(), ...fb.keys()])) {
    const x = fa.get(k), y = fb.get(k);
    if (x === y) { if (typeof x === 'string' && !x.startsWith('#') && !k.endsWith('#key')) { stat.stringLeaves++; stat.stringChars += x.length; } else stat.otherLeaves++; continue; }
    if (x === undefined || y === undefined) note('leaf-missing', `${where}${k}`, x ?? '(absent)', y ?? '(absent)');
    else note('leaf-differs', `${where}${k}`, x, y);
  }
};

// A. every export of the eight modules
const exportsOf = (arm, m) => M[arm][m];
const added = {}, removed = {};
for (const m of MODS) {
  const a = exportsOf('main', m), b = exportsOf('branch', m);
  const names = new Set([...Object.keys(a), ...Object.keys(b)]);
  added[m] = Object.keys(b).filter(k => !(k in a)); removed[m] = Object.keys(a).filter(k => !(k in b));
  for (const name of [...names].sort()) {
    if (!(name in a) || !(name in b)) continue;
    stat.exportedNames++;
    compareFlat(`${m}:${name}`, a[name], b[name]);
  }
}

// B. calls with fixed arguments
const both = (where, f) => {
  let ra, rb;
  try { ra = quiet(() => f('main')); } catch (e) { ra = '#throws:' + e.message; }
  try { rb = quiet(() => f('branch')); } catch (e) { rb = '#throws:' + e.message; }
  const sa = typeof ra === 'string' ? ra : JSON.stringify(ra), sb = typeof rb === 'string' ? rb : JSON.stringify(rb);
  stat.calls++; stat.callChars += (sa ?? '').length;
  if (sa !== sb) note('call-differs', where, sa, sb);
  return sa;
};
const LA = 'agents/learn-artifact.js', CD = 'chat-depth.js', PL = 'explanation-planner.js', RF = 'explanation-references.js', ART = 'learn-artifact.js', PR = 'learn-primitives.js', IX = 'explanation-interactions.js', FC = 'explanation-fast-chain.js';
for (const route of ['tools', 'json_schema', undefined]) { both(`artifactSystem(${route})`, a => M[a][LA].artifactSystem(route)); both(`explanationSystem(${route})`, a => M[a][LA].explanationSystem(route)); }
for (const depth of ['brief', 'balanced', 'detailed', 'overview', 'standard', 'deep', undefined, null, 'bogus']) both(`explanationTarget(${depth})`, a => M[a][CD].explanationTarget(depth));
// the "Depth" text as the tool description carries it: heading line + target; branch has a new export for it, main builds it inside learn-artifact.js (checked through the whole request below)

// plan shapes
const ans = (kind, o = {}) => ({ visualType: { choice: o.type ?? 'diagram', confidence: 0.95 }, kind: { choice: kind, confidence: o.conf ?? 0.9, probabilities: o.probs ?? { [kind]: o.conf ?? 0.9, flow: 0.05 } },
  depthTreatment: { choice: 'mechanism', confidence: 0.8 }, needsPlot: { noul: 0.1 }, isPhysical: { noul: o.phys ?? 0.05 }, needsWorkedExample: { noul: 0.1 }, secondVisual: { noul: o.second ?? 0.05 } });
const SHAPES = [
  ['fixed bar-chart balanced', ans('bar-chart'), 'balanced', []],
  ['fixed tree detailed', ans('tree'), 'detailed', []],
  ['fixed flow brief', ans('flow'), 'brief', []],
  ['choose two kinds', ans('flow', { conf: 0.5, probs: { flow: 0.5, comparison: 0.4 } }), 'balanced', []],
  ['picture only', ans('flow', { type: 'picture' }), 'balanced', []],
  ['picture and diagram (physical)', ans('flow', { phys: 0.9 }), 'balanced', []],
  ['physical figure -> picture only', ans('figure', { phys: 0.9 }), 'detailed', []],
  ['two things, diagrams', ans('tree', { second: 0.9, probs: { tree: 0.6, flow: 0.3, layers: 0.1 } }), 'balanced', []],
  ['two things, pictures', ans('flow', { type: 'picture', second: 0.9 }), 'brief', []],
  ['brief replaces a plot kind', ans('coordinate-plot', { probs: { 'coordinate-plot': 0.8, flow: 0.15 } }), 'brief', []],
  ['no depth: inferred treatment', ans('matrix'), null, []],
  ['asked: required tree', ans('bar-chart'), 'balanced', [{ kind: 'diagram', diagramKind: 'tree', purpose: 'x' }]],
  ['asked: required illustration + diagram', ans('flow'), 'detailed', [{ kind: 'illustration', purpose: 'p' }, { kind: 'diagram', purpose: 'q' }]],
  ['asked: required diagram, planned choose', ans('flow', { conf: 0.5, probs: { flow: 0.5, comparison: 0.4 } }), 'balanced', [{ kind: 'diagram', purpose: 'q' }]],
];
const HAND = [['no plan (rules)', null, []], ['hand plan: any diagram', { planner: 'jev', visuals: [{ type: 'diagram' }] }, []], ['hand plan: no visuals', { planner: 'jev', visuals: [] }, []], ['hand plan: non-jev', { planner: 'x', visuals: [{ type: 'picture' }] }, []]];
const planCases = [];
for (const [label, answers, depth, asked] of SHAPES) planCases.push([label, answers, depth, asked]);
for (const [label, plan, asked] of HAND) planCases.push([label, { plan }, null, asked]);
let shapesChecked = 0;
for (const [label, answers, depth, asked] of planCases) {
  const mk = a => (answers.plan !== undefined ? answers.plan : M[a][PL].planFromAnswers(answers, depth));
  both(`planFromAnswers ${label}`, a => mk(a));
  both(`visualsStatement ${label}`, a => { const plan = mk(a); const r = M[a][PL].cardVisuals(plan, asked); return { r, s: M[a][PL].visualsStatement(plan, r) }; });
  both(`planShape ${label}`, a => { const plan = mk(a); return M[a][PL].planShape({ kind: plan?.kind }, depth ?? 'balanced'); });
  shapesChecked++;
}
for (const kind of ['flow', 'tree', 'bar-chart', 'matrix', 'figure', 'sequence', 'cycle', 'layers', 'block-stack', 'token-links', 'tensor', 'nonsense']) for (const depth of ['brief', 'balanced', 'detailed']) both(`planShape ${kind} ${depth}`, a => M[a][PL].planShape({ kind }, depth));

// the reference context (the "# Examples" headings) for stored, seeded and detailSpec lists
const refs = M.branch.lib.diagramReferences;
const withDetail = refs.filter(r => r.detailSpec).slice(0, 3);
const sets = [['empty', []], ['one stored', [refs[0]]], ['three stored', refs.slice(0, 3)], ['seeded', refs.slice(3, 6).map(r => ({ ...r, seededExample: true }))], ['mixed seeded', [{ ...refs[0], seededExample: true }, refs[1]]], ['detailSpec', withDetail], ['shape first', [{ id: 'shape-flow', useWhen: 'u', spec: refs[0].spec, shape: true }, refs[1]]]];
for (const [label, set] of sets) both(`diagramReferenceContext ${label}`, a => M[a][RF].diagramReferenceContext(set));

// C. the requests: every command x depth x env x plan x seed (system, tools, messages, diagram references, then the fast chain's step requests)
const envs = {
  tools: { SMALL_ENV: 'test' },
  toolsPlanner: { SMALL_ENV: 'test', EXPLANATION_PLANNER: 'jev', TYPESAFE_API_KEY: 'x', EXPLANATION_INTERACTIONS: 'true' },
  gemini: { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'google-low', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', EXPLANATION_INTERACTIONS: 'true' },
  geminiNoInteractions: { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'google-low', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x' },
  fireworksFormula: { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'fireworks-low', FIREWORKS_API_KEY: 'x', GEMINI_API_KEY: 'x', EXPLANATION_FORMULA_SAMPLER: 'on', EXPLANATION_INTERACTIONS: 'true' },
  toolsFormula: { SMALL_ENV: 'test', EXPLANATION_FORMULA_SAMPLER: 'on' },
};
const PROMPTS = ['Does top-k filtering affect the reported probability of the chosen token?', 'How does a volcano erupt?', 'Compare a stack and a queue', 'What is the Gini impurity of a split?', 'Explain how TCP handshakes work', 'Why is the sky blue', 'quicksort versus mergesort', 'Show me the cross-entropy loss with a worked example', 'x'];
const commands = M.branch.slash.SLASH.map(c => c.name);
const planFor = (arm, i) => { const [, answers, depth] = planCases[i]; return answers.plan !== undefined ? answers.plan : M[arm][PL].planFromAnswers(answers, depth); };
const bodies = (arm, env, input, opts = {}) => {
  const r = M[arm][ART].prepareArtifactAuthorRequest(env, input, opts);
  if (!r.body) return JSON.stringify(r);
  const out = { body: r.body, diagramReferences: r.diagramReferences, ready: r.ready, model: r.model, seed: r.requestSeed };
  for (const [provider, model] of [['google', 'g'], ['fireworks', 'f']]) { try { out[provider] = M[arm][FC].stepRequest({ provider, model }, 'low', r.body); } catch (e) { out[provider] = '#refused:' + (e.code ?? e.message).toString().slice(0, 40); } }
  return JSON.stringify(out);
};
const sweep = (label, arms) => {
  const a = arms.main, b = arms.branch;
  stat.requests++; stat.requestChars += a.length;
  if (a !== b) note('request-differs', label, a.length, b.length);
};
let planned = 0;
for (const [envName, env] of Object.entries(envs)) {
  for (const command of commands) {
    for (const depth of ['brief', 'balanced', 'detailed', 'standard', undefined]) {
      for (const [p, prompt] of PROMPTS.entries()) {
        if (command !== 'explanation' && (p > 2 || !['tools', 'gemini'].includes(envName) || !['brief', 'balanced', 'detailed'].includes(depth))) continue; // other commands: three prompts, two envs; the explanation: all nine
        for (const seed of command === 'explanation' ? [undefined, 'seed-a'] : [undefined]) {
          const input = { command, args: prompt, depth, ...(seed ? { requestSeed: seed } : {}) };
          const arms = {}; let ok = true;
          for (const arm of ['main', 'branch']) { try { arms[arm] = quiet(() => bodies(arm, env, input)); } catch (e) { arms[arm] = '#throws:' + e.message; } }
          sweep(`${envName}/${command}/${depth}/${p}/${seed}`, arms);
        }
      }
    }
  }
}
// planned explanation: every plan shape x depth x env x seed, plus image source, system suffix, selection and context
const exEnvs = ['tools', 'toolsPlanner', 'gemini', 'geminiNoInteractions', 'fireworksFormula', 'toolsFormula'];
for (const envName of exEnvs) for (const [i, [label, , , asked]] of planCases.entries()) for (const depth of ['brief', 'balanced', 'detailed', undefined]) for (const prompt of PROMPTS.slice(0, 5)) for (const seed of [undefined, 'seed-b']) {
  const arms = {};
  for (const arm of ['main', 'branch']) { try { arms[arm] = quiet(() => bodies(arm, envs[envName], { command: 'explanation', args: prompt, depth, plan: planFor(arm, i), planned: true, ...(asked.length ? { visualRequirements: { items: asked.map((x, n) => ({ id: `v${n}`, ...x })) } } : {}), ...(seed ? { requestSeed: seed } : {}) })); } catch (e) { arms[arm] = '#throws:' + e.message; } }
  planned++; sweep(`planned ${envName}/${label}/${depth}/${prompt.slice(0, 20)}/${seed}`, arms);
}
for (const [label, extra, opts] of [['systemSuffix', {}, { systemSuffix: 'SUFFIX LINE' }], ['imageSource', { imageSource: { id: 'img1' } }, {}], ['selection+context', { selection: { type: 'card', id: 'c1', text: 'sel' }, context: 'ctx text' }, {}], ['only explanation', {}, { only: ['explanation'] }]]) {
  for (const envName of exEnvs) for (const command of commands) {
    const arms = {};
    for (const arm of ['main', 'branch']) { try { arms[arm] = quiet(() => bodies(arm, envs[envName], { command, args: PROMPTS[0], depth: 'detailed', ...extra }, opts)); } catch (e) { arms[arm] = '#throws:' + e.message; } }
    sweep(`${label}/${envName}/${command}`, arms);
  }
}
// ARTIFACT_SYSTEM and the primitive tool text for EVERY primitive: each primitive alone (only=[id]) under every command that offers it
const ids = Object.keys(M.branch[PR].PRIMITIVES);
let primPairs = 0;
for (const id of ids) for (const command of commands) for (const envName of ['tools', 'gemini']) {
  const arms = {};
  for (const arm of ['main', 'branch']) { try { arms[arm] = quiet(() => bodies(arm, envs[envName], { command, args: 'explain', depth: 'balanced' }, { only: [id] })); } catch (e) { arms[arm] = '#throws:' + e.message; } }
  primPairs++; sweep(`only=[${id}]/${envName}/${command}`, arms);
}
both('ARTIFACT_SYSTEM', a => M[a][ART].ARTIFACT_SYSTEM);
both('primitives: about + schema text per primitive', a => Object.fromEntries(Object.entries(M[a][PR].PRIMITIVES).map(([id, p]) => [id, [p.about, JSON.stringify(p.schema)]])));
const result = { stat, shapesChecked, plannedRequests: planned, primitiveCommandPairs: primPairs, primitives: ids, commands: commands.length, added, removed, diffCount: diffs.length, diffs: diffs.slice(0, 80) };
writeFileSync(outFile, JSON.stringify(result, null, 1));
realLog(JSON.stringify({ stat, shapesChecked, plannedRequests: planned, primitiveCommandPairs: primPairs, primitives: ids.length, commands: commands.length, added, removed, diffCount: diffs.length }, null, 1));
realLog('FIRST DIFFS', JSON.stringify(diffs.slice(0, 10), null, 1));
process.exit(diffs.length ? 1 : 0);
