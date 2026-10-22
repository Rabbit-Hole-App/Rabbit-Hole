// The /explain M3 flow as one function for dev scripts (e2e-demo.mjs, corpus-run.mjs): author -> validate/compile ->
// repair while refused (shared ceiling) -> render both themes -> image review -> repair on findings -> re-render.
// Uses Lane C's stages (explain-author.js, explain-repair.js, explain-policy.js) and Lane D's render and review, so it
// runs only in a tree that has explain/c-m3 (or c-t19) plus explain/d-t18.
import { join } from 'node:path';
import { HERE } from './cases.mjs';

const cp = name => import(`../../packages/control-plane/src/${name}`);

// The captures the product job reviews (explain-job.js renderStage): every part of a paged card, both themes while
// parts x 2 fits one review (6 images), else light only; dpr 1. t22-p1 captured themes only, so a paged card's review saw part 0.
export function captureEntries(scene, round, themes = ['light', 'dark'], maxCaptures = 6) {
  const parts = scene.exampleData?.partTitles?.length || 1;
  const shown = parts * themes.length <= maxCaptures ? themes : themes.slice(0, 1);
  const entries = [];
  for (let part = 0; part < parts; part++) for (const theme of shown) entries.push({ id: `${parts > 1 ? `p${part}-` : ''}${theme}-r${round}`, theme, ...(parts > 1 ? { inputs: { part } } : {}) });
  return entries;
}

// ctx: { env, call(role, request) }. save(name, value) records each artifact; ledger counts calls for stage timing.
export async function runFlow(prompt, { ctx, save = () => {}, ledger = { calls: [] }, dist = join(HERE, '..', '..', 'packages', 'web', 'dist-render'), themes = ['light', 'dark'] }) {
  const { authorStage, validateStage } = await cp('explain-author.js');
  const { repairStage } = await cp('explain-repair.js').catch(() => ({ repairStage: null }));
  const { EXPLAIN_LIMITS } = await cp('explain-policy.js');
  const { reviewCaptures } = await cp('explain-review.js');
  const { compiledHash } = await cp('explain-render.js');
  const { captureScene } = await import('../../packages/web/e2e/viz-benchmark-capture.mjs');
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
    const rendered = await timed(`render-r${job.round}`, () => captureScene(out.compiled.scene, captureEntries(out.compiled.scene, job.round, themes), { dist, dpr: 1 }));
    out.captures = rendered.captures;
    job.captures = rendered.captures.map(c => ({ id: c.id, compiledHash: hash, theme: c.theme, time: c.time, inputs: c.inputs, png: c.png, data: Buffer.from(c.png).toString('base64'), mediaType: 'image/png' }));
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
