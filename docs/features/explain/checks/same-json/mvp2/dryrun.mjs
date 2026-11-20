// MVP2 dry run, NO provider call. For each of the five prompts: the AFTER2 request (feat/same-json-mvp2) carries its stored reference with the numbers removed and the shape example unchanged;
// against the MVP1 AFTER request the only differences are the reference line and the added heading sentence.
// usage: node dryrun.mjs [plan.json] [trees]
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const plan = JSON.parse(fs.readFileSync(process.argv[2] ?? 'plan.json', 'utf8')), TREES = process.argv[3] ?? 'C:/s/same-json-trees';
const imp = (arm, f) => import(pathToFileURL(`${TREES}/${arm}/packages/control-plane/src/${f}`).href);
const T = {};
for (const arm of ['after', 'after2']) { const [art, pl, fc, refs] = await Promise.all([imp(arm, 'learn-artifact.js'), imp(arm, 'explanation-planner.js'), imp(arm, 'explanation-fast-chain.js'), imp(arm, 'explanation-references.js')]); T[arm] = { art, pl, assembled: fc.assembledSystem, refs }; }
const env = { SMALL_ENV: 'dev', EXPLANATION_MODEL_PROFILE: 'google-low', EXPLANATION_PLANNER: 'jev', EXPLANATION_INTERACTIONS: 'true', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', TYPESAFE_API_KEY: 'x' };
const quiet = f => { const log = console.log; console.log = () => {}; try { return f(); } finally { console.log = log; } };
const answers = kind => ({ visualType: { choice: 'diagram', confidence: 0.95 }, kind: { choice: kind, confidence: 0.9, probabilities: { [kind]: 0.9, flow: 0.05 } }, depthTreatment: { choice: 'mechanism' }, isPhysical: { noul: 0.05 }, needsPlot: { noul: 0.1 }, needsWorkedExample: { noul: 0.1 }, secondVisual: { noul: 0.05 } });
const walk = (o, f, key = '') => { f(o, key); if (Array.isArray(o)) o.forEach(x => walk(x, f, key)); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, f, k); };
const SENTENCE = ' A "?" in an example stands for a number that was removed: choose your own.';
const prompts = [...new Map(plan.items.map(i => [i.tag, i])).values()];
const out = []; let bad = 0, topk = '';
for (const p of prompts) {
  const per = {};
  for (const arm of ['after', 'after2']) {
    const { art, pl, assembled } = T[arm];
    const input = quiet(() => art.planWithReferenceKind({ command: 'explanation', args: p.prompt, selection: null, context: null, depth: 'balanced', requestSeed: 'dry-1', plan: pl.planFromAnswers(answers(p.expectedKind), 'balanced') }));
    const req = quiet(() => art.prepareArtifactAuthorRequest(env, input));
    const sys = assembled(req.body), at = sys.indexOf('\n# Examples\n'), block = at >= 0 ? sys.slice(at) : '';
    per[arm] = { req, sys, block, lines: block.split('\n').filter(l => l.startsWith('{')), refs: req.diagramReferences.filter(r => !r.shape && !r.seededExample), shape: req.diagramReferences.find(r => r.shape) };
  }
  const A = per.after, B = per.after2;
  const refLineA = A.lines.find(l => l.startsWith('{"id":"' + p.refId + '"')), refLineB = B.lines.find(l => l.startsWith('{"id":"' + p.refId + '"'));
  const shapeLineA = A.lines.find(l => l.startsWith('{"id":"shape-')), shapeLineB = B.lines.find(l => l.startsWith('{"id":"shape-'));
  const parsed = refLineB ? JSON.parse(refLineB) : null;
  let numbersLeft = 0, questionMarks = 0, digitStrings = [];
  if (parsed) for (const spec of [parsed.spec, parsed.detailSpec].filter(Boolean)) walk(spec.diagram, (v, k) => { if (typeof v === 'number') numbersLeft++; if (v === '?') questionMarks++; if (typeof v === 'string' && /[0-9]/.test(v)) digitStrings.push(k + ': ' + v.slice(0, 40)); });
  const restored = B.sys.replace(refLineB, () => refLineA).replace(SENTENCE, '');
  const refObjectUntouched = JSON.stringify(B.refs.map(r => r.spec)) === JSON.stringify(A.refs.map(r => r.spec)) && B.refs.every(r => JSON.stringify(r.spec).match(/[0-9]/));
  const ok = Boolean(refLineA && refLineB && shapeLineA && shapeLineA === shapeLineB && parsed?.spec?.version === 1 && numbersLeft === 0 && questionMarks > 0 && restored === A.sys && refObjectUntouched && B.refs.map(r => r.id).join() === p.refId && B.shape?.id === 'shape-' + p.expectedKind && B.sys.includes(SENTENCE.trim()));
  if (!ok) bad++;
  if (p.tag === 'top-k') topk = B.block;
  out.push({ tag: p.tag, ok, refId: p.refId, shapeId: B.shape?.id, versionKept: parsed?.spec?.version, numbersLeftInDiagram: numbersLeft, questionMarks, stringsWithDigitsLeft: digitStrings, onlyRefLineAndSentenceDiffer: restored === A.sys, referenceObjectUntouched: refObjectUntouched, shapeLineIdentical: shapeLineA === shapeLineB, systemChars: { after: A.sys.length, after2: B.sys.length } });
}
fs.writeFileSync('dryrun.json', JSON.stringify(out, null, 1));
fs.writeFileSync('topk-examples-block.txt', topk);
for (const o of out) console.log(`${o.ok ? 'OK ' : 'BAD'} ${o.tag}: ref ${o.refId} | shape ${o.shapeId} unchanged ${o.shapeLineIdentical} | numbers left ${o.numbersLeftInDiagram}, "?" ${o.questionMarks}, digit strings left ${JSON.stringify(o.stringsWithDigitsLeft)} | system ${o.systemChars.after} -> ${o.systemChars.after2} chars | only ref line and sentence differ: ${o.onlyRefLineAndSentenceDiffer}`);
console.log(bad ? `FAILED: ${bad} of ${out.length}` : `all ${out.length} prompts ok; no provider call made`);
process.exit(bad ? 1 : 0);
