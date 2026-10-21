// CAD controls in the card (cad-controls brief sections 1-6; tutor-workflow decisions, C UI phase), against the LOCAL stack
// only. The board save is real; every CAD job route, artifact and source read is answered in the browser by a scripted
// service that follows the control plane's rules (cad-jobs.js) with the shared validators (cad-parameters.js) and check
// resolution (cad-contract.js). Model-capable routes are aborted and counted: no model or executor is ever called.
// The five fixtures are the backend's own (packages/cad-execute/fixtures/*/design.json), read here, so no parameter name is
// written into this check; default-build measurements and the plate hole-diameter 9 rebuild are real local-kernel facts
// (cad-controls-facts.json); every other preview is synthetic. This proves UI wiring and lifecycle, not geometry or a model.
//   1. each fixture's Quick edit comes from its own definitions: rows in priority order, a control per type, More parameters,
//      inputs, Assumed and Calculated labelled apart, Measured or "Not measured"; the imported model has no controls;
//   2. a draft: typed values stay a draft (accepted values, measurements and the board unchanged), survive a reload;
//      integer counts and invalid combinations are refused with their reason and Preview is disabled;
//   3. Preview change -> building -> review; reload during review keeps the review; Accept saves the new revision, keeps the
//      prompt, shows current values and records the revision (parent and new) with its parameter changes;
//   4. an executor without parameter support refuses the rebuild before any job exists, and offers Edit with AI;
//   5. the supported path on another fixture, then Discard: the accepted model and the card status come back;
//   6. a failed rebuild keeps the accepted model and explains the source's refusal; Edit values keeps the draft;
//   7. stale acceptance is refused and the accepted model stays; a stale Preview offers Reload model;
//   8. Show dimensions: measured labels on the model, Measured / Requested / Assumed in the legend, a draft marks them as the
//      displayed model's, a focused parameter highlights its dimension, an unmeasured model says "Not measured.";
//   9. Design brief, Checks (one by one, generation apart from validation, unassessed listed) and the owner's Code;
//  10. a share-link viewer: no Quick edit, no Code, no source read; the brief, checks and revisions are there;
//  11. Review design above the composer (brief-first): the exact request, highlighted assumptions, missing units block
//      Generate, Edit details re-approves, reload keeps the review, Generate sends the new brief hash, Cancel ends another;
//  12. keyboard and tooltips: typing in a parameter never reaches the canvas, More parameters by Enter, tooltips on focus;
//  13. dark theme: the same surfaces on dark tokens;
//  14. no browser errors, no model requests, no unexpected writes.
// Usage: BASE=http://127.0.0.1:9181 SMALL_CP=http://127.0.0.1:9183 VARS=<cp .dev.vars> node e2e/cad-controls-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { validateControls, validateValues, structuralChange } from '../src/cad-parameters.js';
import { resolveCadChecks, controlScope } from '../../control-plane/src/cad-contract.js';

const BASE = process.env.BASE || 'http://127.0.0.1:9181';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:9183';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('cad-controls-check runs against the local stack only');
const OUT = process.argv[2] || 'cad-controls-shots';
mkdirSync(OUT, { recursive: true });
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `cadc-${run}@example.com`, secret }) })).json();
const api = async (path, init = {}) => {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, origin: BASE, 'content-type': 'application/json' } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw Error(`${init.method || 'GET'} ${path}: HTTP ${response.status} ${body?.error || ''}`);
  return body;
};

// ---------------------------------------------------------------- the five backend fixtures and their real default facts
const FIXTURES = new URL('../../cad-execute/fixtures/', import.meta.url);
const designs = Object.fromEntries(readdirSync(FIXTURES, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => [d.name, JSON.parse(readFileSync(new URL(`${d.name}/design.json`, FIXTURES), 'utf8'))]));
assert.equal(Object.keys(designs).length, 5, 'five fixtures');
const FACTS = JSON.parse(readFileSync(new URL('./cad-controls-facts.json', import.meta.url), 'utf8'));
const PROMPT = 'Make a part from the brief; keep the holes on the centre line.';
const inputsOf = controls => Object.fromEntries((controls?.parameters || []).filter(p => p.role === 'input').map(p => [p.id, p.value]));
const resolved = (design, controls) => resolveCadChecks(design.checks, controls ? controlScope(controls) : {});
// A validation report as the executor writes it: results with kind (and axis for sizes), actual from the facts when the
// facts are real; synthetic previews echo the expectation.
function validation(design, controls, facts, real) {
  const checks = resolved(design, controls).map(c => {
    const actual = !real ? c.value : c.kind === 'bounds_mm' ? facts.bounds_mm[c.axis] : c.kind === 'volume_mm3' ? facts.volume_mm3 : c.kind === 'solid_count' ? facts.solid_count : c.kind === 'circular_diameter_mm' ? facts.circular_diameters_mm.reduce((a, b) => (Math.abs(b - c.value) < Math.abs(a - c.value) ? b : a)) : null;
    return { id: c.id, kind: c.kind, ...(c.axis ? { axis: c.axis } : {}), status: Math.abs(actual - c.value) <= c.tolerance * Math.max(1, c.kind === 'volume_mm3' ? c.value : 1) ? 'passed' : 'failed', passed: true, actual, expected: c.value, tolerance: c.tolerance };
  });
  return { baselinePassed: true, passed: true, units: 'mm', geometry_units: 'mm', facts, checks, unchecked: [] };
}
const artifacts = (card, revisionId) => [
  { kind: 'source', name: 'model.py', url: `/api/learn/files/fs_src_${card}_${revisionId}` },
  { kind: 'glb', name: 'model.glb', url: `/api/learn/files/fs_${card}_${revisionId}/d/fd_glb` }, { kind: 'step', name: 'model.step', url: `/api/learn/files/fs_${card}_${revisionId}/d/fd_step` },
  { kind: 'thumbnail', name: 'thumbnail.svg', url: `/api/learn/files/fs_${card}_${revisionId}/d/fd_thumbnail` }];
function manifestOf(card, name, controls, revisionId, { facts, computed = {}, real = true } = {}) {
  const design = designs[name], f = facts || FACTS[name].facts;
  return { schema: 'cad-model/1', revisionId, sourceId: `fs_src_${card}_${revisionId}`, title: design.brief.title, units: 'mm', parameters: inputsOf(controls), assumptions: design.brief.assumptions,
    validation: validation(design, controls, f, real), artifacts: artifacts(card, revisionId),
    ...(controls ? { controls: { schema: 'cad-controls/1', revisionId, definitions: controls, values: inputsOf(controls), computed, bindings: Object.keys(inputsOf(controls)) } } : {}) };
}

