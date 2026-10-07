// The indexed nanoGPT repository for checks on the LOCAL stack (workspace-check.mjs, rabbit-hole-check.mjs LOCAL=1). The
// keyless stack has no indexer, so the repository project's endpoints are stubbed with a Graphify-shaped snapshot
// (index_repository.py) read off the real nanoGPT files pinned in packages/learn-render (commit 3adf61e).
import { readFileSync } from 'node:fs';

// ── The repository snapshot: real files, a graph in the indexer's shape (file nodes named after the file, classes, functions,
// methods, externals; contains / method / imports / imports_from, all EXTRACTED). Not product data: it stands in for the indexer.
const SRC = new URL('../../learn-render/motion/fixtures/sources/nanogpt-3adf61e/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('MANIFEST.json', SRC), 'utf8'));
export const COMMIT = manifest.commit;
const paths = Object.keys(manifest.files).filter((p) => p.endsWith('.py'));
export const content = Object.fromEntries(paths.map((p) => [p, readFileSync(new URL(p, SRC), 'utf8').replace(/\r\n/g, '\n')]));
const idOf = (p) => p.replace(/\.py$/, '').replace(/\//g, '_');
const nodes = [], edges = [], seen = new Set();
const edge = (source, target, relation) => { const k = `${source}>${target}>${relation}`; if (!seen.has(k)) { seen.add(k); edges.push({ source, target, relation, confidence: 'EXTRACTED' }); } };
for (const p of paths) {
  const f = idOf(p); let cls = null;
  nodes.push({ id: f, label: p.split('/').pop(), path: p, line: 1, kind: 'code' });
  content[p].split('\n').forEach((text, i) => {
    let m;
    if ((m = text.match(/^class (\w+)/))) { cls = `${f}_${m[1].toLowerCase()}`; nodes.push({ id: cls, label: m[1], path: p, line: i + 1, kind: 'code' }); edge(f, cls, 'contains'); return; }
    if (/^[^\s#@)\]}]/.test(text)) cls = null;
    if ((m = text.match(/^def (\w+)/))) { nodes.push({ id: `${f}_${m[1]}`, label: `${m[1]}()`, path: p, line: i + 1, kind: 'symbol' }); edge(f, `${f}_${m[1]}`, 'contains'); }
    else if (cls && (m = text.match(/^ {4}def (\w+)/))) { nodes.push({ id: `${cls}_${m[1]}`, label: `.${m[1]}()`, path: p, line: i + 1, kind: 'symbol' }); edge(cls, `${cls}_${m[1]}`, 'method'); }
    if ((m = text.match(/^import (\w+)/) || text.match(/^from (\w+)[\w.]* import/))) {
      const local = paths.includes(`${m[1]}.py`), target = local ? idOf(`${m[1]}.py`) : m[1];
      if (!local && !nodes.some((n) => n.id === target)) nodes.push({ id: target, label: target, path: null, line: 1, kind: 'external' });
      edge(f, target, text.startsWith('from') ? 'imports_from' : 'imports');
    }
  });
}
export const SNAPSHOT = { repo: 'karpathy/nanoGPT', commit: COMMIT, version: 'graphify', skipped: [], files: paths.map((p) => ({ path: p, lines: content[p].split('\n').length })), graph: { nodes, edges } };
export const REPO = 'repo-3adf61e1-nanogpt';

// The project's catalog row, owned by the signed-in user (real: their own /api/apps answer).
export const repoRow = (real, status = 'ready') => ({ name: REPO, org: real.org, orgName: real.orgName, kind: 'repository', repo: 'karpathy/nanoGPT', branch: 'master', description: '', owner_email: real.email, email: real.email, deployed_at: '2026-10-06T09:00:00Z', created_at: '2026-10-06T09:00:00Z', visibility: 'private', members: [], teams: [], observations: [], canEdit: true, schedule: null, commit_sha: COMMIT, status });

// Stubs the project on a browser context: /api/apps gains its row; the project, its snapshot and its file reads answer from
// the fixture. status() is read on every request (a refresh can start mid-check). Every other request goes on to the stack;
// a route registered later (an /api/learn/ask stub) runs first.
// A check that closes its page mid-request makes Playwright reject fetch, json and fulfill with a teardown error (a
// TargetClosedError, or "Response has been disposed"). Unhandled, one crashed the harness and left its browser running
// (2026-10-07). Such an error is dropped only once the request's page or the context is confirmed closed: nothing is left
// to answer. The same wording from a page that is still open, or any other error, still fails the check.
const teardownWording = (error) => String(error?.name).startsWith('TargetClosedError') || /has been (closed|disposed)|context disposed/.test(String(error?.message));
// The rejection can arrive just before the close event, so an open page or context gets this long for its close event.
export const CLOSE_WAIT_MS = 2000;
export const routeRepository = (context, status = () => 'ready') => {
  let row, contextClosed = false;
  context.once('close', () => { contextClosed = true; });
  const closed = (route) => {
    let page = null;
    try { page = route.request().frame().page(); } catch {} // a worker's request has no frame
    if (contextClosed || page?.isClosed()) return true;
    return new Promise((resolve) => {
      const done = (value) => { clearTimeout(timer); resolve(value); };
      const timer = setTimeout(() => done(contextClosed || !!page?.isClosed()), CLOSE_WAIT_MS);
      context.once('close', () => done(true));
      page?.once('close', () => done(true));
    });
  };
  return context.route('**/api/**', (route) => serve(route).catch(async (error) => { if (!(teardownWording(error) && await closed(route))) throw error; }));
  async function serve(route) {
    const p = new URL(route.request().url()).pathname;
    if (p === '/api/apps' && route.request().method() === 'GET') {
      const real = await (await route.fetch()).json();
      row = repoRow(real, status());
      return route.fulfill({ json: { ...real, apps: [row, ...real.apps] } });
    }
    if (p === `/api/apps/${REPO}`) return route.fulfill({ json: { ...row, status: status() } });
    if (p === `/api/repositories/${REPO}`) return route.fulfill({ json: { ...row, status: status() } });
    if (p === `/api/repositories/${REPO}/snapshot`) return route.fulfill({ json: SNAPSHOT });
    if (p === `/api/repositories/${REPO}/file`) { const { path } = JSON.parse(route.request().postData()); return route.fulfill({ json: { path, commit: COMMIT, content: content[path] } }); }
    return route.continue();
  }
};
