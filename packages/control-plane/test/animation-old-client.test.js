// MVP1 correction, old clients: an already-open browser build at 51b6560cf (before the tube `radius` field and the client-feature
// gate) against the code that adds them. Real functions throughout: the old client's own contract.js, storage.js and client.js are
// loaded from a checkout of 51b6560cf (ANIMATION_OLD_CLIENT_DIR, default C:/s/spec/animation/rca-base; those tests skip when it is
// absent); the new client's and the server's are this tree's. No browser, no model, no network. Written up in
// docs/features/animation/old-client-compatibility.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { artifactHashOf, artifactIntact, clientProblems, sealArtifact, validateStage } from '../src/animation-author.js';
import { actionCapability, clientFeatures, enabledCapabilities, surfaceCapability, SURFACES } from '../src/animation-brief.js';
import { CLIENT_UPDATE, animationRoute, needsFeatures } from '../src/animation-job.js';
import { validateAnimationArtifact } from '../../web/src/animation3d/contract.js';
import { watchFixture } from '../../web/src/animation3d/fixtures.js';
import { ANIMATION_CLIENT_FEATURES } from '../../web/src/animation3d/capabilities.js';
import { animationClient, pollRetryDelay, readyResult } from '../../web/src/animation3d/client.js';
import { ANIMATION3D, MESSAGES, artifactIdentity, freshEnvelope, hydrateAnimation } from '../../web/src/animation3d/storage.js';
import { BOARD, OWNER, animationStack } from './animation-fixture.js';

const OLD_DIR = process.env.ANIMATION_OLD_CLIENT_DIR || 'C:/s/spec/animation/rca-base';
const OLD_SRC = join(OLD_DIR, 'packages/web/src/animation3d');
const skip = existsSync(join(OLD_SRC, 'storage.js')) ? false : `needs a checkout of 51b6560cf at ${OLD_DIR} (ANIMATION_OLD_CLIENT_DIR)`;
const load = name => import(pathToFileURL(join(OLD_SRC, name)).href);
const old = skip ? null : { contract: await load('contract.js'), caps: await load('capabilities.js'), storage: await load('storage.js'), client: await load('client.js') };

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const sgd = fixture('animation-aj_9c453b6.json');
const caps = enabledCapabilities();
const sealed = draft => sealArtifact(draft, { artifactId: sgd.resultId, revision: 1, planHash: sgd.planHash, model: sgd.servedModel, createdAt: new Date(sgd.approvalAt).toISOString(), caps });
const tubed = draft => ({ ...draft, scene: { ...draft.scene, geometries: draft.scene.geometries.map(g => (g.kind === 'curve' ? { ...g, radius: 0.04 } : g)) } });
// A saved artifact with plain curves (as every artifact made before the change), and the same scene drawn with tubes elsewhere.
const legacy = await sealed(sgd.repairedDraft);
const tube = await sealed(tubed(sgd.repairedDraft));
// Saved artifacts made by the build before the change: the aj_9c453b6 repaired draft sealed, aj_086fd46's repaired artifact (plain curves),
// and the web build's own watch fixture (an orbit curve).
const SAVED = { 'aj_9c453b6 repaired draft, sealed': legacy, 'aj_086fd46 repaired artifact': fixture('animation-aj_086fd46.json').repairedArtifact, 'watch fixture (orbit curve)': watchFixture.artifact };

// The exact words the old client's contract gives for the tube scene, and what its card says for each way the read can end.
const OLD_CONTRACT_WORDS = 'unknown field(s): radius';
const OLD_MISMATCH_TEXT = 'This animation\'s saved version could not be verified. Your saved settings are kept. Try again.';
const OLD_ERROR_TEXT = 'The animation could not be loaded. Try again.';

// The card block that pins an artifact (storage.js freshEnvelope); both builds' storage.js are the same but for 'update'.
const blockOf = artifact => ({ id: 'card_1', type: ANIMATION3D, title: 'Scene', animation3d: freshEnvelope({ ...artifactIdentity(artifact), boardId: BOARD.id, cardId: 'card_1' }) });
const OWNER_CTX = { kind: 'owner', boardId: BOARD.id };