// ---------------------------------------------------------------- the scripted CAD service (cad-jobs.js rules)
const service = { unsupported: false, failNext: false, polls: 0 };
const cards = new Map(), jobs = new Map(), writes = [], sourceReads = [], refused = [], outside = [], errors = [], approvals = [];
let seq = 0;
const now = () => new Date().toISOString();
function acceptedCard(id, name, { dx, dy, h = 1100 }) {
  const design = designs[name], controls = design.brief.controls ? validateControls(design.brief.controls) : null, revisionId = `cr_${name.replace(/-/g, '')}0001`;
  const manifest = manifestOf(id, name, controls, revisionId, { computed: FACTS[name].computed });
  const job = { id: `job-${id}`, cardId: id, modelId: id, state: 'ready', stage: 'ready', attempt: 1, revisionId, baseRevisionId: null, brief: { ...design.brief, controls }, manifest, createdAt: now(), updatedAt: now(), limitations: [] };
  jobs.set(job.id, job);
  cards.set(id, { id, name, design, current: job.id, model: { revisionId, manifest, prompt: PROMPT, brief: job.brief, revisions: [{ revisionId, parentRevisionId: null, kind: 'generated', changes: [], at: Date.now() - 60000 }] } });
  return { type: 'cad', id, jobId: job.id, modelId: id, revisionId, status: 'ready', title: design.brief.title, units: 'mm', w: 440, h, dx, dy, briefSummary: design.brief.assumptions.join('; '), manifest, acceptedManifest: manifest, promptUsed: PROMPT, revisions: cards.get(id).model.revisions };
}
function reviewCard(id, { dx, dy, missing }) {
  const design = designs['plate-holes'], controls = validateControls(design.brief.controls), request = `Make a shelf plate for three screws.\nKeep it light.  (${id})`;
  const job = { id: `job-${id}`, cardId: id, modelId: id, state: 'awaiting_approval', stage: 'awaiting_approval', attempt: 1, revisionId: `cr_${id}`, baseRevisionId: null, request,
    brief: { ...design.brief, missing, contextUsed: ['The selected sketch card'], controls }, briefHash: `h-${id}-1`, approval: null, createdAt: now(), updatedAt: now(), limitations: [] };
  jobs.set(job.id, job);
  cards.set(id, { id, name: 'plate-holes', design, current: job.id, model: null });
  return { type: 'cad', id, jobId: job.id, modelId: id, revisionId: null, status: 'awaiting_approval', title: design.brief.title, units: 'mm', w: 420, h: 300, dx, dy, briefSummary: '' };
}
const publicJob = job => { const { request, ...rest } = job; return { ...rest, ...(job.briefHash ? { request } : {}) }; };
function blockOf(card) {
  const job = jobs.get(card.current), model = card.model;
  return { type: 'cad', id: card.id, jobId: job.id, modelId: card.id, revisionId: model?.revisionId || null, status: job.state, title: card.design.brief.title, units: 'mm',
    briefSummary: (model?.manifest.assumptions || []).join('; '), manifest: model?.manifest || null, acceptedManifest: model?.manifest || null, manifestUrl: `/api/learn/cad/jobs/${job.id}`,
    ...(job.awaitingAccept ? { proposedRevisionId: job.revisionId } : {}), ...(model ? { revisions: model.revisions } : {}) };
}
const reply = (card, job = jobs.get(card.current), extra = {}) => ({ json: { job: publicJob(job), block: { ...blockOf(card), ...extra } } });
const refuse = (status, error, more = {}) => ({ status, json: { error, ...more } });
// A job advances on the card's own polls, as alarms would: building -> ready (awaiting Accept) or failed.
function advance(job) {
  if (job.rebuild && job.state === 'building' && ++job.polls >= 2) {
    if (job.fail) Object.assign(job, { state: 'failed', stage: 'failed', error: `The model rejected these values: ${FACTS.rejection} The accepted model is unchanged.` });
    else Object.assign(job, { state: 'ready', stage: 'ready', awaitingAccept: true });
    job.updatedAt = now();
  }
  if (!job.rebuild && job.approval && job.state !== 'ready' && ++job.polls >= 2) {
    const card = cards.get(job.cardId);
    Object.assign(job, { state: 'ready', stage: 'ready', manifest: manifestOf(card.id, 'plate-holes', job.brief.controls, job.revisionId, { real: false }), updatedAt: now() });
    card.model = { revisionId: job.revisionId, manifest: job.manifest, prompt: job.request, brief: job.brief, revisions: [{ revisionId: job.revisionId, parentRevisionId: null, kind: 'generated', changes: [], at: Date.now() }] };
  }
}
function act(card, job, action, body) {
  writes.push({ card: card.id, action, body });
  const model = card.model;
  if (action === 'rebuild') {
    if (!model || body.expectedRevisionId !== model.revisionId) return refuse(409, 'The accepted model changed. Reload before editing its parameters.');
    if (service.unsupported) return refuse(409, 'The CAD executor running now cannot rebuild from parameter values, so nothing was sent. Use Edit with AI (Ctrl+K) instead.', { code: 'executor_unsupported' });
    const controls = model.brief.controls, current = inputsOf(controls);
    const { values, problems } = validateValues(controls, body.values, { bound: model.manifest.controls.bindings, current });
    if (problems.length) return refuse(422, problems.map(p => p.message).join(' '), { problems });
    const next = { ...controls, parameters: controls.parameters.map(({ assumed, ...p }) => (p.role !== 'input' ? p : { ...p, value: values[p.id], ...(assumed && values[p.id] === current[p.id] ? { assumed } : {}) })) };
    const revisionId = `cr_rb${++seq}${card.name.replace(/-/g, '')}`, key = `${card.name}:${Object.entries(body.values).map(([k, v]) => `${k}=${v}`).join(',')}`;
    const real = FACTS[key];
    const rebuild = { id: `job-${card.id}-rb${seq}`, cardId: card.id, modelId: card.id, state: 'building', stage: 'building', attempt: 1, revisionId, baseRevisionId: model.revisionId, rebuild: true, polls: 0, fail: service.failNext,
      brief: { ...model.brief, controls: next }, createdAt: now(), updatedAt: now(), limitations: [],
      manifest: manifestOf(card.id, card.name, next, revisionId, real ? { facts: real.facts, computed: real.computed } : { real: false, computed: model.manifest.controls.computed }) };
    service.failNext = false;
    jobs.set(rebuild.id, rebuild); card.current = rebuild.id;
    return { status: 202, ...reply(card, rebuild) };
  }
  if (action === 'accept') {
    if (!job.awaitingAccept || body.expectedRevisionId !== model.revisionId || job.baseRevisionId !== model.revisionId) return refuse(409, 'The accepted model changed. This preview cannot replace it.');
    const before = inputsOf(model.brief.controls), after = inputsOf(job.brief.controls);
    const changes = job.brief.controls.parameters.filter(p => p.role === 'input' && before[p.id] !== after[p.id]).map(p => ({ id: p.id, label: p.label, ...(p.unit ? { unit: p.unit } : {}), from: before[p.id], to: after[p.id] }));
    card.model = { revisionId: job.revisionId, manifest: job.manifest, prompt: model.prompt, brief: job.brief, revisions: [...model.revisions, { revisionId: job.revisionId, parentRevisionId: model.revisionId, kind: 'parameters', changes, at: Date.now() }] };
    job.awaitingAccept = false;
    return reply(card, job, { promptUsed: model.prompt });
  }
  if (action === 'cancel') {
    if (job.state === 'awaiting_approval') { Object.assign(job, { state: 'cancelled', stage: 'cancelled', approval: null }); return reply(card, job); }
    if (job.rebuild && (job.awaitingAccept || job.state === 'failed' || job.state === 'building')) {
      Object.assign(job, { state: 'cancelled', stage: 'cancelled', awaitingAccept: false });
      card.current = [...jobs.values()].find(j => j.cardId === card.id && j.revisionId === model.revisionId).id;
      return reply(card);
    }
    return reply(card, job);
  }
  if (action === 'retry' && job.rebuild && job.state === 'failed') { Object.assign(job, { state: 'building', stage: 'building', polls: 0, fail: false, error: null }); return { status: 202, ...reply(card, job) }; }
  if (action === 'brief') {
    if (job.state !== 'awaiting_approval') return refuse(409, 'Only a design awaiting review can be edited.');
    if (body.expectedBriefHash !== job.briefHash) return refuse(409, 'The design brief changed. Reload before editing.');
    const edit = body.brief || {};
    if (edit.controls && structuralChange(job.brief.controls, edit.controls)) return refuse(409, 'Adding, removing or retyping parameters changes the design structure and needs a new brief. Start a new request.', { code: 'reprepare_required' });
    let controls = job.brief.controls;
    try { if (edit.controls) controls = validateControls(edit.controls); } catch (error) { return refuse(422, error.message); }
    job.brief = { ...job.brief, ...Object.fromEntries(['object', 'requirements', 'assumptions', 'missing', 'unsupported'].filter(k => edit[k] !== undefined).map(k => [k, edit[k]])), controls };
    job.briefHash = `h-${card.id}-${Number(job.briefHash.split('-').pop()) + 1}`; job.approval = null; job.updatedAt = now();
    return reply(card, job);
  }
  if (action === 'approve') {
    approvals.push(body);
    if (job.state !== 'awaiting_approval' || body.briefHash !== job.briefHash) return refuse(409, 'This design brief changed. Review it again before generating.');
    if (!body.confirmed) return refuse(428, 'Confirm paid generation.');
    if (job.brief.missing?.length) return refuse(409, 'Answer or remove the missing information before generating.');
    Object.assign(job, { approval: { briefHash: job.briefHash, at: Date.now() }, state: 'queued', stage: 'queued', polls: 0, updatedAt: now() });
    return { status: 202, ...reply(card, job) };
  }
  return refuse(404, 'Unknown CAD action');
}

