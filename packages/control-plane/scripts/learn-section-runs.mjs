// Learn sections acceptance runs (docs/features/learn-sections, owner overnight 2026-11-16). NOT RUN IN CI. REAL model calls on the owner stack.
// Signed in as a mock test user (C:/s/spec/sections-evidence/signin.sh writes the cookie jar); values are never printed.
//   node scripts/learn-section-runs.mjs prepare                 import nanoGPT + datasette, catalogue, one canvas each, start, learn_plan, accept (learn_plan_save)
//   node scripts/learn-section-runs.mjs brief <case> <n.m>...   learn_section_brief for each section, in order (case: nano | data)
//   node scripts/learn-section-runs.mjs compose <case> <n.m>... learn_section_compose
//   node scripts/learn-section-runs.mjs make <case> <n.m>       learn_section_make over every item, then 'notes'; never performs (API-level)
// Env: JAR (default C:/s/spec/sections-evidence/jar.txt), OUT (default ../../docs/features/learn-sections), CP_LOG (the stack log, for cost lines), REDO=1.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:8878';
const OUT = process.env.OUT || new URL('../../../docs/features/learn-sections/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const STATE = `${OUT}/runs-state.json`;
const jar = readFileSync(process.env.JAR || 'C:/s/spec/sections-evidence/jar.txt', 'utf8');
const session = jar.split('\n').map(line => line.split('\t')).find(cols => cols[5] === 'small_session')?.[6]?.trim();
if (!session) throw Error('no small_session in the cookie jar; run signin.sh first');
const api = async (path, init = {}) => {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(Error(`${init.method || 'GET'} ${path.split('?')[0]}: HTTP ${r.status} ${d.error || ''}`), { body: d, status: r.status });
  return d;
};
const post = (body) => api('/api/learn/codebase', { method: 'POST', body: JSON.stringify(body) });
const sleep = ms => new Promise(done => setTimeout(done, ms));
const waitFor = async (read, what, ms = 900000) => { const end = Date.now() + ms; for (;;) { const value = await read().catch(error => { if (error.fatal) throw error; return null; }); if (value) return value; if (Date.now() > end) throw Error(`timed out: ${what}`); await sleep(3000); } };
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2));
const write = (dir, name, data) => { mkdirSync(`${OUT}/${dir}`, { recursive: true }); writeFileSync(`${OUT}/${dir}/${name}`, typeof data === 'string' ? data : JSON.stringify(data, null, 2)); };
const logSize = () => { try { return process.env.CP_LOG ? readFileSync(process.env.CP_LOG, 'utf8').length : 0; } catch { return 0; } };
const logSince = (offset, events) => { try { return process.env.CP_LOG ? readFileSync(process.env.CP_LOG, 'utf8').slice(offset).split('\n').map(l => { try { return JSON.parse(l.slice(l.indexOf('{'))); } catch { return null; } }).filter(l => l && events.some(e => String(l.event || l.feature || '').includes(e))) : []; } catch { return []; } };

const REPOS = {
  nano: { url: 'https://github.com/karpathy/nanoGPT', branch: 'master', commit: '3adf61e', kind: 'data' },
  data: { url: 'https://github.com/simonw/datasette', branch: 'main', commit: 'e9d45fe', kind: 'structure' },
};
// n.m -> the plan op key of that section (level 2 under the n-th level 1)
const sectionKey = (ops, ref) => { const [n, m] = ref.split('.').map(Number); let c = 0, s = 0; for (const op of ops) { if (op.level === 1) { c += 1; s = 0; } else { s += 1; if (c === n && s === m) return op.key ?? op.id; } } throw Error(`no section ${ref}`); };

