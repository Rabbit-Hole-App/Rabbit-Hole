// The /interact build stages of the durable job (INT-04, INT-05, INT-07B; docs/features/interact.md). explain-job.js (ExplainJobs) owns persistence,
// fencing, admission, timing and retry; this module is the stage BODIES for a job whose flow is the scene-plan flow and whose plan was approved:
//   authoring  -> buildStage     one build_author call (interact-build.js buildScene): sealed artifacts + the compiled CardComposition, or problems
//   validating -> validateStage  no model call: the stored candidate is still the composition's, and the composition is the approved plan's
//   rendering  -> renderStage    capture every planned state through the existing render service (captureCardFor), then the deterministic checks
//   reviewing  -> reviewStage    the independent rendered review of those captures (interact-checks.js reviewCandidate)
//   repairing  -> repairStage    one build_repair call (interact-checks.js repairRound) and the same trusted validation a first build gets
// Every stage returns a plain result; apply() in explain-job.js stores it under the job's fence. The bounds (three correction rounds shared across
// validation, render and review; the role call ceilings) are the job's own, the same ones the shared runner uses.
import { canonicalJson } from '../../web/src/explain-contract.js';
import { resolveSupportInputs, verifyComposition } from '../../web/src/interact-composition.js';
import { capabilityGap } from './explain-author.js';
import * as explainRender from './explain-render.js';
import { buildScene } from './interact-build.js';
import { CHECK_LIMITS, buildPlanCaptureCases, captureAndCheck, repairRound, reviewCandidate } from './interact-checks.js';
import { interactOracle } from './interact-oracle.js';
import { learnMedia } from './learn-storage.js';

const fail = (message, status, code) => Object.assign(new Error(message), { status, ...(code ? { code } : {}) });

// What the build functions of interact-build.js and interact-checks.js call a job: the APPROVED plan and its hash (never anything a model wrote).
export const planJob = (job, ctx, extra = {}) => {
  const d = job.design;
  if (!d?.finalHash || job.approval?.scenePlanHash !== d.finalHash) throw Object.assign(fail('This job has no approved scene plan; nothing was built.', 409, 'not_approved'), { stopReason: 'not_approved', category: 'internal' });
  return { id: job.id, plan: d.plan, planHash: d.finalHash, capabilities: ctx.capabilities, evidence: job.evidence || [], oracle: interactOracle(d.plan), ...extra };
};

// ponytail: a card with a declarative (spec) panel cannot be delivered yet. The card UI resolves a supporting panel's artifact as a program, and a spec main has
// no saved-program block; the canonical Standard and Deep are program/program. Refused BEFORE any model call so nothing is spent on a card that cannot open.
export const undeliverable = plan => {
  const panel = [['the main scene', plan.scene.runtime], ...plan.supportingVisuals.map(s => [`the "${s.title}" panel`, s.runtime])].find(([, runtime]) => runtime.renderer !== 'program');
  return panel ? `${panel[0]} was approved as a declarative scene, and a composed card with a declarative panel is not wired into the card yet (program panels only)` : null;
};

export async function buildStage(job, ctx) {
  const problem = undeliverable(job.design.plan);
  if (problem) return { gap: capabilityGap(['other'], problem, 'builder') };
  return outcome(await buildScene(planJob(job, ctx), ctx.role));
}
const outcome = r => (r.gap ? { gap: r.gap } : r.problems ? { problems: r.problems, details: r.details, category: 'spec', repairable: true, draft: r.draft } : { artifacts: r.artifacts, composition: r.composition, draft: r.draft });

export async function validateStage(job, ctx) {
  const { artifacts, composition } = ctx.build;
  const j = planJob(job, ctx), intact = await verifyComposition(composition, artifacts);
  if (intact.length) return { problems: intact.map(p => `${p.path}: ${p.message}`), category: 'spec', repairable: true };
  if (composition.planHash !== j.planHash) return { problems: ['the composition is not the approved plan\'s'], category: 'spec', repairable: true };
  return {};
}

// The stored capture records hold the pixels' key and hash and the runtime traces, never bytes; the review reads the bytes back from LEARN_MEDIA by key.
const slim = c => ({ caseId: c.caseId, key: c.key ?? null, sha256: c.sha256 ?? null, compositionHash: c.compositionHash, completeCard: c.completeCard === true, bundleHash: c.bundleHash ?? null, trace: c.trace,
  supports: Object.fromEntries(Object.entries(c.supports ?? {}).map(([id, s]) => [id, { key: s.key ?? null, sha256: s.sha256 ?? null, bundleHash: s.bundleHash ?? null, trace: s.trace }])) });