// ---------------------------------------------------------------- canvas: five fixtures in a row, two briefs to review off to the side
await api('/api/profile', { method: 'PUT', body: JSON.stringify({ handle: `cadc_${run}` }) });
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `CAD controls ${run}` }) });
const order = ['plate-holes', 'linked-cube', 'cylinder', 'bracket', 'imported-step'];
const ids = Object.fromEntries(order.map(name => [name, `cad-${name}`]));
const blocks = [...order.map((name, i) => acceptedCard(ids[name], name, { dx: i * 460, dy: 140 })), reviewCard('cad-review-a', { dx: 0, dy: 1300, missing: [] }),
  reviewCard('cad-review-b', { dx: 460, dy: 1300, missing: ['Units of the screw size were not given (mm or in?)'] }), reviewCard('cad-review-c', { dx: 1380, dy: 1300, missing: [] })];
// A model without trusted measurements: the imported fixture with its validation withheld (Show dimensions says Not measured).
{
  const imported = blocks.find(b => b.id === ids['imported-step']), stripped = { ...imported.manifest, revisionId: 'cr_unmeasured', validation: { baselinePassed: false, checks: [] } };
  blocks.push({ ...imported, id: 'cad-unmeasured', jobId: 'job-cad-unmeasured', dx: 920, dy: 1300, h: 360, manifest: stripped, acceptedManifest: stripped, revisionId: 'cr_unmeasured' });
  jobs.set('job-cad-unmeasured', { ...jobs.get(imported.jobId), id: 'job-cad-unmeasured', cardId: 'cad-unmeasured', revisionId: 'cr_unmeasured', manifest: stripped });
  cards.set('cad-unmeasured', { ...cards.get(imported.id), id: 'cad-unmeasured', current: 'job-cad-unmeasured', model: { ...cards.get(imported.id).model, revisionId: 'cr_unmeasured', manifest: stripped } });
}
const PLATE = ids['plate-holes'];
const boardPath = `/api/learn/boards/${canvas.name}/main`;
const board = () => api(boardPath).then(out => out.state);
const saved = async id => (await board()).blocks.find(b => b.id === id);
await api(boardPath, { method: 'PUT', body: JSON.stringify({ state: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks } }) });