async function prepare() {
  for (const [key, R] of Object.entries(REPOS)) {
    if (state[key]?.planAccepted) { console.log(`${key}: prepared (${state[key].canvas})`); continue; }
    const s = (state[key] ||= {});
    if (!s.project) { s.project = (await api('/api/repositories', { method: 'POST', body: JSON.stringify({ url: R.url, branch: R.branch, commit: R.commit }) })).name; save(); }
    if (!s.canvas) { s.canvas = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Sections evidence ${key}`, project: s.project }) })).name; save(); }
    await waitFor(async () => { const g = await api(`/api/learn/rehearsal?app=${s.canvas}&board=main`); if (g.indexing === 'failed') throw Object.assign(Error(`${key}: indexing failed`), { fatal: true }); return g.indexing === 'ready'; }, `${key} indexed`);
    const doc = await waitFor(async () => { const out = await api('/api/learn/rehearsal', { method: 'POST', body: JSON.stringify({ app: s.canvas, board: 'main', action: 'catalogue' }) }); if (out.catalogue?.status === 'failed') throw Object.assign(Error(`${key}: catalogue failed`), { fatal: true }); return out.catalogue?.status === 'ready' && out.catalogueDoc?.learn ? out.catalogueDoc : null; }, `${key} catalogue`);
    const option = doc.learn.options.find(o => o.kind === R.kind) || doc.learn.options[0];
    s.option = option; save();
    const coach = (await api(`/api/learn/coaching?app=${s.canvas}&board=main`)).state;
    const started = await post({ app: s.canvas, board: 'main', action: 'start', goal: 'learn_concept', learn: option, actionId: `sec-${Date.now().toString(36)}-${key}`, expectedRevision: coach.revision });
    if (started.route !== 'started') throw Error(`${key}: start returned ${started.route}`);
    const before = logSize();
    const draft = await post({ app: s.canvas, board: 'main', action: 'learn_plan', learn: { ...option, options: doc.learn.options }, outline: [], outlineRevision: 'r0', draft: null, edit: null });
    if (!draft.proposal) throw Error(`${key}: learn_plan returned no proposal: ${draft.error || JSON.stringify(draft).slice(0, 300)}`);
    await post({ app: s.canvas, board: 'main', action: 'learn_plan_save', plan: { ops: draft.proposal.ops, revision: draft.proposal.base, acceptedAt: new Date().toISOString(), text: draft.text } });
    s.ops = draft.proposal.ops; s.planAccepted = true; save();
    write('prepare', `${key}-plan.json`, { option: { id: option.id, label: option.label, kind: option.kind }, draft, log: logSince(before, ['learn_plan']) });
    console.log(`${key}: plan accepted, ${draft.proposal.ops.length} ops on ${s.canvas}`);
  }
}

async function step(action, key, refs) {
  const s = state[key];
  if (!s?.planAccepted) throw Error(`${key}: run prepare first`);
  const dir = action === 'learn_section_brief' ? 'brief' : 'compose';
  for (const ref of refs) {
    const sectionId = ref, before = logSize(), t0 = Date.now();
    let out;
    try { out = await post({ app: s.canvas, board: 'main', action, sectionId, ...(process.env.REDO ? { redo: true } : {}) }); }
    catch (error) { out = { httpError: error.message, body: error.body }; }
    const ms = Date.now() - t0;
    await sleep(500);
    write(dir, `${key}-${ref}.json`, { case: key, section: ref, sectionId, ms, out, log: logSince(before, ['learn_section']) });
    console.log(`${dir} ${key} ${ref}: ${out.httpError || out.error || 'ok'} in ${ms} ms`);
  }
}

async function make(key, ref, only = null) { // only: remake that one item and stop
  const s = state[key], sectionId = ref;
  const composition = JSON.parse(readFileSync(`${OUT}/compose/${key}-${ref}.json`, 'utf8')).out.composition;
  let itemId = only || composition.items[0]?.id;
  const made = [];
  while (itemId) {
    const before = logSize(), t0 = Date.now();
    let out;
    try { out = await post({ app: s.canvas, board: 'main', action: 'learn_section_make', sectionId, itemId }); }
    catch (error) { out = { httpError: error.message, body: error.body }; }
    const ms = Date.now() - t0;
    await sleep(500);
    made.push({ itemId, ms, out, log: logSince(before, ['learn_section']) });
    write('make', `${key}-${ref}-${itemId}.json`, { case: key, section: ref, sectionId, itemId, ms, out, log: made.at(-1).log });
    console.log(`make ${key} ${ref} ${itemId}: ${out.httpError || out.error || out.skipped?.note || out.perform?.op || 'ok'} in ${ms} ms`);
    if (out.perform || out.skipped) await post({ app: s.canvas, board: 'main', action: 'learn_section_made', sectionId, itemId, jobId: `api-level-${itemId}` }).catch(error => console.log(`made ${itemId}: ${error.message}`));
    itemId = only ? null : out.next ?? null;
  }
  if (!only) write('make', `${key}-${ref}-summary.json`, made.map(m => ({ itemId: m.itemId, ms: m.ms, op: m.out.perform?.op ?? null, skipped: m.out.skipped ?? null, error: m.out.httpError || m.out.error || null })));
}

const [cmd, key, ...refs] = process.argv.slice(2);
if (cmd === 'prepare') await prepare();
else if (cmd === 'brief') await step('learn_section_brief', key, refs);
else if (cmd === 'compose') await step('learn_section_compose', key, refs);
else if (cmd === 'make') await make(key, refs[0], refs[1] || null);
else throw Error('usage: prepare | brief <case> <n.m>... | compose <case> <n.m>... | make <case> <n.m> [itemId]');
