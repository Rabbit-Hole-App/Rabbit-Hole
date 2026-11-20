// MVP1 dry run, NO provider call. For each of the five prompts, in both arms: the author request built offline carries its reference and the shape example of the planned kind;
// the BEFORE and AFTER system texts differ in exactly the two Fix sentences. usage: node dryrun.mjs [plan.json] [trees]
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const plan = JSON.parse(fs.readFileSync(process.argv[2] ?? 'plan.json', 'utf8')), TREES = process.argv[3] ?? 'C:/s/same-json-trees';
const fc = {}; // the text Gemini is sent: assembledSystem of explanation-fast-chain.js
const imp = (arm, f) => import(pathToFileURL(`${TREES}/${arm}/packages/control-plane/src/${f}`).href);
const T = {};
for (const arm of ['before', 'after']) { const [art, pl, ag, f] = await Promise.all([imp(arm, 'learn-artifact.js'), imp(arm, 'explanation-planner.js'), imp(arm, 'agents/learn-artifact.js'), imp(arm, 'explanation-fast-chain.js')]); T[arm] = { art, pl, ag }; fc[arm] = f.assembledSystem; }
const env = { SMALL_ENV: 'dev', EXPLANATION_MODEL_PROFILE: 'google-low', EXPLANATION_PLANNER: 'jev', EXPLANATION_INTERACTIONS: 'true', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', TYPESAFE_API_KEY: 'x' };
const quiet = f => { const log = console.log; console.log = () => {}; try { return f(); } finally { console.log = log; } };
const answers = kind => ({ visualType: { choice: 'diagram', confidence: 0.95 }, kind: { choice: kind, confidence: 0.9, probabilities: { [kind]: 0.9, flow: 0.05 } }, depthTreatment: { choice: 'mechanism' }, isPhysical: { noul: 0.05 }, needsPlot: { noul: 0.1 }, needsWorkedExample: { noul: 0.1 }, secondVisual: { noul: 0.05 } });
const prompts = [...new Map(plan.items.map(i => [i.tag, i])).values()];
const out = []; let bad = 0;
const sysOf = (req, arm) => fc[arm](req.body);
for (const p of prompts) {
  const per = {};
  for (const arm of ['before', 'after']) {
    const { art, pl } = T[arm];
    const input0 = { command: 'explanation', args: p.prompt, selection: null, context: null, depth: 'balanced', requestSeed: 'dry-1', plan: pl.planFromAnswers(answers(p.expectedKind), 'balanced') };
    const input = quiet(() => art.planWithReferenceKind(input0));
    const req = quiet(() => art.prepareArtifactAuthorRequest(env, input));
    const refs = req.diagramReferences.filter(r => !r.shape && !r.seededExample), shape = req.diagramReferences.find(r => r.shape), sys = sysOf(req, arm);
    per[arm] = { planKind: input.plan.kind, kindSource: input.plan.kindSource ?? null, references: refs.map(r => r.id), shapeId: shape?.id ?? null, seeded: req.diagramReferences.some(r => r.seededExample), systemChars: sys.length, sys,
      referenceLineInSystem: refs.every(r => sys.includes(JSON.stringify({ id: r.id, useWhen: r.useWhen, spec: r.spec, ...(r.detailSpec ? { detailSpec: r.detailSpec } : {}) }))), shapeLineInSystem: shape ? sys.includes('"id":"' + shape.id + '"') : false };
  }
  // the two Fix sentences are the only difference: put BEFORE's sentences into AFTER and the texts must be identical
  const b = per.before.sys, a = per.after.sys, bAg = T.before.ag, aAg = T.after.ag;
  const NEWH = "An example on this card's subject shows a correct structure: keep its structure and its facts. Write your own version of what is illustrative in it: the example items, their names, the input values and the title. Do not copy an example's values, labels or prose, force a reference, or exceed this card's visual count.";
  const OLDH = "Use their supported structure and layout when appropriate. Adapt labels and relationships to the learner's question. Do not copy example prose, force a reference, or exceed this card's visual count.";
  const restored = a.split(aAg.EXPLANATION_NUMBER_RULE).join(bAg.NUMBER_RULE).split(NEWH).join(OLDH);
  const onlyTwo = restored === b, nA = a.split(aAg.EXPLANATION_NUMBER_RULE).length - 1, nH = a.split(NEWH).length - 1;
  const ok = per.before.references.length === 1 && per.before.references[0] === p.refId && per.after.references.join() === p.refId && per.before.shapeId === 'shape-' + p.expectedKind && per.after.shapeId === per.before.shapeId && per.before.referenceLineInSystem && per.after.referenceLineInSystem && per.before.shapeLineInSystem && per.after.shapeLineInSystem && !per.before.seeded && !per.after.seeded && per.before.kindSource === per.after.kindSource && onlyTwo && nA === 1 && nH === 1;
  if (!ok) bad++;
  out.push({ tag: p.tag, prompt: p.prompt, expectedRef: p.refId, expectedKind: p.expectedKind, ok, onlyTwoSentencesDiffer: onlyTwo, newNumberRuleCountAfter: nA, newHeadingCountAfter: nH, before: { ...per.before, sys: undefined }, after: { ...per.after, sys: undefined } });
}
fs.writeFileSync('dryrun.json', JSON.stringify(out, null, 1));
for (const o of out) console.log(`${o.ok ? 'OK ' : 'BAD'} ${o.tag}: ref ${o.after.references.join(',')} | shape ${o.after.shapeId} | planKind ${o.before.planKind} (${o.before.kindSource ?? 'planner'}) | system ${o.before.systemChars} -> ${o.after.systemChars} chars | only the two sentences differ: ${o.onlyTwoSentencesDiffer}`);
console.log(bad ? `FAILED: ${bad} of ${out.length}` : `all ${out.length} prompts: the request carries its reference and the shape example in both arms; no provider call made`);
process.exit(bad ? 1 : 0);