// A box GLB the size of the measured bounds (STEP mm -> GLB metres, Y up), so labels land on the drawn model.
function boxGlb(facts) {
  const [x0, y0, z0] = facts.bounds_min_mm, [x1, y1, z1] = facts.bounds_max_mm, g = ([x, y, z]) => [x / 1000, z / 1000, -y / 1000];
  const c = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]].map(g);
  const faces = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  const pos = faces.flat().flatMap(i => c[i]), bin = Buffer.alloc(pos.length * 4); pos.forEach((v, i) => bin.writeFloatLE(v, i * 4));
  const min = [0, 1, 2].map(k => Math.min(...c.map(p => p[k]))), max = [0, 1, 2].map(k => Math.max(...c.map(p => p[k])));
  const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], buffers: [{ byteLength: bin.length }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.length }], accessors: [{ bufferView: 0, componentType: 5126, count: pos.length / 3, type: 'VEC3', min, max }] };
  const text = Buffer.from(JSON.stringify(json)), length = Math.ceil(text.length / 4) * 4, bytes = Buffer.alloc(12 + 8 + length + 8 + bin.length, 32);
  bytes.writeUInt32LE(0x46546c67, 0); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(bytes.length, 8); bytes.writeUInt32LE(length, 12); bytes.writeUInt32LE(0x4e4f534a, 16); text.copy(bytes, 20); bytes.writeUInt32LE(bin.length, 20 + length); bytes.writeUInt32LE(0x004e4942, 24 + length); bin.copy(bytes, 28 + length); return bytes;
}
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(ask|selection|board$|tutor\/|assess|grade|home-ask|image|inline\/|journey|scene|video|transcribe|tts|voice\/|dive|explore|course|artifact|chat\/[^/]+\/turn))/;
const router = role => async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== BASE && !['data:', 'blob:'].includes(url.protocol)) { outside.push(url.hostname); return route.abort(); }
  const source = url.pathname.match(/^\/api\/learn\/files\/fs_src_(cad-[a-z-]+)_/);
  if (source) { sourceReads.push(role); return role === 'owner' ? route.fulfill({ contentType: 'text/plain', body: `# saved source of ${source[1]}\nfrom cad_params import value, computed\n` }) : route.fulfill({ status: 404, json: { error: 'Not found' } }); }
  const file = url.pathname.match(/^\/api\/learn\/files\/fs_(cad-[a-z-]+)_[^/]+\/d\/(fd_glb|fd_step|fd_thumbnail)$/);
  if (file) {
    const card = cards.get(file[1]), facts = card?.model?.manifest.validation.facts || FACTS['plate-holes'].facts;
    if (file[2] === 'fd_glb') return route.fulfill({ contentType: 'model/gltf-binary', body: boxGlb(facts) });
    if (file[2] === 'fd_step') return route.fulfill({ contentType: 'model/step', body: 'ISO-10303-21; fixture' });
    return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect x="20" y="50" width="120" height="60" fill="#999"/></svg>' });
  }
  if (url.pathname.startsWith('/api/learn/cad/jobs')) {
    if (role !== 'owner') { refused.push(`viewer ${url.pathname}`); return route.abort(); }
    const [, , , , , id, action] = url.pathname.split('/');
    if (!id) return route.fulfill({ json: { jobs: [...cards.values()].map(c => publicJob(jobs.get(c.current))), blocks: [...cards.values()].map(blockOf) } });
    const job = jobs.get(decodeURIComponent(id)), card = job && cards.get(job.cardId);
    if (!job) return route.fulfill({ status: 404, json: { error: 'Not available' } });
    if (request.method() === 'GET') { advance(job); return route.fulfill(reply(card, job)); }
    const out = act(card, job, action, JSON.parse(request.postData() || '{}'));
    return route.fulfill({ status: out.status || 200, json: out.json });
  }
  if (['/api/learn/tutor/next-steps', '/api/learn/next-steps'].includes(url.pathname)) return route.fulfill({ json: { options: [], suggestions: [], fingerprint: null } });
  if (MODEL.test(url.pathname) && request.method() !== 'GET') { refused.push(url.pathname); return route.abort(); }
  return route.fallback();
};

const results = [];
const total = 14;
const step = async (name, fn) => {
  try { await fn(); results.push(true); console.log(`ok ${results.length}. ${name}`); }
  catch (error) { results.push(false); console.log(`FAIL ${results.length}. ${name}: ${error.message}`); service.failNext = false; service.unsupported = false; await page?.screenshot({ path: `${OUT}/fail-${results.length}.png` }).catch(() => {}); }
};
const until = async (fn, label, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn().catch(() => false)) return; await new Promise(r => setTimeout(r, 100)); } throw Error(label); };