// A stack holding one saved result, and the browser's fetch: the real route and Durable Object, throwing as api.js api() does.
// ponytail: api() is mirrored here (api.js, 3 lines), not imported: it needs the browser's window.
async function stackWith(t, artifact) {
  const s = animationStack(t, { pipeline: { intact: artifactIntact } });
  const identity = { artifactHash: await artifactHashOf(artifact) };
  s.state.data.set(`result:${artifact.artifactId}`, { kind: 'animation3d', artifact, identity, owner: { org: OWNER.org, email: OWNER.email }, boardId: BOARD.id, cardId: 'card_1' });
  const env = { ...s.env, ANIMATION_JOBS: { idFromName: name => name, get: () => ({ fetch: (url, init) => s.actor.fetch(new Request(url, init)) }) } };
  const fetchJson = async (path, opts = {}) => {
    const r = await animationRoute(path.split('?')[0], new Request(`https://dev.test${path}`, opts), env, { identity: async () => OWNER });
    const data = await r.json().catch(() => undefined);
    if (!r.ok || data === undefined) throw Object.assign(new Error(data?.error || `HTTP ${r.status}`), { status: r.status, data: data ?? {} });
    return data;
  };
  return { ...s, fetchJson, snapshot: () => JSON.stringify(s.state.data.get(`result:${artifact.artifactId}`)) };
}

// ---- (a) generation ---------------------------------------------------------------------------------------------------

test('generation: a client that declares no features is the legacy path; only a declared curve_radius may draw tubes', async () => {
  for (const none of [undefined, null, [], 'curve_radius', {}, ['bogus'], ['Curve_Radius']]) assert.deepEqual(clientFeatures(none), [], JSON.stringify(none));
  assert.deepEqual(clientFeatures(['bogus', 'curve_radius']), ['curve_radius']);
  assert.deepEqual(ANIMATION_CLIENT_FEATURES, ['curve_radius', 'action_motion', 'surface_grid', 'trail_points', 'text_readout', 'arrow_anchor', 'clamp']);
  // What the planner, author, repair and review are told.
  for (const job of [{}, { features: [] }, { features: undefined }, null]) assert.equal(surfaceCapability(job).surfaces, SURFACES.legacy);
  assert.equal(surfaceCapability({ features: ['curve_radius'] }).surfaces, SURFACES.tubes);
  assert.equal(surfaceCapability({ features: ['curve_radius', 'surface_grid'] }).surfaces, SURFACES.surface, 'AN-20: a browser that draws a surface is told so, whatever else it declares');
  assert.match(SURFACES.legacy, /do not plan or draw a scene that depends on a curved surface/);
  // The validate stage: a draft with a tube is refused (and repairable) for a job with no features, accepted with the feature.
  const job = features => ({ prompt: sgd.prompt, plan: sgd.plan, planHash: sgd.planHash, resultId: sgd.resultId, approval: { at: sgd.approvalAt }, draft: tubed(sgd.repairedDraft), evidence: [], attempt: 1, repairs: 0,
    counts: { review: 0 }, calls: [{ role: 'author', status: 'settled', served: sgd.servedModel }], ...(features === undefined ? {} : { features }) });
  const env = { ANTHROPIC_API_KEY: 'offline' };
  for (const features of [undefined, []]) {
    const out = await validateStage(job(features), { env });
    assert.deepEqual([out.category, out.repairable], ['spec', true]);
    assert.ok(out.problems.length >= 1 && out.problems.every(p => /\.radius: the browser that asked for this scene cannot draw tube curves; remove radius$/.test(p)), JSON.stringify(out.problems));
  }
  assert.deepEqual((await validateStage(job(['curve_radius']), { env })).problems ?? [], []);
  // A plain-curve draft never needs the feature.
  assert.deepEqual((await validateStage({ ...job(), draft: sgd.repairedDraft }, { env })).problems ?? [], []);
});

test('generation: the job records only the features a request declares (a request that names none is stored as none)', async t => {
  const s = animationStack(t);
  const make = async (n, extra) => s.create({ requestId: `req-0000010${n}`, cardId: `card-010${n}`, ...extra });
  assert.deepEqual(s.stored((await make(1)).body.job.id).features, []);
  assert.deepEqual(s.stored((await make(2, { features: ['curve_radius', 'bogus'] })).body.job.id).features, ['curve_radius']);
  const bad = await make(3, { features: 'curve_radius' });
  assert.deepEqual([bad.status, bad.body.error], [400, 'Invalid client features.']);
});