export async function renderStage(job, ctx) {
  const { artifacts, composition } = ctx.build;
  const a = await captureAndCheck(planJob(job, ctx, { artifacts, composition }), ctx.role);
  if (a.status === 'cancelled') return {};
  if (a.status === 'incomplete') return { incomplete: a.reason };
  if (a.status === 'render_unavailable') throw Object.assign(fail('The explanation could not be rendered (render_unavailable). Retry rendering.', 503, 'render_unavailable'), { category: 'renderer' });
  if (a.status === 'failed') return { problems: a.failure.problems, details: a.failure.details, failure: a.failure, category: 'spec', repairable: true, renders: [], check: a.check ?? null, captures: a.captures ? a.captures.map(c => ({ caseId: c.caseId, sha256: c.sha256 })) : null };
  return { captured: a.captures.map(slim), check: a.det.coverage, renders: a.captures.map(() => ({ ok: true })) };
}

export async function reviewStage(job, ctx) {
  const { artifacts, composition, captures } = ctx.build;
  const media = learnMedia(ctx.env), bytes = async key => { const object = key && await media?.get(key); return object ? new Uint8Array(await object.arrayBuffer()) : null; };
  const loaded = [];
  for (const c of captures) {
    const png = await bytes(c.key);
    if (!png) throw Object.assign(fail('The rendered pictures are no longer stored. Retry rendering.', 503, 'missing_pixels'), { category: 'renderer' });
    const supports = {};
    for (const [id, s] of Object.entries(c.supports)) {
      const got = await bytes(s.key);
      if (!got) throw Object.assign(fail('The rendered pictures are no longer stored. Retry rendering.', 503, 'missing_pixels'), { category: 'renderer' }); // a support panel that is not shown is not reviewed, so it is not accepted
      supports[id] = { ...s, png: got };
    }
    loaded.push({ ...c, png, supports });
  }
  const j = planJob(job, ctx, { artifacts, composition });
  const limit = Math.min(CHECK_LIMITS.maxCases, ctx.role.profile?.roles?.build_review?.maxImages ?? CHECK_LIMITS.maxCases) - (ctx.role.completeCardUnavailable === true ? j.plan.supportingVisuals.length : 0);
  const { cases, probes, coverage } = buildPlanCaptureCases(j.plan, composition, artifacts, { limit });
  const r = await reviewCandidate(j, ctx.role, { cases: [...cases], probes, captures: loaded, coverage, det: { coverage: job.build.check ?? null }, summary: [], pngs: [] }).catch(error => { if (error.cause) throw error.cause; throw error; });
  if (r.status === 'incomplete') return { incomplete: r.reason };
  if (r.status === 'ready') return { accepted: true, findings: [], review: r.review.captures.map(c => ({ captureId: c.captureId, semantic: c.semantic, visual: c.visual })) };
  const serious = r.failure.findings;
  return { accepted: false, findings: serious, category: serious[0]?.category || 'spec', repairable: true, failure: r.failure, imagesReviewed: loaded.length };
}

export async function repairStage(job, ctx) {
  const { draft, artifacts, composition, captures } = ctx.build;
  const failure = job.build.failure ?? { stage: 'validate', problems: [], findings: [] };
  const named = new Set((failure.findings || []).map(f => f.target?.capture).filter(Boolean));
  const media = learnMedia(ctx.env), withPixels = [];
  for (const c of captures || []) if (named.has(c.caseId) && c.key) { const object = await media?.get(c.key); if (object) withPixels.push({ caseId: c.caseId, png: new Uint8Array(await object.arrayBuffer()) }); }
  // job.round is already the round now being made (repairOrStop counted it); repairRound counts the rounds already used.
  const r = await repairRound(planJob(job, ctx, { artifacts, composition, draft, failure, round: job.round - 1, captures: withPixels }), ctx.role);
  if (r.status === 'cancelled') return {};
  if (r.status === 'gap') return { gap: r.gap };
  if (r.status === 'exhausted') return { rejected: true, operation: 'exhausted', reason: r.reason };
  if (r.status === 'no_progress') return { progress: false, operation: 'none', reason: r.reason };
  if (r.status === 'repaired_invalid') return { invalid: true, draft: r.draft, failure: r.failure, operation: 'artifacts' };
  return { repaired: true, draft: r.draft, artifacts: r.artifacts, composition: r.composition, operation: 'artifacts' };
}