const browser = await chromium.launch();
const open = async ({ signedIn = true, path = `/apps/${canvas.name}`, dark = false, role = 'owner' } = {}) => {
  const context = await browser.newContext({ viewport: { width: 3000, height: 1700 }, colorScheme: dark ? 'dark' : 'light' });
  if (signedIn) await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.route('**/*', router(role));
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${BASE}${path}`);
  await page.locator(`[data-block-id="${PLATE}"] [data-cad-card]`).waitFor({ timeout: 60000 });
  return { context, page };
};
const cardOf = (page, id = PLATE) => page.locator(`[data-block-id="${id}"]`);
const quickOf = (page, id = PLATE) => cardOf(page, id).locator('[data-cad-quick-edit]');
const inputOf = (page, param, id = PLATE) => cardOf(page, id).locator(`[data-cad-input="${param}"]`);
const rowOf = (page, param, id = PLATE) => cardOf(page, id).locator(`[data-cad-param="${param}"]`);
const phaseOf = (page, id = PLATE) => quickOf(page, id).getAttribute('data-cad-quick-edit');
const shot = (page, name, locator = null) => (locator ? locator.screenshot({ path: `${OUT}/${name}.png` }) : page.screenshot({ path: `${OUT}/${name}.png` }));
const select = async (page, id = PLATE) => { await cardOf(page, id).locator('[data-drag-zone]').first().click(); await page.locator(`[data-cad-tools="${id}"]`).waitFor(); };
const defsOf = name => validateControls(designs[name].brief.controls);
const sorted = name => defsOf(name).parameters.map((p, index) => ({ p, index })).sort((a, b) => (a.p.priority ?? 50) - (b.p.priority ?? 50) || a.index - b.index).map(x => x.p);
const kindOf = p => (p.role === 'computed' ? 'readonly' : p.type === 'choice' ? 'select' : p.type === 'boolean' ? 'toggle' : p.type === 'count' ? 'integer' : p.slider ? 'slider' : 'number');
const firstInput = (name, test) => sorted(name).find(p => p.role === 'input' && test(p));
// Parameters picked by their definitions, never by name: the plate's first measured length with a diameter check, its count.
const PD = firstInput('plate-holes', p => designs['plate-holes'].checks.find(c => c.id === p.check)?.kind === 'circular_diameter_mm');
const PC = firstInput('plate-holes', p => p.type === 'count');
const PCONSTRAINT = defsOf('plate-holes').constraints.find(c => typeof c.right === 'string' && c.left === PD.id);
const PASSUMED = sorted('plate-holes').find(p => p.assumed);
// A value as the card writes it: the definition's precision, when it has one.
const shown = (p, v) => (p.precision !== undefined ? v.toFixed(p.precision) : String(v));

let { context: ownerContext, page } = await open();

await step('each fixture\'s Quick edit comes from its own definitions; the imported model has no controls', async () => {
  for (const name of order) {
    const id = ids[name];
    await cardOf(page, id).locator('[data-cad-quick-edit]').waitFor();
    if (!designs[name].brief.controls) {
      assert.equal(await phaseOf(page, id), 'unavailable');
      assert.equal(await cardOf(page, id).locator('[data-cad-input]').count(), 0, 'no pretend controls');
      continue;
    }
    const defs = sorted(name), shown = await cardOf(page, id).locator('[data-cad-param]').evaluateAll(rows => rows.map(r => [r.getAttribute('data-cad-param'), r.getAttribute('data-cad-control'), r.getAttribute('data-provenance')]));
    const more = await cardOf(page, id).locator('[data-cad-more]').count();
    if (more) await cardOf(page, id).locator('[data-cad-more]').click();
    const all = await cardOf(page, id).locator('[data-cad-param]').evaluateAll(rows => rows.map(r => [r.getAttribute('data-cad-param'), r.getAttribute('data-cad-control'), r.getAttribute('data-provenance')]));
    assert.deepEqual(all, defs.map(p => [p.id, kindOf(p), p.role === 'computed' ? 'computed' : p.assumed ? 'assumed' : 'requested']), `${name}: rows, controls and labels from its definitions`);
    assert.equal(shown.length, Math.min(4, defs.length), `${name}: the first four, the rest under More parameters`);
    for (const p of defs.filter(d => d.role === 'input' && d.type !== 'choice' && d.type !== 'boolean')) assert.equal(Number(await inputOf(page, p.id, id).inputValue()), p.value, `${name} ${p.id} shows its value`);
    for (const p of defs.filter(d => d.role === 'computed')) {
      const reported = FACTS[name].computed?.[p.id];
      assert.match(await rowOf(page, p.id, id).locator('[data-cad-readonly]').innerText(), reported == null ? /Not reported/ : new RegExp(String(reported).slice(0, 4)), `${name} ${p.id} calculated value`);
    }
    for (const p of defs.filter(d => d.role === 'input')) {
      const check = designs[name].checks.find(c => c.id === p.check);
      assert.equal(await rowOf(page, p.id, id).locator('[data-cad-measured]').getAttribute('data-cad-measured'), check ? 'passed' : 'none', `${name} ${p.id}: Measured only when a trusted check measures it`);
    }
    if (more) await cardOf(page, id).locator('[data-cad-more]').click();
  }
  assert.match(await rowOf(page, PASSUMED.id).innerText(), /Assumed/);
  await shot(page, 'after-1-quick-edit-fixtures-light');
  await shot(page, 'after-1-plate-quick-edit-light', cardOf(page));
});

await step('a draft stays a draft and survives a reload; integer counts and invalid combinations are refused with a reason', async () => {
  const before = await saved(PLATE), next = PD.value + 3;
  await inputOf(page, PD.id).fill(String(next));
  await until(async () => (await rowOf(page, PD.id).getAttribute('data-draft')) === 'true', 'no draft marker');
  assert.match(await rowOf(page, PD.id).innerText(), new RegExp(`Was ${shown(PD, PD.value)} mm.*Measured diameter ${shown(PD, PD.value)} mm on the displayed model`));
  assert.ok(await cardOf(page).locator('[data-cad-preview]').isEnabled());
  const now = await saved(PLATE), changed = Object.keys({ ...before, ...now }).filter(k => JSON.stringify(before[k]) !== JSON.stringify(now[k]));
  assert.deepEqual(changed, [], `a draft never reaches the board (changed: ${changed.map(k => `${k}: ${JSON.stringify(before[k])?.slice(0, 80)} -> ${JSON.stringify(now[k])?.slice(0, 80)}`).join('; ')})`);
  await page.reload(); await quickOf(page).waitFor();
  await until(async () => Number(await inputOf(page, PD.id).inputValue()) === next, 'the draft did not survive the reload');
  if (!await cardOf(page).locator('[data-cad-more-list]').count()) await cardOf(page).locator('[data-cad-more]').click();
  await inputOf(page, PC.id).fill(String(PC.value + 0.5));
  await until(async () => /whole number/.test(await rowOf(page, PC.id).innerText()), 'a fractional count is not refused');
  assert.equal(await cardOf(page).locator('[data-cad-preview]').isDisabled(), true);
  await inputOf(page, PC.id).fill(String(PC.value));
  // Both values valid on their own, the pair not: the constraint (left below right) must name itself.
  const right = defsOf('plate-holes').parameters.find(p => p.id === PCONSTRAINT.right);
  await inputOf(page, PD.id).fill(String(right.min + 2));
  await inputOf(page, right.id).fill(String(right.min + 1));
  await until(async () => (await cardOf(page).locator('[data-cad-draft-problem]').innerText().catch(() => '')).includes(PCONSTRAINT.message), 'the invalid combination is not explained');
  assert.equal(await cardOf(page).locator('[data-cad-preview]').isDisabled(), true);
  await shot(page, 'after-2-invalid-combination-light', cardOf(page));
  await inputOf(page, right.id).fill(String(right.value));
  await inputOf(page, PD.id).fill(String(next));
  assert.ok(await cardOf(page).locator('[data-cad-preview]').isEnabled());
});

await step('Preview change, reload during review, Accept: new revision saved, prompt kept, current values and Revisions shown', async () => {
  const before = await saved(PLATE);
  await inputOf(page, PD.id).fill('9');
  await cardOf(page).locator('[data-cad-preview]').click();
  await until(async () => (await phaseOf(page)) === 'building', 'no building state');
  assert.match(await cardOf(page).locator('[data-cad-rebuild="building"]').innerText(), new RegExp(`${PD.label} ${PD.value} mm → 9 mm`));
  await until(async () => (await phaseOf(page)) === 'review', 'the preview never became reviewable');
  assert.equal((await saved(PLATE)).revisionId, before.revisionId, 'the accepted model stays until Accept');
  assert.equal(await cardOf(page).locator('[data-cad-action="accept"]').count(), 0, 'one Accept, in Quick edit');
  await shot(page, 'after-3-review-light', cardOf(page));
  await page.reload(); await quickOf(page).waitFor();
  await until(async () => (await phaseOf(page)) === 'review', 'reload during review lost the review');
  await cardOf(page).locator('[data-cad-preview-toggle]').click();
  await until(async () => /Values of the preview/.test(await quickOf(page).innerText()), 'Show preview did not show the preview values');
  assert.equal(Number(await inputOf(page, PD.id).inputValue()), 9);
  await cardOf(page).locator('[data-cad-accept-change]').click();
  await until(async () => (await saved(PLATE)).revisionId !== before.revisionId, 'Accept did not save the new revision');
  const after = await saved(PLATE);
  assert.equal(after.promptUsed, PROMPT, 'a parameter-only Accept keeps the prompt');
  assert.equal(after.manifest.controls.values[PD.id], 9);
  assert.equal(after.revisions.at(-1).kind, 'parameters'); assert.equal(after.revisions.at(-1).parentRevisionId, before.revisionId);
  await until(async () => (await phaseOf(page)) === 'idle' && (await rowOf(page, PD.id).getAttribute('data-draft')) === null, 'the draft was not cleared');
  assert.match(await rowOf(page, PD.id).innerText(), new RegExp(`Measured diameter ${shown(PD, 9)} mm`), 'measurements are of the new revision');
  const toggle = name => cardOf(page).locator(`[data-cad-section-toggle="${name}"]`);
  await toggle('brief').click();
  assert.match(await cardOf(page).locator('[data-cad-current-values]').innerText(), new RegExp(`${PD.label}\\s+${shown(PD, 9)} mm`));
  assert.equal(await cardOf(page).locator('[data-cad-prompt-older]').count(), 1, 'the older prompt is marked as describing an earlier revision');
  await toggle('revisions').click();
  assert.equal(await cardOf(page).locator('[data-cad-section]').count(), 1, 'one section open at a time');
  const revision = cardOf(page).locator(`[data-cad-revision="${after.revisionId}"]`);
  assert.match(await revision.innerText(), new RegExp(`Parameter edit[\\s\\S]*${before.revisionId.slice(3, 11)} → ${after.revisionId.slice(3, 11)}[\\s\\S]*${PD.label} ${PD.value} mm → 9 mm; prompt unchanged`));
  await shot(page, 'after-3-accepted-revisions-light', cardOf(page));
});

const BR = ids.bracket, BL = firstInput('bracket', p => p.type === 'length' && designs.bracket.checks.find(c => c.id === p.check)?.axis === 'x');
await step('an executor without parameter support refuses before any job exists and offers Edit with AI', async () => {
  service.unsupported = true;
  const jobsBefore = jobs.size;
  await inputOf(page, BL.id, BR).fill(String(BL.value + 10));
  await cardOf(page, BR).locator('[data-cad-preview]').click();
  await until(async () => (await cardOf(page, BR).locator('[data-cad-rebuild-problem]').getAttribute('data-cad-rebuild-problem')) === 'executor_unsupported', 'no unsupported-executor refusal');
  assert.match(await cardOf(page, BR).locator('[data-cad-rebuild-problem]').innerText(), /cannot rebuild from parameter values/);
  assert.equal(await cardOf(page, BR).locator('[data-cad-ai-edit]').count(), 1, 'Edit with AI is offered');
  assert.equal(jobs.size, jobsBefore, 'no job was created'); assert.equal(await phaseOf(page, BR), 'idle');
  assert.equal(Number(await inputOf(page, BL.id, BR).inputValue()), BL.value + 10, 'the draft is kept');
  await shot(page, 'after-7-unsupported-executor-light', cardOf(page, BR));
  service.unsupported = false;
});

await step('a supported rebuild on another fixture, then Discard: the accepted model and card status come back', async () => {
  const before = await saved(BR);
  await cardOf(page, BR).locator('[data-cad-preview]').click();
  await until(async () => (await phaseOf(page, BR)) === 'review', 'the supported path did not reach review');
  await cardOf(page, BR).locator('[data-cad-discard]').click();
  await until(async () => (await phaseOf(page, BR)) === 'idle', 'Discard did not return to the accepted model');
  assert.equal(await cardOf(page, BR).locator('[data-cad-card]').getAttribute('data-cad-state'), 'ready');
  assert.equal(Number(await inputOf(page, BL.id, BR).inputValue()), BL.value, 'the draft is gone');
  assert.equal((await saved(BR)).revisionId, before.revisionId);
  assert.equal(await cardOf(page, BR).getByRole('button', { name: 'Retry generation' }).count(), 0);
});

await step('a failed rebuild keeps the accepted model and explains the refusal; Edit values keeps the draft', async () => {
  const before = await saved(PLATE);
  service.failNext = true;
  if (!await cardOf(page).locator('[data-cad-more-list]').count()) await cardOf(page).locator('[data-cad-more]').click();
  await inputOf(page, PC.id).fill(String(PC.max));
  await cardOf(page).locator('[data-cad-preview]').click();
  await until(async () => (await phaseOf(page)) === 'failed', 'no failed state');
  assert.match(await cardOf(page).locator('[data-cad-rebuild="failed"]').innerText(), new RegExp(FACTS.rejection.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(await quickOf(page).innerText(), /The accepted model is unchanged/);
  assert.equal((await saved(PLATE)).revisionId, before.revisionId);
  await shot(page, 'after-5-failed-rebuild-light', cardOf(page));
  await cardOf(page).locator('[data-cad-edit-values]').click();
  await until(async () => (await phaseOf(page)) === 'idle', 'Edit values did not return to editing');
  assert.equal(Number(await inputOf(page, PC.id).inputValue()), PC.max, 'Edit values keeps the draft');
  await cardOf(page).locator('[data-cad-reset]').click();
  assert.equal((await saved(PLATE)).revisionId, before.revisionId);
});

const CU = ids['linked-cube'], CE = firstInput('linked-cube', () => true), CY = ids.cylinder, CR = firstInput('cylinder', () => true);
await step('stale acceptance is refused and the accepted model stays; a stale Preview offers Reload model', async () => {
  const before = await saved(CU);
  await inputOf(page, CE.id, CU).fill(String(CE.value + 5));
  await cardOf(page, CU).locator('[data-cad-preview]').click();
  await until(async () => (await phaseOf(page, CU)) === 'review', 'no review');
  cards.get(CU).model = { ...cards.get(CU).model, revisionId: 'cr_newerelsewhere' }; // another tab accepted a newer revision
  await cardOf(page, CU).locator('[data-cad-accept-change]').click();
  await until(async () => /This preview cannot replace it/.test(await cardOf(page, CU).getByRole('alert').first().innerText()), 'stale Accept was not refused');
  assert.notEqual((await saved(CU)).revisionId, jobs.get(cards.get(CU).current).revisionId, 'the preview never replaced the accepted model');
  assert.notEqual(before.revisionId, undefined);
  await shot(page, 'after-6-stale-accept-light', cardOf(page, CU));
  cards.get(CY).model = { ...cards.get(CY).model, revisionId: 'cr_newerelsewhere2' };
  await inputOf(page, CR.id, CY).fill(String(CR.value + 1));
  await cardOf(page, CY).locator('[data-cad-preview]').click();
  await until(async () => (await cardOf(page, CY).locator('[data-cad-reload]').count()) === 1, 'a stale Preview offers no Reload model');
});

await step('Show dimensions: measured labels, Measured / Requested / Assumed apart, draft and focus marks, Not measured', async () => {
  await select(page);
  await page.locator(`[data-cad-tools="${PLATE}"] [data-cad-dimensions-toggle]`).click();
  const overlay = cardOf(page).locator('[data-cad-dimensions-overlay]');
  // At most three viewers render at once (viewer-slots.js); a click on a paused one takes a slot back.
  await until(async () => (await cardOf(page).locator('[data-cad-viewer]').getAttribute('data-viewer-live')) === 'true', 'the viewer is not live', 4000)
    .catch(() => cardOf(page).locator('[data-cad-click-surface]').click());
  await until(async () => (await cardOf(page).locator('[data-cad-viewer]').getAttribute('data-viewer-live')) === 'true', 'the viewer is not live');
  await until(async () => (await cardOf(page).locator('[data-cad-dimension]').count()) >= 4 && (await cardOf(page).locator('[data-cad-dimension="axis:x"]').evaluate(el => el.style.visibility)) === 'visible', 'no labels on the model');
  const accepted = await saved(PLATE), legend = cardOf(page).locator('[data-cad-dimensions-legend]');
  assert.equal(await overlay.getAttribute('data-cad-dimensions-overlay'), accepted.revisionId, 'measurements of the displayed revision');
  const x = defsOf('plate-holes').parameters.find(p => designs['plate-holes'].checks.find(c => c.id === p.check)?.axis === 'x');
  assert.match(await legend.locator('[data-cad-dimension-row="axis:x"]').innerText(), new RegExp(`Measured ${x.value} mm · Requested ${x.value} mm \\(${x.label}\\)`));
  const z = defsOf('plate-holes').parameters.find(p => designs['plate-holes'].checks.find(c => c.id === p.check)?.axis === 'z');
  assert.match(await legend.locator('[data-cad-dimension-row="axis:z"]').innerText(), new RegExp(z.assumed ? 'Assumed' : 'Requested'));
  assert.match(await legend.innerText(), /Other features: Not measured\./);
  await inputOf(page, PD.id).focus();
  await until(async () => (await cardOf(page).locator(`[data-cad-dimension="feature:${PD.id}"]`).getAttribute('data-highlight')) === 'true', 'focusing a parameter does not highlight its dimension');
  await inputOf(page, PD.id).fill('10');
  await until(async () => (await cardOf(page).locator('[data-cad-dimensions-stale]').count()) === 1, 'a draft does not mark the measurements as the displayed model\'s');
  await shot(page, 'after-8-dimensions-light', cardOf(page));
  await cardOf(page).locator('[data-cad-reset]').click();
  // A model with no trusted measurements: imported fixture with its facts withheld -> "Not measured."
  const imported = ids['imported-step'];
  await select(page, imported);
  await page.locator(`[data-cad-tools="${imported}"] [data-cad-dimensions-toggle]`).click();
  await until(async () => /Measured/.test(await cardOf(page, imported).locator('[data-cad-dimensions-legend]').innerText()), 'the imported model shows its measured size');
  assert.equal(await cardOf(page, imported).locator('[data-cad-dimension-row]').evaluateAll(rows => rows.filter(r => / · /.test(r.textContent)).length), 0, 'no requested values without definitions');
  await cardOf(page, 'cad-unmeasured').locator('[data-cad-viewer]').waitFor();
  assert.equal(await cardOf(page, 'cad-unmeasured').locator('[data-cad-dimensions-legend]').count(), 0, 'the toggle is per card');
  await select(page, 'cad-unmeasured');
  await page.locator('[data-cad-tools="cad-unmeasured"] [data-cad-dimensions-toggle]').click();
  await until(async () => (await cardOf(page, 'cad-unmeasured').locator('[data-cad-dimensions-legend]').innerText()) === 'Dimensions: Not measured.', 'an unmeasured model does not say Not measured.');
});

await step('Design brief, Checks one by one (generation apart from validation, unassessed listed) and the owner\'s Code', async () => {
  const card = cardOf(page);
  await card.locator('[data-cad-section-toggle="brief"]').click();
  assert.match(await card.locator('[data-cad-list="assumptions"]').innerText(), new RegExp(designs['plate-holes'].brief.assumptions[0].slice(0, 10)));
  await card.locator('[data-cad-section-toggle="checks"]').click();
  const checks = await card.locator('[data-cad-check]').evaluateAll(rows => rows.map(r => [r.getAttribute('data-cad-check'), r.getAttribute('data-check-status')]));
  assert.deepEqual(checks.map(c => c[0]), designs['plate-holes'].checks.map(c => c.id), 'each check listed');
  assert.match(await card.locator('[data-cad-generation]').innerText(), /geometry was built/);
  assert.match(await card.locator('[data-cad-validation-summary]').innerText(), new RegExp(`${checks.filter(c => c[1] === 'passed').length} passed`));
  for (const word of ['Fit with other parts', 'Strength', 'Interference', 'Manufacturability']) assert.match(await card.locator('[data-cad-list="unverified"]').innerText(), new RegExp(`${word}: not verified`));
  assert.match(await card.locator('[data-cad-list="exports"]').innerText(), /STEP: the exact solid geometry \(B-rep\)\. No feature history/);
  await card.locator('[data-cad-section-toggle="code"]').click();
  await until(async () => /from cad_params import value/.test(await card.locator('[data-cad-source]').innerText()), 'the owner does not see the saved source');
  assert.ok(sourceReads.includes('owner'));
  await shot(page, 'after-9-details-light', card);
});

await step('a share-link viewer: no Quick edit, no Code, no source read; brief, checks and revisions are there', async () => {
  const shared = await api(`${boardPath}/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, public_view: true, state: await board() }) });
  const viewer = await open({ signedIn: false, path: `/b/${shared.sharing.view}`, role: 'viewer' });
  const card = cardOf(viewer.page);
  try {
  await card.locator('[data-cad-details]').waitFor();
  // A read-only canvas selects a card first (hand mode); its contents then take the pointer.
  const title = await card.locator('[data-drag-zone]').first().boundingBox();
  await viewer.page.mouse.click(title.x + title.width / 2, title.y + title.height / 2);
  assert.equal(await card.locator('[data-cad-quick-edit]').count(), 0, 'no controls');
  assert.equal(await card.locator('[data-cad-input]').count(), 0);
  assert.equal(await card.locator('[data-cad-section-toggle="code"]').count(), 0, 'no Code section');
  await card.locator('[data-cad-section-toggle="brief"]').click();
  assert.match(await card.locator('[data-cad-current-values]').innerText(), new RegExp(PD.label));
  assert.ok(!(await card.innerText()).includes(designs['plate-holes'].brief.requirements[0]), 'no private brief requirements for a viewer');
  await card.locator('[data-cad-section-toggle="checks"]').click();
  assert.ok((await card.locator('[data-cad-check]').count()) > 0);
  await card.locator('[data-cad-section-toggle="revisions"]').click();
  assert.match(await card.locator('[data-cad-section="revisions"]').innerText(), /Parameter edit/);
  assert.equal(sourceReads.filter(r => r === 'viewer').length, 0, 'the viewer never asked for the source');
  await shot(viewer.page, 'after-10-share-viewer-light', card);
  } catch (error) { await viewer.page.screenshot({ path: `${OUT}/fail-10-viewer.png` }); throw error; } finally { await viewer.context.close(); }
});