test('generation: the new client declares its features on create and read; the old client declares none', { skip }, async () => {
  const sent = [];
  const fetchJson = async (path, opts = {}) => { sent.push({ path, body: opts.body ? JSON.parse(opts.body) : null }); return {}; };
  await animationClient(fetchJson, 'b1').create({ requestId: 'r', cardId: 'c', prompt: 'p' });
  await animationClient(fetchJson, 'b1').result('ar_1');
  assert.deepEqual(sent[0].body.features, ['curve_radius', 'action_motion', 'surface_grid', 'trail_points', 'text_readout', 'arrow_anchor', 'clamp']);
  assert.match(sent[1].path, /\?board=b1&features=curve_radius%2Caction_motion%2Csurface_grid%2Ctrail_points%2Ctext_readout%2Carrow_anchor%2Cclamp$/);
  await old.client.animationClient(fetchJson, 'b1').create({ requestId: 'r', cardId: 'c', prompt: 'p' });
  await old.client.animationClient(fetchJson, 'b1').result('ar_1');
  assert.equal('features' in sent[2].body, false, 'the old create names no features');
  assert.match(sent[3].path, /\?board=b1$/, 'the old read names none');
});

// ---- (b) loading ------------------------------------------------------------------------------------------------------

test('loading: the server refuses a tube scene to a reader without the feature, with the clear message; a plain-curve scene is served to all', async t => {
  const tubeStack = await stackWith(t, tube), legacyStack = await stackWith(t, legacy);
  assert.deepEqual(needsFeatures(tube), ['curve_radius']);
  assert.deepEqual(needsFeatures(legacy), []);
  const get = (s, a, q) => s.send('result', q === undefined ? {} : { features: q }, a.artifactId);
  for (const q of [undefined, [], ['bogus']]) {
    const r = await get(tubeStack, tube, q);
    assert.deepEqual([r.status, r.body.code, r.body.error, r.body.artifact], [409, 'client_update_required', CLIENT_UPDATE, undefined], JSON.stringify(q));
  }
  assert.equal(CLIENT_UPDATE, 'This scene needs the newest version of Rabbit Hole. Reload the page to update it.');
  assert.equal((await get(tubeStack, tube, ['curve_radius'])).status, 200);
  for (const q of [undefined, [], ['curve_radius']]) assert.equal((await get(legacyStack, legacy, q)).status, 200, `legacy ${JSON.stringify(q)}`);
});

test('loading: through the real route, the query string is the declaration; a read with none is the legacy read', async t => {
  const s = await stackWith(t, tube);
  const status = q => s.fetchJson(`/api/learn/animation/jobs/results/${tube.artifactId}?board=${BOARD.id}${q}`).then(() => 200, e => [e.status, e.data.code]);
  assert.deepEqual(await status(''), [409, 'client_update_required']);
  assert.deepEqual(await status('&features='), [409, 'client_update_required']);
  assert.deepEqual(await status('&features=bogus'), [409, 'client_update_required']);
  assert.equal(await status('&features=curve_radius'), 200);
});

test('loading: a client told by the server gets the update and reload requirement; the same client with the feature loads the scene', async t => {
  const s = await stackWith(t, tube);
  // A reader that does not declare the feature (what an old build sends), through the new storage.js.
  const noDeclaration = ref => s.fetchJson(`/api/learn/animation/jobs/results/${ref.artifactId}?board=${ref.boardId}`).then(a => a.artifact);
  const refused = await hydrateAnimation(blockOf(tube), { context: OWNER_CTX, readArtifact: noDeclaration });
  assert.deepEqual([refused.status, refused.message, refused.retry], ['update', MESSAGES.update, false]);
  assert.equal(MESSAGES.update, CLIENT_UPDATE, 'the card says what the server said');
  // The new client as it is (client.js result declares curve_radius).
  const read = ref => animationClient(s.fetchJson, ref.boardId).result(ref.artifactId).then(a => a.artifact);
  const ok = await hydrateAnimation(blockOf(tube), { context: OWNER_CTX, readArtifact: read });
  assert.equal(ok.status, 'ready', ok.message);
});

