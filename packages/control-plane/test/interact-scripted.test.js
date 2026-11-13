// INTERACT_BUILD_PROFILE=scripted (interact-scripted.js): a dev-only build profile that answers the build roles with the three scripted toss programs and no model call, and runs everything else
// for real (the design pin, admission, validate, the headless run, the oracle, sealing, delivery, the ledger row). Zero model calls: globalThis.fetch is replaced by a function that fails the test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainRoute } from '../src/explain-job.js';
import { verifyComposition } from '../../web/src/interact-composition.js';
import { OWNER, BOARD, designStack } from './interact-design-fixture.js';
import { SCRIPTED_PROFILE, scriptedBuildAllowed } from '../src/interact-scripted.js';
import { INTERACT_REGISTRY, interactProfileFor, resolveInteractProfile } from '../src/interact-models.js';

test.beforeEach(t => { const log = console.log; console.log = () => {}; t.after(() => { console.log = log; }); });

const PIN = { INTERACT_DESIGN_FIXTURE: 'toss', EXPLAIN_DIAGNOSTICS: 'true', INTERACT_DESCRIPTION_FIT: 'estimate', INTERACT_SEEK: 'on', INTERACT_RUN: 'headless', INTERACT_REVIEW: 'shadow', INTERACT_BUILD_PROFILE: 'scripted' };
const media = () => { const data = new Map(); return { put: async (key, bytes) => { data.set(key, bytes); }, get: async key => (data.has(key) ? { arrayBuffer: async () => data.get(key).buffer } : null) }; };

function scriptedStack(t, env = {}) {
  const s = designStack(t);
  delete s.deps.descriptionFit;
  s.deps.buildScene = undefined; // the real build, not a test's legacy-shaped seam
  Object.assign(s.env, PIN, { ASSETS: { fetch: async () => new Response('x') }, LEARN_MEDIA: media() }, env);
  const real = globalThis.fetch, sent = [];
  globalThis.fetch = async (url, options) => { sent.push(String(url)); throw new Error(`a scripted job must not call out: ${url}`); };
  t.after(() => { globalThis.fetch = real; });
  const route = async path => {
    const e = { ...s.env, EXPLAIN_JOBS: { idFromName: name => name, get: () => ({ fetch: (url, init) => s.actor.fetch(new Request(url, init)) }) } };
    const response = await explainRoute(`/api/learn/explain/jobs${path.split('?')[0]}`, new Request(`https://dev.test/api/learn/explain/jobs${path}`), e, { identity: async () => OWNER });
    return { status: response.status, body: await response.json() };
  };
  return { ...s, sent, route, jobOf: id => s.state.data.get(`job:${id}`) };
}

test('the scripted profile resolves like opus-baseline and is allowed only where the design pin is, never when ENVIRONMENT is production', () => {
  assert.deepEqual(resolveInteractProfile('scripted').roles, resolveInteractProfile('opus-baseline').roles);
  assert.equal(interactProfileFor({ INTERACT_BUILD_PROFILE: 'scripted' }).id, SCRIPTED_PROFILE);
  assert.equal(INTERACT_REGISTRY.defaultProfile, 'opus-baseline');
  assert.equal(scriptedBuildAllowed({ ...PIN }), true);
  assert.equal(scriptedBuildAllowed({ ...PIN, EXPLAIN_DIAGNOSTICS: undefined, SMALL_ENV: 'dev' }), true);
  assert.equal(scriptedBuildAllowed({ ...PIN, ENVIRONMENT: 'production' }), false);
  assert.equal(scriptedBuildAllowed({ ...PIN, EXPLAIN_DIAGNOSTICS: undefined }), false, 'no dev gate');
  assert.equal(scriptedBuildAllowed({ ...PIN, INTERACT_DESIGN_FIXTURE: undefined }), false, 'no pinned plan: the programs would meet a plan they were not written for');
});

test('a job is refused up front when the scripted profile is set where it is not allowed (production, or no dev gate)', async t => {
  for (const env of [{ ENVIRONMENT: 'production' }, { EXPLAIN_DIAGNOSTICS: undefined, SMALL_ENV: undefined }, { INTERACT_DESIGN_FIXTURE: undefined }]) {
    const s = scriptedStack(t, env);
    const made = await s.create({ depth: 'brief' });
    assert.equal(made.status, 503, JSON.stringify([env, made.body]));
    assert.equal(made.body.code ?? made.body.error?.code, 'flow_misconfigured');
  }
});

test('Brief, Balanced and Detailed each reach ready on the scripted programs with zero model calls: the real checks, the oracle and the seal run, the ledger row says profile scripted', async t => {
  for (const [depth, fixture, planKey] of [['brief', 'toss-overview', 'tossOverview'], ['balanced', 'toss-standard', 'tossStandard'], ['detailed', 'toss-deep', 'tossDeep']]) {
    const s = scriptedStack(t);
    const { body } = await s.create({ depth }), id = body.job.id;
    assert.equal((await s.design(id)).job.stage, 'awaiting_approval');
    assert.equal(s.jobOf(id).flow.profile.id, 'scripted');
    assert.equal((await s.approve(id)).status, 202);
    const seen = [];
    for (let i = 0; i < 30; i++) {
      await s.actor.alarm();
      const job = s.jobOf(id);
      if (seen.at(-1) !== job.stage) seen.push(job.stage);
      if (['ready', 'failed', 'cancelled'].includes(job.stage) && !job.inFlight) break;
    }
    const job = s.jobOf(id);
    assert.equal(job.stage, 'ready', `${depth}: ${JSON.stringify([job.stopReason, job.failure, job.findings])}`);
    assert.deepEqual(seen, ['validating', 'rendering', 'ready']);
    assert.equal(job.stopReason, 'accepted');
    assert.deepEqual(s.sent, [], `${depth}: no outbound call at all`);
    assert.deepEqual(job.build.counts, { build_author: 1, build_review: 0, build_repair: 0 });
    // The saved card is the sealed scripted program under its plan's composition, and it verifies.
    const saved = s.state.data.get(`result:${job.resultId}`);
    assert.equal(saved.composition.planHash, job.design.finalHash);
    assert.deepEqual(await verifyComposition(saved.composition, saved.artifacts ?? s.state.data.get(`build:${id}:artifacts`)), []);
    // The ledger row: the real checks (oracle rows checked) and profile scripted; the judge is not called.
    await s.actor.alarm();
    const { ledger } = (await s.route(`/${id}?board=${BOARD.id}&detail=1`)).body.diagnostics;
    assert.deepEqual([ledger.profile, ledger.fixture, ledger.result, ledger.stopReason, ledger.repairs, ledger.judgeVerdict], ['scripted', fixture, 'ready', 'accepted', 0, null], depth);
    assert.ok(ledger.oracleChecked >= 18 && ledger.oracleFailed === 0, `${depth}: oracle ${ledger.oracleChecked} checked, ${ledger.oracleFailed} failed (${planKey})`);
    assert.ok(ledger.msTotal >= 0);
    assert.equal(s.jobOf(id).bench.judge, null, 'a scripted job is never judged');
    assert.deepEqual([ledger.costUsd ?? 0], [0], 'no spend');
  }
});