const reviewOf = (p, id) => p.locator(`[data-cad-review="job-${id}"]`);
await step('Review design above the composer: exact request, assumptions, missing units block Generate, edit and re-approve, reload, Cancel', async () => {
  const a = reviewOf(page, 'cad-review-a'), b = reviewOf(page, 'cad-review-b');
  await b.waitFor({ timeout: 20000 });
  assert.equal(await b.locator('[data-cad-review-request]').innerText(), jobs.get('job-cad-review-b').request, 'the original request, exactly');
  assert.match(await b.locator('[data-cad-review-list="assumptions"]').innerText(), new RegExp(designs['plate-holes'].brief.assumptions[0].slice(0, 10)));
  assert.match(await b.locator('[data-cad-review-list="missing"]').innerText(), /Units of the screw size/);
  assert.match(await b.locator(`[data-cad-review-param="${PASSUMED.id}"]`).innerText(), /Assumed/);
  assert.equal(await b.locator('[data-cad-review-generate]').isDisabled(), true, 'missing information blocks Generate');
  assert.equal(await cardOf(page, 'cad-review-b').locator('[data-cad-review-hint]').count(), 1);
  await shot(page, 'after-11-review-design-light');
  await b.locator('[data-cad-review-edit]').click();
  await b.locator(`[data-cad-review-value="${PASSUMED.id}"]`).fill(String(PASSUMED.value + 1));
  await b.locator('[data-cad-review-field="missing"]').fill('');
  await shot(page, 'after-11-review-edit-light', b);
  await b.locator('[data-cad-review-save]').click();
  await until(async () => (await b.getAttribute('data-brief-hash')) === 'h-cad-review-b-2', 'the edit did not re-hash the brief');
  assert.match(await b.locator(`[data-cad-review-param="${PASSUMED.id}"]`).innerText(), new RegExp(`${PASSUMED.value + 1}[\\s\\S]*Requested`), 'a value the person set is no longer assumed');
  assert.ok(await b.locator('[data-cad-review-generate]').isEnabled());
  assert.equal(approvals.length, 0, 'editing approves nothing');
  await page.reload(); await reviewOf(page, 'cad-review-b').waitFor({ timeout: 20000 });
  assert.equal(await reviewOf(page, 'cad-review-b').getAttribute('data-brief-hash'), 'h-cad-review-b-2', 'reload keeps the edited review');
  await reviewOf(page, 'cad-review-b').locator('[data-cad-review-generate]').click();
  await until(async () => (await reviewOf(page, 'cad-review-b').count()) === 0, 'Generate did not leave review');
  assert.deepEqual(approvals.at(-1), { app: canvas.name, board: 'main', briefHash: 'h-cad-review-b-2', confirmed: true }, 'approval is bound to the edited brief');
  await until(async () => (await cardOf(page, 'cad-review-b').locator('[data-cad-card]').getAttribute('data-cad-state')) === 'ready', 'the approved design was not built');
  await reviewOf(page, 'cad-review-a').locator('[data-cad-review-cancel]').click();
  await until(async () => (await reviewOf(page, 'cad-review-a').count()) === 0 && jobs.get('job-cad-review-a').state === 'cancelled', 'Cancel did not end the review');
  assert.equal(approvals.length, 1);
});