test('loading: the old contract refuses the tube scene (unknown field radius) although the scene declares the versions the old client knows', { skip }, () => {
  assert.equal(validateAnimationArtifact(tube, caps).ok, true, 'the new contract accepts the tube scene');
  assert.equal(tube.schema, 'animation-scene/1');
  assert.equal(tube.capabilityVersion, 'animation-capabilities/1');
  const oldly = old.contract.validateAnimationArtifact(tube, old.caps.ANIMATION_CAPABILITIES);
  assert.equal(oldly.ok, false);
  assert.equal(oldly.issues.length, tube.scene.geometries.filter(g => g.kind === 'curve').length, 'one per tube curve');
  assert.ok(oldly.issues.every(i => i.message === OLD_CONTRACT_WORDS && /^scene\.geometries\.\d+\.radius$/.test(i.path)), JSON.stringify(oldly.issues));
});

test('loading: a server that does not gate hands the tube scene to the old client, which shows "could not be verified" (the case before this change)', { skip }, async () => {
  const out = await old.storage.hydrateAnimation(blockOf(tube), { context: OWNER_CTX, readArtifact: async () => structuredClone(tube) });
  assert.deepEqual([out.status, out.message, out.retry], ['mismatch', OLD_MISMATCH_TEXT, true]);
  assert.equal(old.storage.MESSAGES.mismatch, OLD_MISMATCH_TEXT);
});

test('loading, the gap: the old client opening a tube scene through the gated server shows a generic error, never the server\'s message', { skip }, async t => {
  const s = await stackWith(t, tube);
  const before = s.snapshot(), block = blockOf(tube), blockBefore = JSON.stringify(block);
  const read = ref => old.client.animationClient(s.fetchJson, ref.boardId).result(ref.artifactId).then(a => a.artifact);
  // The server does refuse the old client, with the update message in the body...
  const refusal = await s.fetchJson(`/api/learn/animation/jobs/results/${tube.artifactId}?board=${BOARD.id}`).catch(e => e);
  assert.deepEqual([refusal.status, refusal.data.code, refusal.message], [409, 'client_update_required', CLIENT_UPDATE]);
  // ...but the old hydrate looks only at 404 and 410, so the old card shows its own generic text.
  const out = await old.storage.hydrateAnimation(block, { context: OWNER_CTX, readArtifact: read });
  assert.deepEqual([out.status, out.message, out.retry], ['error', OLD_ERROR_TEXT, true]);
  assert.equal(Object.values(old.storage.MESSAGES).some(m => /newest version|Reload/.test(m)), false, 'no old message mentions an update');
  assert.equal(s.snapshot(), before, 'the saved result is untouched');
  assert.equal(JSON.stringify(block), blockBefore, 'so is the card');
});

test('loading, the one place the old client shows the server\'s words: a pending card polling a job that finished with a tube scene', { skip }, async t => {
  const s = await stackWith(t, tube);
  const job = { stage: 'ready', result: { resultId: tube.artifactId, planHash: tube.planHash, cardId: 'card_1', canvas: BOARD.id, requestRef: 'x' } };
  const error = await old.client.readyResult(job, id => old.client.animationClient(s.fetchJson, BOARD.id).result(id)).catch(e => e);
  assert.deepEqual([error.status, error.message], [409, CLIENT_UPDATE], 'Animation3DCard.jsx puts error.message in its alert');
  assert.equal(old.client.pollRetryDelay(error, 1), 2000, 'and keeps polling (409 is not final), so the alert stays until a reload');
  // The same job to a client that declares the feature completes.
  const done = await readyResult(job, id => animationClient(s.fetchJson, BOARD.id).result(id));
  assert.equal(done.result.artifactId, tube.artifactId);
  assert.equal(pollRetryDelay(error, 1), 2000);
});

// ---- (c) old artifacts ------------------------------------------------------------------------------------------------

test('old artifacts: saved plain-curve artifacts validate in both versions, are served with or without features, and load in both clients', { skip }, async t => {
  for (const [name, artifact] of Object.entries(SAVED)) {
    assert.equal(validateAnimationArtifact(artifact, caps).ok, true, `new contract: ${name}`);
    assert.equal(old.contract.validateAnimationArtifact(artifact, old.caps.ANIMATION_CAPABILITIES).ok, true, `old contract: ${name}`);
    assert.deepEqual(needsFeatures(artifact), [], name);
    const s = await stackWith(t, artifact), before = s.snapshot(), block = blockOf(artifact);
    const readWith = animationClientOf => ref => animationClientOf(s.fetchJson, ref.boardId).result(ref.artifactId).then(a => a.artifact);
    const oldOut = await old.storage.hydrateAnimation(block, { context: OWNER_CTX, readArtifact: readWith(old.client.animationClient) });
    const newOut = await hydrateAnimation(block, { context: OWNER_CTX, readArtifact: readWith(animationClient) });
    assert.deepEqual([oldOut.status, newOut.status], ['ready', 'ready'], `${name}: ${oldOut.message} / ${newOut.message}`);
    assert.deepEqual(oldOut.artifact, newOut.artifact, `${name}: both clients load the same artifact`);
    assert.equal(s.snapshot(), before, `${name}: reading changes nothing`);
  }
});

