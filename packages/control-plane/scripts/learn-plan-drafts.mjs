// Three live learn-plan drafts (spec C:/Users/cyudhist/Downloads/learn-plan-toc-spec.md section 9): a science topic and a data topic of one repository, a structure topic of another.
// NOT RUN IN CI, not in a unit test, and NOT RUN yet: it makes REAL model calls on the owner stack (the stack has model keys).
//
// SPEND: three learn_plan calls, each capped at US$0.10 by the server (worst-case estimate; usually a few cents) with at most one re-ask each, so at most about US$0.60 worst case.
// ONLY when CANVAS_* are not set does it import the repositories itself (POST /api/repositories pinned to a commit) and generate their catalogues (the spec's cap is US$0.50 each).
// Name existing canvases with CANVAS_* and the stored catalogues are reused: no catalogue spend.
//
// Usage (the owner stack, from packages/control-plane; values are never printed):
//   BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 TEST_BYPASS_SECRET=<owner stack secret> node scripts/learn-plan-drafts.mjs
//   or VARS=<the owner stack's .dev.vars> in place of TEST_BYPASS_SECRET (default C:/s/explain-layout-web/packages/control-plane/.dev.vars).
//   Optional: CANVAS_NANOGPT / CANVAS_DATASETTE (a canvas of an already imported repository), COMMIT_NANOGPT / COMMIT_DATASETTE, OUT (default C:/s/spec/learn-plan-drafts-2026-11-15),
//   CP_LOG=<the control plane's log file> to record the learn_plan log line (worst-case estimate, path, calls) beside each draft.
// Each case: a fresh canvas, the learn option of that kind from the catalogue document (matched on `kind`, never on words), the goal saved with `start` (same call the browser makes),
// then POST /api/learn/codebase action learn_plan; the returned draft is written as <case>.json and <case>.md (title, numbered chapters and sections, the words, the rows, the elapsed time).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8878', CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/127\.0\.0\.1(:\d+)?$/.test(url)) throw Error('learn-plan-drafts runs against the local stack on 127.0.0.1 only (never localhost)');
const OUT = process.env.OUT || 'C:/s/spec/learn-plan-drafts-2026-11-15';
mkdirSync(OUT, { recursive: true });
let secret = process.env.TEST_BYPASS_SECRET;
if (!secret) { try { secret = readFileSync(process.env.VARS || 'C:/s/explain-layout-web/packages/control-plane/.dev.vars', 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)?.[1].trim(); } catch { /* named below */ } }
if (!secret) throw Error('set TEST_BYPASS_SECRET, or VARS to the owner stack .dev.vars that holds it (the value is never printed)');
const run = Date.now().toString(36);