export const interactBuildPipeline = Object.freeze({ buildScene: buildStage, validate: validateStage, render: renderStage, review: reviewStage, repair: repairStage });

// ---- the capture seam over the existing render path (INT-05-C05; see the ponytail above INTERACT_REVIEW_RULES in interact-checks.js) --------------------
// captureCardFor(env, deps)({ composition, artifacts, cases }) -> one capture per case, as checkRound requires:
//   { caseId, png, sha256, key, compositionHash, completeCard:false, bundleHash, trace:{inputs,time,quantities,readouts,texts,frameHash}, supports:{id:{bundleHash,png,sha256,key,trace}} }
// The main program is drawn at each case's elapsed time and inputs, and each supporting panel once per distinct bound input state (time zero), all through
// renderStates (the sealed artifact in the pinned engine, the real Frame, light theme) in ONE browser session. Nothing here composes the card: completeCard is
// false and the caller says so with ctx.completeCardUnavailable. deps: { launch, browser, store, render, limits } as renderStates takes them.
export function captureCardFor(env, { jobId, render = explainRender, browser: given = null, launch = null, store = null, limits = {} } = {}) {
  return async function captureCard({ composition, artifacts, cases }) {
    const opts = { jobId, ...(store ? { store } : {}), limits };
    if (!env?.ASSETS?.fetch) throw new render.RenderError('render_unavailable', 'render assets are not bound');
    let browser = given;
    if (!browser) {
      try { browser = await (launch || render.launchBrowser)(env, { ...render.RENDER_LIMITS, ...limits }); }
      catch (error) { throw error instanceof render.RenderError ? error : new render.RenderError('render_unavailable', `browser launch failed: ${error.message}`); }
    }
    try {
      const frame = async (artifact, entries) => {
        const program = artifact.program, width = program.manifest.viewport?.width ?? 960, height = program.manifest.viewport?.height ?? 540;
        const manifest = { compiledHash: await render.compiledHash(program), reserved: { captures: entries.length, pixels: entries.length * width * height }, entries: entries.map(e => ({ part: 0, theme: 'light', width, height, dpr: 1, target: 'frame', ...e })) };
        const done = await render.renderStates(env, { program }, manifest, { ...opts, browser });
        const byId = new Map(done.captures.flatMap(c => [c.id, ...(c.aliases || [])].map(id => [id, c])));
        return id => byId.get(id);
      };
      const mainProgram = artifacts.main.program, stateful = mainProgram.schemaVersion === 2;
      const mainAt = await frame(artifacts.main, cases.map(c => ({ id: c.id, time: c.time, inputs: c.inputs, composition, ...(stateful ? { seed: 0, events: c.events ?? [] } : {}) })));
      // One snapshot per distinct bound input state of each supporting panel, evaluated at time zero.
      const supportAt = {};
      for (const panel of composition.supporting) {
        const states = new Map(cases.map(c => { const inputs = resolveSupportInputs(composition, panel.id, c.inputs); return [canonicalJson(inputs), inputs]; }));
        const ids = [...states.keys()];
        const at = await frame(artifacts.supporting.find(s => s.id === panel.id).artifact, ids.map((key, i) => ({ id: `s${i}`, time: 0, inputs: states.get(key), composition })));
        supportAt[panel.id] = key => at(`s${ids.indexOf(key)}`);
      }
      const traceOf = capture => { const t = capture.trace ?? {}; return { inputs: t.inputs, time: t.time, quantities: t.quantities ?? {}, readouts: t.readouts ?? {}, texts: t.texts ?? [], frameHash: capture.sha256 }; };
      return cases.map(c => {
        const main = mainAt(c.id);
        const supports = Object.fromEntries(composition.supporting.map(panel => {
          const got = supportAt[panel.id](canonicalJson(resolveSupportInputs(composition, panel.id, c.inputs)));
          return [panel.id, { bundleHash: got.bundleHash, png: got.png, sha256: got.sha256, key: got.key, trace: traceOf(got) }];
        }));
        return { caseId: c.id, png: main.png, sha256: main.sha256, key: main.key, compositionHash: composition.envelopeHash, completeCard: false, bundleHash: main.bundleHash, trace: traceOf(main), supports };
      });
    } finally {
      if (!given) { let timer; await Promise.race([Promise.resolve(browser.close()).catch(() => {}), new Promise(resolve => { timer = setTimeout(resolve, render.RENDER_LIMITS.closeMs); })]); clearTimeout(timer); }
    }
  };
}