test('old artifacts: the tube scene differs from the plain one only by radius on its curves, so the old contract accepts the plain one and the hashes differ', { skip }, async () => {
  const withoutRadius = { ...tube, scene: { ...tube.scene, geometries: tube.scene.geometries.map(g => { const { radius, ...rest } = g; return g.kind === 'curve' ? rest : g; }) } };
  assert.deepEqual(withoutRadius, legacy);
  assert.equal(old.contract.validateAnimationArtifact(withoutRadius, old.caps.ANIMATION_CAPABILITIES).ok, true);
  assert.notEqual(await artifactHashOf(tube), await artifactHashOf(legacy));
});

// ---- (d) startsMotion (aj_086fd46 owner review: Take one step ran on by itself) -----------------------------------------------

test('startsMotion: an artifact that declares it needs the action_motion feature; every artifact that does not is served to every reader', async t => {
  const stepper = { ...legacy, stepped: true, actions: [{ id: 'oneStep', label: 'Take one step', startsMotion: false }] };
  const launcher = { ...legacy, stepped: true, actions: [{ id: 'launch', label: 'Launch' }] };
  const both = { ...tube, actions: stepper.actions };
  assert.deepEqual([needsFeatures(stepper), needsFeatures(launcher), needsFeatures(both)], [['action_motion'], [], ['curve_radius', 'action_motion']]);
  const stepStack = await stackWith(t, stepper), launchStack = await stackWith(t, launcher), bothStack = await stackWith(t, both);
  const get = (s, a, q) => s.send('result', q === undefined ? {} : { features: q }, a.artifactId);
  for (const q of [undefined, [], ['curve_radius']]) {
    const r = await get(stepStack, stepper, q); // the build before this change declares only curve_radius
    assert.deepEqual([r.status, r.body.code, r.body.error], [409, 'client_update_required', CLIENT_UPDATE], JSON.stringify(q));
  }
  assert.equal((await get(stepStack, stepper, ['action_motion'])).status, 200);
  assert.equal((await get(bothStack, both, ['curve_radius'])).status, 409, 'a tube reader without action_motion is refused too');
  assert.equal((await get(bothStack, both, ANIMATION_CLIENT_FEATURES)).status, 200);
  for (const q of [undefined, [], ['curve_radius'], ANIMATION_CLIENT_FEATURES]) assert.equal((await get(launchStack, launcher, q)).status, 200, `no declaration: ${JSON.stringify(q)}`);
});

test('startsMotion: the author is told by client features, and a draft that declares it for a reader without the feature is refused for repair', () => {
  assert.deepEqual(ANIMATION_CLIENT_FEATURES, ['curve_radius', 'action_motion', 'surface_grid', 'trail_points', 'text_readout', 'arrow_anchor', 'clamp']);
  assert.match(actionCapability({ features: ['action_motion'] }).actionMotion, /may declare startsMotion false/);
  for (const job of [{}, { features: [] }, { features: ['curve_radius'] }, null]) assert.match(actionCapability(job).actionMotion, /^Do not declare startsMotion/);
  const draft = { scene: { geometries: [] }, actions: [{ id: 'oneStep', label: 'Take one step', startsMotion: false }, { id: 'launch', label: 'Launch' }] };
  assert.deepEqual(clientProblems(draft, { features: ['curve_radius'] }), ['actions.0.startsMotion: the browser that asked for this scene does not know it; remove startsMotion']);
  assert.deepEqual(clientProblems(draft, { features: ANIMATION_CLIENT_FEATURES }), []);
  assert.deepEqual(clientProblems({ ...draft, actions: [draft.actions[1]] }, { features: [] }), [], 'no declaration is never a problem');
});