await step('keyboard and tooltips: typing never reaches the canvas, More parameters by Enter, tooltips on focus', async () => {
  const input = inputOf(page, PD.id);
  await input.focus();
  for (const key of ['Backspace', 'Delete', 'Backspace']) await page.keyboard.press(key);
  await page.keyboard.type('7');
  assert.equal(await cardOf(page).count(), 1, 'Backspace and Delete in a parameter never delete the card');
  assert.equal(Number(await input.inputValue()), 7);
  await page.keyboard.press('Tab');
  const more = cardOf(page).locator('[data-cad-more]'), was = await more.getAttribute('aria-expanded');
  await more.focus(); await page.keyboard.press('Enter');
  await until(async () => (await more.getAttribute('aria-expanded')) !== was, 'Enter does not toggle More parameters');
  const chip = rowOf(page, PASSUMED.id).locator('[data-provenance-chip="assumed"]');
  if (!await chip.isVisible()) { await more.focus(); await page.keyboard.press('Enter'); }
  await chip.focus();
  await until(async () => /chose it|did not state/.test(await rowOf(page, PASSUMED.id).getByRole('tooltip').innerText()), 'no tooltip on focus');
  await cardOf(page).locator('[data-cad-preview]').focus();
  await until(async () => /No AI call/.test(await quickOf(page).getByRole('tooltip').filter({ hasText: 'Preview change' }).innerText()), 'Preview change has no tooltip');
  await shot(page, 'after-12-keyboard-tooltip-light', cardOf(page));
  await cardOf(page).locator('[data-cad-reset]').click();
});