const up = await fetch(`${BASE}/sign-in`).then(r => r.status, () => 0);
if (up !== 200) throw Error(`the app on ${BASE} does not answer /sign-in (status ${up}); start the owner stack first`);
const minted = await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `plan-${run}@example.com`, secret }) }).then(r => r.json(), () => ({}));
if (!minted.session) throw Error(`the control plane on ${CP} minted no session (is the owner stack up with TEST_BYPASS_SECRET?)`);
const api = async (path, init = {}) => {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${minted.session}`, 'content-type': 'application/json' } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(`${init.method || 'GET'} ${path.split('?')[0]}: HTTP ${r.status} ${d.error || ''}`);
  return d;
};
const sleep = ms => new Promise(done => setTimeout(done, ms));
const waitFor = async (read, what, ms = 120000) => { const end = Date.now() + ms; for (;;) { const value = await read().catch(() => null); if (value) return value; if (Date.now() > end) throw Error(`timed out: ${what}`); await sleep(2000); } };

const REPOS = {
  nano: { env: 'CANVAS_NANOGPT', url: 'https://github.com/karpathy/nanoGPT', branch: 'master', commit: process.env.COMMIT_NANOGPT || '3adf61e' },
  data: { env: 'CANVAS_DATASETTE', url: 'https://github.com/simonw/datasette', branch: 'main', commit: process.env.COMMIT_DATASETTE || 'e9d45fe' },
};
// spec section 9: the three cases, by the option's `kind`
const CASES = [{ id: 'nano-science', repo: 'nano', kind: 'science' }, { id: 'nano-data', repo: 'nano', kind: 'data' }, { id: 'datasette-structure', repo: 'data', kind: 'structure' }];
const made = { canvases: [], projects: [] };
const canvasIn = async (project, title) => { const name = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title, project }) })).name; made.canvases.push(name); return name; };
const prepared = {};
async function prepare(key) {
  if (prepared[key]) return prepared[key];
  const R = REPOS[key], given = process.env[R.env];
  let project;
  if (given) project = (await api(`/api/learn/codebase?app=${encodeURIComponent(given)}&board=main`)).repository?.app;
  else { project = (await api('/api/repositories', { method: 'POST', body: JSON.stringify({ url: R.url, branch: R.branch, commit: R.commit }) })).name; made.projects.push(project); }
  if (!project) throw Error(`${R.env}: that canvas has no repository`);
  const probe = await canvasIn(project, `Plan drafts ${key} ${run}`);
  await waitFor(async () => { const g = await api(`/api/learn/rehearsal?app=${probe}&board=main`); if (g.indexing === 'failed') throw Error(`${key}: indexing failed`); return g.indexing === 'ready'; }, `${key}: the repository is indexed`);
  const doc = await waitFor(async () => { const out = await api('/api/learn/rehearsal', { method: 'POST', body: JSON.stringify({ app: probe, board: 'main', action: 'catalogue' }) }); if (out.catalogue?.status === 'failed') throw Error(`${key}: the catalogue failed`); return out.catalogue?.status === 'ready' && out.catalogue.catalogueDoc?.learn ? out.catalogue.catalogueDoc : null; }, `${key}: the catalogue document with its learn section`);
  return (prepared[key] = { project, doc });
}

const render = (draft, text) => {
  const ops = draft.proposal.ops, lines = [];
  let chapter = 0, section = 0;
  for (const op of ops) {
    if (op.level === 1) { chapter += 1; section = 0; lines.push(`${chapter}. ${op.text}${op.description ? `\n   ${op.description}` : ''}`); }
    else { section += 1; lines.push(`   ${chapter}.${section} ${op.text}${op.description ? `\n        ${op.description}` : ''}`); }
  }
  return `${text}\n\n${lines.join('\n')}\n`;
};
// The learn_plan log line the control plane wrote while the call ran (worst-case estimate, the path, the number of calls), when CP_LOG names the log file.
const logSince = (offset) => {
  if (!process.env.CP_LOG) return null;
  try {
    const lines = readFileSync(process.env.CP_LOG, 'utf8').slice(offset).split('\n').map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(line => line?.event === 'learn_plan');
    return lines.at(-1) ?? null;
  } catch { return null; }
};
const logSize = () => { try { return process.env.CP_LOG ? readFileSync(process.env.CP_LOG, 'utf8').length : 0; } catch { return 0; } };

const summary = [];
try {
  for (const c of CASES) {
    const { project, doc } = await prepare(c.repo);
    const option = (doc.learn.options || []).find(o => o.kind === c.kind);
    if (!option) { console.log(`skip ${c.id}: the catalogue has no learn option of kind ${c.kind} (it has ${(doc.learn.options || []).map(o => o.kind).join(', ')})`); summary.push({ case: c.id, skipped: true }); continue; }
    const canvas = await canvasIn(project, `Plan ${c.id} ${run}`);
    const state = (await api(`/api/learn/coaching?app=${canvas}&board=main`)).state;
    const started = await api('/api/learn/codebase', { method: 'POST', body: JSON.stringify({ app: canvas, board: 'main', action: 'start', goal: 'learn_concept', learn: option, actionId: `plan-${run}-${c.id}`.slice(0, 120), expectedRevision: state.revision }) });
    if (started.route !== 'started') throw Error(`${c.id}: the learn goal was not saved (${started.route})`);
    const before = logSize(), t0 = Date.now();
    const draft = await api('/api/learn/codebase', { method: 'POST', body: JSON.stringify({ app: canvas, board: 'main', action: 'learn_plan', learn: { ...option, options: doc.learn.options }, outline: [], outlineRevision: 'r0', draft: null, edit: null }) });
    const ms = Date.now() - t0;
    await sleep(500);
    const cost = logSince(before);
    writeFileSync(`${OUT}/${c.id}.json`, JSON.stringify({ case: c.id, option: { id: option.id, label: option.label, kind: option.kind }, ms, log: cost, draft }, null, 2));
    if (draft.proposal) writeFileSync(`${OUT}/${c.id}.md`, `# ${c.id} (${option.label})\n\nrows: ${(draft.rows || []).map(r => r.id ?? r).join(', ')} | path: ${draft.path} | ${ms} ms${cost ? ` | worst-case estimate US$${(cost.estimate_usd || []).reduce((a, b) => a + b, 0).toFixed(4)} over ${cost.calls} call(s)` : ''}\n\n${render(draft, draft.text)}`);
    console.log(`${c.id}: ${draft.error ? `ERROR ${draft.error}` : `${draft.proposal.ops.length} ops, path ${draft.path}`} in ${ms} ms${cost ? `, ${cost.calls} call(s)` : ''}`);
    summary.push({ case: c.id, ms, error: draft.error ?? null, ops: draft.proposal?.ops.length ?? null, path: draft.path ?? null, log: cost });
  }
  writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 2));
} finally {
  for (const name of made.canvases) await api(`/api/apps/${name}`, { method: 'DELETE' }).catch(error => console.log(`cleanup: canvas ${name}: ${error.message}`));
  for (const name of made.projects) await api(`/api/repositories/${name}`, { method: 'DELETE' }).catch(error => console.log(`cleanup: project ${name}: ${error.message}`));
}
