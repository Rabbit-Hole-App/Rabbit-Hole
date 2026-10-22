// The /explain M3 flow as one function for dev scripts (e2e-demo.mjs, corpus-run.mjs): author -> validate/compile ->
// repair while refused (shared ceiling) -> render the job's capture manifest -> image review -> repair on findings -> re-render.
// Uses Lane C's stages (explain-author.js, explain-repair.js, explain-policy.js) and Lane D's render and review, so it
// runs only in a tree that has explain/c-m3 (or c-t19) plus explain/d-t18.
import { join } from 'node:path';
import { HERE } from './cases.mjs';

const cp = name => import(`../../packages/control-plane/src/${name}`);

// The captures the product job reviews: production's own capture manifest, built as explain-job.js renderStage builds it
// (explain-render.js captureManifest within reserveRound of the round's review images), so every part, step, experiment
// value and combined state, the frame-hash dedup and the over-budget refusal are the job's, not a copy (EXP-12). An
// over-budget card rejects with code over_budget, as in production. Ids gain the round so later rounds keep earlier files.
export async function productionManifest(scene, themes = ['light', 'dark']) {
  const { captureManifest, reserveRound } = await cp('explain-render.js');
  const { EXPLAIN_LIMITS } = await cp('explain-policy.js');
  return captureManifest(scene, { reserved: reserveRound({ cap: EXPLAIN_LIMITS.render.capturesPerRound }), themes });
}
export async function captureEntries(scene, round, themes = ['light', 'dark']) {
  return (await productionManifest(scene, themes)).entries.map(entry => ({ ...entry, id: `${entry.id}-r${round}` }));
}

// ctx: { env, call(role, request) }. save(name, value) records each artifact; ledger counts calls for stage timing.
// capture(scene, entries, { dist, dpr }) -> { captures } defaults to viz-benchmark-capture.mjs captureScene (a local browser).
export async function runFlow(prompt, { ctx, save = () => {}, ledger = { calls: [] }, dist = join(HERE, '..', '..', 'packages', 'web', 'dist-render'), themes = ['light', 'dark'], capture = null }) {
  const { authorStage, validateStage } = await cp('explain-author.js');
  const { repairStage } = await cp('explain-repair.js').catch(() => ({ repairStage: null }));
  const { EXPLAIN_LIMITS } = await cp('explain-policy.js');
  const { reviewCaptures } = await cp('explain-review.js');
  const { compiledHash } = await cp('explain-render.js');
  const captureScene = capture || (await import('../../packages/web/e2e/viz-benchmark-capture.mjs')).captureScene;
  const stages = [];
  const timed = async (stage, fn) => { const t = Date.now(); try { return await fn(); } finally { stages.push({ stage, ms: Date.now() - t, calls: ledger.calls.length }); } };
  const job = { prompt, round: 0, findings: [], captures: [], examples: [], evidence: [] };
  const out = { result: 'unknown', accepted: false, spec: null, compiled: null, review: null, captures: [], stages, gap: null, stop: null };
  const authored = await timed('author', () => authorStage(job, ctx));
  if (authored.gap) { out.result = 'gap'; out.gap = authored.gap; }
  let spec = authored.spec || null;
  while (spec && out.result === 'unknown') {
    out.spec = spec;
    save(`spec-r${job.round}.json`, spec);
    const checked = await timed(`validate-r${job.round}`, async () => validateStage({ ...job, spec }));
    if (checked.gap) { out.result = 'gap'; out.gap = checked.gap; break; }
    if (checked.problems) {
      job.findings.push({ problems: checked.problems });
      save(`problems-r${job.round}.json`, checked.problems);
      if (!repairStage || job.round >= EXPLAIN_LIMITS.correctionRounds) { out.result = 'invalid'; break; }
      const repaired = await timed(`repair-r${job.round + 1}`, () => repairStage({ ...job, spec }, ctx));
      job.round++;
      if (!repaired.progress) { out.result = 'repair_stopped'; out.stop = repaired; break; }
      spec = repaired.spec;
      continue;
    }
    out.compiled = checked.compiled;
    save(`compiled-scene-r${job.round}.json`, out.compiled.scene);
    const hash = await compiledHash(out.compiled.scene);
    let entries;
    try { entries = await captureEntries(out.compiled.scene, job.round, themes); }
    catch (error) { if (error.code !== 'over_budget') throw error; out.result = 'over_budget'; out.stop = { reason: error.message }; break; }
    const rendered = await timed(`render-r${job.round}`, () => captureScene(out.compiled.scene, entries, { dist, dpr: 1 }));
    out.captures = rendered.captures;
    // As renderStage hands them on: every field the render returned (step, aliases included), with the pixels.
    job.captures = rendered.captures.map(c => ({ ...c, compiledHash: hash, data: Buffer.from(c.png).toString('base64'), mediaType: 'image/png' }));
    out.review = await timed(`review-r${job.round}`, () => reviewCaptures({ request: prompt, compiledHash: hash, captures: job.captures }, { callRole: ctx.call }).catch(error => ({ error: `${error.code || ''} ${error.message}` })));
    save(`review-r${job.round}.json`, out.review);
    if (out.review.error) { out.result = 'review_failed'; break; }
    if (out.review.accepted) { out.accepted = true; out.result = 'accepted'; break; }
    // Lane C's repair reads target.state as the capture id.
    job.findings.push({ findings: out.review.captures.flatMap(c => c.findings.map(f => ({ ...f, target: { ...f.target, state: c.captureId } }))) });
    if (!repairStage || job.round >= EXPLAIN_LIMITS.correctionRounds) { out.result = 'not_accepted'; break; }
    const repaired = await timed(`repair-r${job.round + 1}`, () => repairStage({ ...job, spec }, ctx));
    job.round++;
    if (!repaired.progress) { out.result = 'repair_stopped'; out.stop = repaired; break; }
    spec = repaired.spec;
  }
  out.rounds = job.round;
  return out;
}