await step('dark theme: Quick edit, dimensions, details and Review design on dark tokens', async () => {
  // cad-review-c stays under review for the dark shot (a and b were settled in light).
  const dark = await open({ dark: true });
  const card = cardOf(dark.page);
  await card.locator('[data-cad-quick-edit]').waitFor();
  const bg = await inputOf(dark.page, PD.id).evaluate(el => getComputedStyle(el).backgroundColor);
  assert.notEqual(bg, 'rgb(255, 255, 255)', 'inputs follow the dark surface');
  await inputOf(dark.page, PD.id).fill('8');
  await select(dark.page);
  await card.locator('[data-cad-section-toggle="checks"]').click();
  await reviewOf(dark.page, 'cad-review-c').waitFor({ timeout: 20000 });
  await shot(dark.page, 'after-13-dark-page');
  await shot(dark.page, 'after-13-dark-plate', card);
  await shot(dark.page, 'after-13-dark-review', reviewOf(dark.page, 'cad-review-c'));
  await card.locator('[data-cad-reset]').click();
  await dark.context.close();
});

await step('no browser errors, no model requests, nothing outside the stack', async () => {
  assert.deepEqual(errors, []);
  assert.deepEqual(refused.filter(path => !path.startsWith('viewer ')), [], 'no model request');
  // The app asks for its notebook origin on load (aborted here); nothing CAD leaves the stack.
  assert.deepEqual(outside.filter(host => !/notebook/.test(host)), []);
  assert.ok(writes.every(w => ['rebuild', 'accept', 'cancel', 'retry', 'brief', 'approve'].includes(w.action)), 'only CAD control actions were sent');
});

await ownerContext.close();
await browser.close();
const passed = results.filter(Boolean).length;
console.log(`${passed}/${total} CAD controls steps passed${results.length !== total ? ` (ran ${results.length})` : ''}`);
process.exit(passed === total && results.length === total ? 0 : 1);
