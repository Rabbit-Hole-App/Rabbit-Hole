// packages/control-plane/src/learn-codebase-source-map.js
// Learning from a codebase (C:/s/spec/tutor-workflow/draft.md "Starting from a codebase", Task 12). The repository's
// existing bounded retrieval (repository-context.js repositoryTool: query_graph, search_code, read_source over the indexed
// snapshot) is narrowed here to a learning source map for one goal; no new indexer. Each node carries its exact source:
// the repository, the commit, the SHA-256 of the whole file at that commit and the cited lines. Edges the indexer read from
// the code are supported; every other edge stays tentative. What was left out is listed: secrets (never read or shown),
// generated, vendored, minified and lock files, files the indexer skipped, code outside the snapshot, and related files not
// shown. Repository content is material, never instructions: it is read as text and cannot choose a tool, a write or a
// permission. Nothing here calls a model or runs code.
//
//   learningSourceMap(snapshot, {goal, question, selectedRefs}) -> {repository, goal, found, nodes, edges, citations, omissions, omissionCounts}
//   buildLearningSourceMap(env, actor {org, email}, {repositoryRef, revision, goal, question, selectedRefs}) -> the map, or null when
//     that repository version is not readable by the actor (repositories.js readableVersion)
//   codebaseActivity(goal, map, {focus, app, index}) -> the goal's question `index` (0: the first), with its citations
//   sourceDrift(sourceRefs, snapshot) -> which cited files changed or went, by content hash
//
// The route, POST/GET /api/learn/codebase (the signed-in learner's own canvas, as the coaching route resolves it):
//   GET  ?app=&board=  -> {repository: {app, repo, commit} | null, activity: {activityId, commit, items, stale, unavailable} | null}
//   POST {action: 'start', app, board, goal, question?, selectedRefs?, actionId, expectedRevision}
//        -> {route: 'started', state, activityId, map} | {route: 'not_found', map}; the goal and its first activity are saved
//           through the coaching store (learn 0025) - no new table
//   POST {action: 'refresh', app, board, activityId, actionId, expectedRevision} -> {state, activityId, drift}: a new activity
//        at the current commit; the old one keeps its revision, its attempts and its feedback
//   POST {action: 'another', app, board, activityId, actionId, expectedRevision} -> {state, activityId}: Try another question,
//        the goal's next question on the same sources at the same commit (owner brief 2026-10-21 "Activity states")
import { CODEBASE_GOALS, REPOSITORY_SOURCE, excludedReason, fileRole, goalOf, indexVocabulary, isRepositorySource, repositoryRelevance, snapshotIndex } from '../../web/src/learn-codebase-goals.js';
import { parseCodeRef, repositoryTool } from './repository-context.js';
import { readableVersion, repositorySnapshot } from './repositories.js';
import { sha256Hex } from './learn-grade-jev.js';
import { authorizedBoardApp } from './learn-board.js';
import { subscriptionOwnerRefusal } from './subscription-transport.js';
import { CoachingConflict, applyCoachingAction, readCoachingState } from './learn-coaching-store.js';
import { NOT_TRASHED } from './library-trash.js';

const MAX_FILES = 8, CITE_LINES = 30, DOC_LINES = 40, EXCERPT = 12000, MAX_EDGES = 12, MAX_OMISSIONS = 20, MAX_NOT_SHOWN = 6;
const SUPPORTED = new Set(['EXTRACTED', 'RECORDED']); // read from the code by the indexer (REPOSITORY_SYSTEM); the rest is inferred
const ROLE_ORDER = ['source', 'test', 'config', 'docs'];
const clip = (text, max) => { const t = String(text || '').replace(/\s+/g, ' ').trim(); return t.length > max ? `${t.slice(0, max - 1)}…` : t; };
const depth = path => path.split('/').length;

// A symbol's whole body (integrator ruling 2026-10-21, defect 1: a fixed 30 lines from a class's start left out the forward pass
// a question was about): from its line, every following line indented deeper than it or blank, and a closing bracket at its own
// indent. Layout-based, so it serves Python and brace languages alike; the caller caps it at the 120-line read.
export function symbolEnd(lines, line) {
  const indent = text => text.match(/^\s*/)[0].length, head = lines[line - 1];
  if (head == null || !head.trim()) return line;
  let end = line;
  for (let i = line; i < lines.length; i += 1) {
    const text = lines[i];
    if (!text.trim()) continue;
    if (indent(text) > indent(head)) { end = i + 1; continue; }
    if (indent(text) === indent(head) && /^\s*[)\]}]/.test(text)) end = i + 1;
    break;
  }
  return end;
}

// expand: false re-cites exactly the selected files (a refreshed activity keeps its sources; nothing new is pulled in).
export async function learningSourceMap(snapshot, { goal, question = '', selectedRefs = [], expand = true }, { tool = repositoryTool } = {}) {
  const g = typeof goal === 'string' ? goalOf(goal) : goal;
  if (!g) throw Error('unknown goal');
  const files = snapshot.files || {}, graph = snapshot.graph || { nodes: [], edges: [] }, repo = snapshot.repo, commit = snapshot.commit;
  // Only the existing read-only tools, and a failed read is a missing piece, never an error the learner sees.
  const read = (name, input) => { try { return tool(snapshot, name, input); } catch { return null; } };
  const omissions = [], omissionCounts = {};
  const omit = (path, reason, detail = null) => {
    omissionCounts[reason] = (omissionCounts[reason] || 0) + 1;
    if (omissions.length < MAX_OMISSIONS) omissions.push({ path: clip(path, 300), reason, ...(detail ? { detail: clip(detail, 120) } : {}) });
  };
  const excluded = new Map();
  for (const [path, content] of Object.entries(files)) { const why = excludedReason(path, content); if (why) { excluded.set(path, why); omit(path, why); } }
  for (const skipped of snapshot.skipped || []) omit(typeof skipped === 'string' ? skipped : skipped?.path, 'not_indexed', skipped?.reason);
  // A file the learner selected may be generated or vendored; a secret never.
  const usable = (path, selected = false) => !!path && Object.hasOwn(files, path) && (!excluded.has(path) || (selected && excluded.get(path) !== 'secret'));
  const picked = new Map();
  const take = (path, at = {}) => { if (picked.has(path) || picked.size >= MAX_FILES) return; picked.set(path, { role: fileRole(path), ...at }); };

  // 1. The learner's selection: identity only, resolved against this snapshot (repository-context.js parseCodeRef).
  for (const ref of selectedRefs || []) {
    const at = parseCodeRef(ref);
    if (!at || at.repo !== repo) { omit(ref?.name || 'selection', 'other_repository'); continue; }
    if (at.commit !== commit) { omit(at.path || ref?.name || 'selection', 'other_commit', at.commit.slice(0, 7)); continue; }
    const node = at.nodeId ? graph.nodes.find(n => n.id === at.nodeId) : null, path = node?.path || ref.range?.path || at.path;
    if (!path || !Object.hasOwn(files, path)) { omit(path || ref?.name || 'selection', 'not_in_snapshot'); continue; }
    if (usable(path, true)) take(path, { line: ref.range?.start || node?.line || null, end: ref.range?.end || null, symbol: node?.label || null, origin: 'selected' });
  }
  // 2. The request's words that name something in the index, matched by the existing graph query (labels and paths, one hop).
  const relevance = question ? repositoryRelevance(null, question, indexVocabulary(snapshotIndex(snapshot))) : { relevant: false, terms: [], matches: [] };
  const stems = relevance.matches.filter(token => token.length > 2);
  const found = picked.size > 0 || stems.length > 0;
  if (expand && stems.length) {
    const sub = read('query_graph', { query: stems.join(' ').slice(0, 200) });
    const byId = new Map(graph.nodes.map(n => [n.id, n]));
    const ranked = (sub?.seeds || []).map(id => byId.get(id)).filter(n => usable(n?.path));
    for (const role of g.roles) for (const n of ranked) if (fileRole(n.path) === role) take(n.path, { line: n.line, symbol: n.label, origin: 'request' });
    for (const n of ranked) take(n.path, { line: n.line, symbol: n.label, origin: 'request' });
  }
  // One hop along the indexer's links from what was selected or matched (imports, calls), so the path can be traced; files
  // further out stay listed as not shown, to expand on request.
  const fileOf = new Map(graph.nodes.map(n => [n.id, n.path || null]));
  for (const path of expand ? [...picked.keys()] : []) {
    for (const edge of graph.edges) {
      const a = fileOf.get(edge.source), b = fileOf.get(edge.target), other = a === path ? b : b === path ? a : null;
      if (other && other !== path && usable(other) && g.roles.includes(fileRole(other))) take(other, { origin: 'related' });
    }
  }
  // 3. The goal's own roles: tests that name a picked symbol, the shallowest manifest and documentation.
  const symbols = [...picked.values()].map(p => p.symbol).filter(s => s && !/\.\w+$/.test(s)).map(s => s.replace(/^\.|\(\)$/g, '')).slice(0, 3);
  const byRole = role => Object.keys(files).filter(p => usable(p) && fileRole(p) === role).sort((a, b) => depth(a) - depth(b) || a.localeCompare(b));
  for (const role of expand ? g.roles : []) {
    if ([...picked.values()].some(p => p.role === role)) continue;
    if (role === 'test') {
      const hits = symbols.flatMap(s => read('search_code', { query: s })?.matches || []).map(m => m.path).filter(p => usable(p) && fileRole(p) === 'test');
      const tests = hits.length ? hits : g.id === 'prepare_contribute' ? byRole('test') : [];
      if (tests[0]) take(tests[0], { origin: 'role' });
    } else if (role === 'docs') {
      for (const p of byRole('docs').filter(p => /^(readme|contributing)/i.test(p.split('/').pop())).slice(0, 2)) take(p, { origin: 'role' });
    } else if (role === 'config') {
      const manifest = byRole('config')[0];
      if (manifest) take(manifest, { origin: 'role' });
    }
  }
  if (!found && g.clarify == null && !picked.size) for (const p of byRole('source').slice(0, 1)) take(p, { origin: 'role' });

  // Citations: the exact lines read through read_source (at most 120 per read) at this commit.
  const nodes = [], citations = [];
  const ordered = [...picked.entries()].sort(([, a], [, b]) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
  for (const [path, at] of ordered) {
    const id = `${repo}:${path}`;
    if (id.length > 200) { omit(path, 'path_too_long'); continue; }
    const total = files[path].split('\n').length, start = at.line ? Math.max(1, Math.min(at.line - 2, total)) : 1;
    // A symbol is cited whole (never fewer than the CITE_LINES window it had), up to the 120-line read; a file or doc keeps its window.
    const window = start + (at.role === 'docs' || at.role === 'config' ? DOC_LINES : CITE_LINES) - 1;
    const end = at.end ? Math.min(at.end, start + 119, total)
      : at.line ? Math.min(Math.max(symbolEnd(files[path].split('\n'), at.line), window), start + 119, total) : Math.min(window, total);
    const code = read('read_source', { path, start, end });
    if (!code) { omit(path, 'not_read'); continue; }
    const locator = { path, start: code.start, end: code.end, role: at.role, ...(at.symbol && !/\.\w+$/.test(at.symbol) ? { symbol: clip(at.symbol, 120) } : {}) };
    const sourceRef = { kind: REPOSITORY_SOURCE, id, version: commit, hash: await sha256Hex(files[path]), locator };
    nodes.push({ id: path, path, role: at.role, label: locator.symbol || path.split('/').pop(), origin: at.origin, sourceRef });
    // The code card shows the whole cited range (up to 120 lines), so every citable line can be selected on it.
    citations.push({ path, start: code.start, end: code.end, commit, totalLines: code.totalLines, text: code.content.split('\n').map(line => line.replace(/^\d+: /, '')).join('\n').slice(0, EXCERPT) });
  }

  // Edges between shown files, from the indexer's own graph. External endpoints and related files not shown are listed.
  const pathOf = new Map(graph.nodes.map(n => [n.id, n.path || null])), labelOf = new Map(graph.nodes.map(n => [n.id, n.label]));
  const shown = new Set(nodes.map(n => n.path)), edges = new Map(), outside = new Set(), notShown = new Set();
  for (const edge of graph.edges) {
    const from = pathOf.get(edge.source), to = pathOf.get(edge.target);
    if (from && to && from !== to && shown.has(from) && shown.has(to)) {
      const key = `${from}>${to}>${edge.relation || ''}`, status = SUPPORTED.has(edge.confidence) ? 'supported' : 'tentative';
      if (!edges.has(key) || status === 'supported') edges.set(key, { from, to, relation: edge.relation || 'related', status });
    } else if (shown.has(from) !== shown.has(to)) {
      const other = shown.has(from) ? edge.target : edge.source, otherPath = shown.has(from) ? to : from;
      if (!otherPath) outside.add(labelOf.get(other) || other);
      else if (!excluded.has(otherPath)) notShown.add(otherPath);
    }
  }
  for (const label of [...outside].slice(0, MAX_NOT_SHOWN)) omit(label, 'outside_snapshot');
  for (const path of [...notShown].slice(0, MAX_NOT_SHOWN)) omit(path, 'not_shown');
  return {
    repository: { repo, commit, version: snapshot.version ?? null }, goal: g.id, found, terms: relevance.terms,
    nodes, edges: [...edges.values()].slice(0, MAX_EDGES), citations, omissions, omissionCounts,
  };
}

// The repository at the actor's readable version (repositories.js readableVersion: confirmed public, or their own import not in
// Trash), mapped for one goal; null when that version is not readable. actor: { org, email }.
export async function buildLearningSourceMap(env, actor, { repositoryRef, revision, goal, question = '', selectedRefs = [] }) {
  const row = await readableVersion(env, actor, repositoryRef, revision);
  if (!row) return null;
  return learningSourceMap(await repositorySnapshot(env, row, revision), { goal, question, selectedRefs });
}

// The goal's questions, as the learner reads them (owner brief 2026-10-21 "Question presentation"): a title and a natural
// teaching question, never a commit, a path or a line list; those stay in the activity's sources and Source details. Each names
// whether it asks about the current code, the intended behaviour or a proposed change. The first starts the goal; Try another
// question takes the next, on the same sources. Template text only: no model writes it.
const QUESTIONS = {
  trace_and_predict: [
    what => [`Trace ${what}`, `Follow ${what} through the current code, from where it starts to its result. Which calls and data changes happen along the way, and what does the current code produce? Cite the lines you rely on. If you think it should produce something different, say that separately as the intended behaviour.`],
    what => [`Predict what ${what} produces`, `Choose one input and predict what the current code produces for it. Explain the order of operations that leads there, citing the lines you rely on. Say separately if you think the intended behaviour differs.`],
  ],
  reproduce_and_isolate: [
    (what, { tests }) => [`Find the cause: ${what}`, `Two separate questions. Current code: what does it actually do for your input? Intended behaviour: what should happen instead? Then give one hypothesis for the cause, tied to lines you cite.${tests ? ' The nearby tests cover only their own cases.' : ''} The diagnosis stays tentative until a reproduction confirms it.`],
    what => [`Confirm the cause: ${what}`, `Which input or test would tell your hypothesis apart from the alternatives? Say what the current code would do if your hypothesis is right, citing the lines you rely on. The diagnosis stays tentative until a reproduction confirms it.`],
  ],
  plan_bounded_edit: [
    (what, { tests }) => [`Plan a focused change: ${what}`, `A proposed change, not the current behaviour. Give two example inputs with the outputs you want, name the smallest area of the code to edit, and the test you would add${tests ? ' beside the existing tests' : ''}. Your change is reviewed only when you submit it.`],
    what => [`Verify the change: ${what}`, `A proposed change, not the current behaviour. Which tests or cases would show your change works and keeps the existing behaviour, and what result would each give?`],
  ],
  locate_and_verify: [
    () => ['Find where a small contribution belongs and how it is verified', 'A question about the current repository. Where would a small change, such as one more test, belong, and which command runs the tests? A listed script is not proof that it runs here.'],
    () => ['Explain how a change here is verified', 'A question about the current repository. Which command or checks verify a change, and what does each one cover? A listed script is not proof that it runs here.'],
  ],
  explain_then_apply: [
    what => [`Learn ${what} through this code`, `How does the current code show ${what}? Go beyond naming the file: explain what the lines you cite do. Then apply the same idea to a different example: one you choose, or ask me for one.`],
    what => [`Use ${what} in another example`, `Explain ${what} as the current code uses it, citing the lines you rely on, then describe how the same idea would work in a different program of your choice.`],
  ],
};

// The goal's activity from the map, question `index` (0: the first): one objective, one question, its citations.
export function codebaseActivity(goal, map, { focus = '', app = null, index = 0 } = {}) {
  const g = typeof goal === 'string' ? goalOf(goal) : goal, commit = map.repository.commit;
  const what = clip(focus, 120) || 'this code', list = QUESTIONS[g.first] || QUESTIONS.explain_then_apply;
  const [objective, prompt] = list[index % list.length](what, { tests: map.nodes.some(n => n.role === 'test') });
  const codebase = {
    goal: g.id, app, repo: map.repository.repo, commit, question: g.question, focus: clip(focus, 300), completion: g.completion,
    edges: map.edges, omissions: map.omissions.slice(0, 10), omissionCounts: map.omissionCounts, execution: 'not_run_here', questionIndex: index,
  };
  // The checkpoint is capped (learn-coaching-store.js MAX_CHECKPOINT): the edge and omission lists shrink before anything else.
  while (JSON.stringify(codebase).length > 7000 && (codebase.edges.length || codebase.omissions.length)) {
    if (codebase.omissions.length) codebase.omissions = codebase.omissions.slice(0, -1); else codebase.edges = codebase.edges.slice(0, -1);
  }
  return { objective: clip(objective, 500), prompt, responseKind: 'text', sourceRefs: map.nodes.map(n => n.sourceRef), checkpoint: { codebase } };
}

// Which cited files changed since the activity's commit: whole-file SHA-256, so a change anywhere in a file (its lines may have
// moved) marks it; a file that is gone is deleted; another file's change marks nothing. Read only: drift never writes, never
// regrades and never touches attempts, feedback or drafts. snapshot null: the repository cannot be read now.
export async function sourceDrift(sourceRefs, snapshot) {
  const items = [];
  for (const ref of (sourceRefs || []).filter(isRepositorySource)) {
    const { path, start, end, role } = ref.locator;
    let status;
    if (!snapshot || ref.id.slice(0, ref.id.indexOf(':')) !== snapshot.repo) status = 'unavailable';
    else if (ref.version === snapshot.commit) status = 'current';
    else if (!Object.hasOwn(snapshot.files || {}, path)) status = 'deleted';
    else status = (await sha256Hex(snapshot.files[path])) === ref.hash ? 'current' : 'changed';
    items.push({ path, start, end, role, status });
  }
  return { commit: snapshot?.commit ?? null, items, stale: items.filter(i => i.status === 'changed' || i.status === 'deleted').map(i => i.path), unavailable: items.some(i => i.status === 'unavailable') };
}

// --- route ------------------------------------------------------------------------------------------------------------
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const BOARD = /^[A-Za-z0-9 _.-]{1,100}$/;
const ACTION_ID = /^[A-Za-z0-9_-]{8,120}$/;

// The canvas's project repository, as projectRepository (canvases.js) reads it: the learner's own import, not in Trash, indexed.
async function canvasRepository(env, access) {
  if (!access.project) return null;
  const row = await env.LEARN_DB.prepare(`SELECT r.id, r.name, r.repo, r.commit_sha FROM repository_apps r WHERE r.org = ? AND r.name = ? AND r.owner_email = ? AND ${NOT_TRASHED('r.org', 'r.name')}`)
    .bind(access.org, access.project, access.email).first();
  return row?.commit_sha ? { id: row.id, app: row.name, repo: row.repo, commit: row.commit_sha } : null;
}
const loadSnapshot = (env, repo) => repositorySnapshot(env, { id: repo.id }, repo.commit);
const codebaseActivityOf = (state, activityId) => (state.activities || []).find(a => a.activityId === activityId && a.checkpoint?.codebase) || null;
// What the learner's own selections may name: code refs only, as identity (the server resolves them against the snapshot).
const selectionOf = list => (Array.isArray(list) ? list : []).filter(ref => ref && ref.kind === 'code' && typeof ref.sourceId === 'string' && ref.sourceId.length <= 1000).slice(0, 8)
  .map(ref => ({ kind: 'code', sourceId: ref.sourceId, name: clip(ref.name, 120), ...(ref.range && Number.isInteger(ref.range.start) && Number.isInteger(ref.range.end) && typeof ref.range.path === 'string' ? { range: { path: ref.range.path, start: ref.range.start, end: ref.range.end } } : {}) }));
const goalCriteria = (state, goalId) => (state.goals.find(goal => goal.goalId === goalId)?.criteria || []).filter(c => !c.requiresTransfer).map(c => ({ criterionId: c.criterionId, version: c.version }));

export async function codebaseRoute(path, req, env, deps = {}) {
  if (path !== '/api/learn/codebase') return null;
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'GET or POST required' }, 405);
  let body;
  if (req.method === 'GET') {
    const query = new URL(req.url).searchParams;
    body = { app: query.get('app'), board: query.get('board') };
  } else {
    try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid JSON' }, 400);
  }
  const access = await (deps.authorize || authorizedBoardApp)(req, env, body.app, null);
  if (access instanceof Response) return access;
  if (req.headers.has('origin') && req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'Invalid origin' }, 403);
  const ownerRefused = subscriptionOwnerRefusal(env, access);
  if (ownerRefused) return ownerRefused;
  if (typeof body.board !== 'string' || !BOARD.test(body.board)) return json({ error: 'Board name must be 1-100 letters, digits, spaces, dots, dashes or underscores' }, 400);
  if (access.kind !== 'canvas') return json({ error: 'coaching_on_canvases_only' }, 400);
  if (!access.user_id) return json({ error: 'identity_unavailable' }, 401);
  const actor = { org: access.org, userId: access.user_id, app: body.app, board: body.board };
  try {
    const repo = await canvasRepository(env, access);
    if (req.method === 'GET') {
      const state = await readCoachingState(env, actor), activity = codebaseActivityOf(state, state.activeActivityId);
      let snapshot = null;
      if (activity && repo) snapshot = await loadSnapshot(env, repo).catch(() => null);
      return json({
        repository: repo && { app: repo.app, repo: repo.repo, commit: repo.commit },
        activity: activity && { activityId: activity.activityId, commit: activity.checkpoint.codebase.commit, ...await sourceDrift(activity.sourceRefs, snapshot) },
      });
    }
    if (typeof body.actionId !== 'string' || !ACTION_ID.test(body.actionId) || !Number.isInteger(body.expectedRevision)) return json({ error: 'actionId (8-120 letters, digits, - or _) and expectedRevision required' }, 400);
    if (!repo) return json({ error: 'no_repository' }, 409);
    let snapshot;
    try { snapshot = await loadSnapshot(env, repo); } catch { return json({ error: 'repository_unavailable' }, 503); }
    if (body.action === 'start') {
      const goal = goalOf(body.goal);
      if (!goal) return json({ error: `goal must be one of ${CODEBASE_GOALS.map(g => g.id).join('|')}` }, 400);
      if (body.question != null && typeof body.question !== 'string') return json({ error: 'question must be text' }, 400);
      const focus = clip(body.question, 500), selectedRefs = selectionOf(body.selectedRefs);
      if (goal.clarify && !focus && !selectedRefs.length) return json({ error: 'question_required', clarify: goal.clarify }, 400);
      const map = await learningSourceMap(snapshot, { goal, question: focus, selectedRefs });
      // Nothing in this repository matches: nothing is saved, and the learner can rephrase or pick code in Files.
      if (!map.nodes.length || (goal.clarify && !map.found)) return json({ route: 'not_found', map });
      const made = await applyCoachingAction(env, actor, { actionId: `${body.actionId}.goal`, expectedRevision: body.expectedRevision, action: 'create_goal',
        payload: { label: clip(focus ? `${goal.label}: ${focus}` : `${goal.label} in ${repo.repo}`, 200), outcome: goal.completion, criteria: goal.criteria } });
      const goalId = made.state.activeGoalId, activity = codebaseActivity(goal, map, { focus, app: repo.app });
      const out = await applyCoachingAction(env, actor, { actionId: `${body.actionId}.activity`, expectedRevision: made.state.revision, action: 'activate_activity',
        payload: { activity: { goalId, objective: activity.objective, prompt: activity.prompt, responseKind: activity.responseKind, criterionRefs: goalCriteria(made.state, goalId), sourceRefs: activity.sourceRefs, checkpoint: activity.checkpoint } } });
      return json({ route: 'started', state: out.state, activityId: out.state.activeActivityId, map });
    }
    if (body.action === 'refresh') {
      const state = await readCoachingState(env, actor), old = codebaseActivityOf(state, body.activityId);
      if (!old) return json({ error: 'unknown_activity' }, 404);
      const was = old.checkpoint.codebase, goal = goalOf(was.goal);
      if (!goal || was.repo !== repo.repo) return json({ error: 'unknown_activity' }, 404);
      // The same files again at the current commit, a symbol at its new line; a deleted file is listed, never invented.
      const selectedRefs = old.sourceRefs.filter(isRepositorySource).filter(ref => Object.hasOwn(snapshot.files, ref.locator.path)).map(ref => {
        const node = ref.locator.symbol && snapshot.graph.nodes.find(n => n.path === ref.locator.path && n.label === ref.locator.symbol);
        const start = node?.line ?? ref.locator.start;
        return { kind: 'code', sourceId: `code:${repo.repo}@${repo.commit}:${ref.locator.path}`, range: { path: ref.locator.path, start, end: start + (ref.locator.end - ref.locator.start) } };
      });
      const drift = await sourceDrift(old.sourceRefs, snapshot);
      const map = await learningSourceMap(snapshot, { goal, question: was.focus, selectedRefs, expand: false });
      for (const path of drift.items.filter(i => i.status === 'deleted').map(i => i.path)) map.omissions.unshift({ path, reason: 'deleted', detail: `since ${was.commit.slice(0, 7)}` });
      const next = codebaseActivity(goal, map, { focus: was.focus, app: repo.app, index: was.questionIndex || 0 });
      const { assessment, ...kept } = old.checkpoint; // eslint-disable-line no-unused-vars
      const out = await applyCoachingAction(env, actor, { actionId: body.actionId, expectedRevision: body.expectedRevision, action: 'activate_activity',
        payload: { activity: { goalId: old.goalId, objective: next.objective, prompt: next.prompt, responseKind: next.responseKind, criterionRefs: goalCriteria(state, old.goalId),
          sourceRefs: next.sourceRefs, checkpoint: { ...kept, codebase: { ...next.checkpoint.codebase, refreshedFrom: old.activityId, previousCommit: was.commit } } } } });
      return json({ state: out.state, activityId: out.state.activeActivityId, drift });
    }
    if (body.action === 'another') {
      const state = await readCoachingState(env, actor), old = codebaseActivityOf(state, body.activityId);
      const was = old?.checkpoint.codebase, goal = goalOf(was?.goal);
      if (!old || !goal || was.repo !== repo.repo) return json({ error: 'unknown_activity' }, 404);
      // The activity's own sources, as the server recorded them: nothing is re-read or re-cited, and the answer starts empty.
      const { refreshedFrom, previousCommit, ...base } = was; // eslint-disable-line no-unused-vars
      const nodes = old.sourceRefs.filter(isRepositorySource).map(ref => ({ role: ref.locator.role, sourceRef: ref }));
      const next = codebaseActivity(goal, { repository: { repo: was.repo, commit: was.commit }, nodes, edges: was.edges || [], omissions: was.omissions || [], omissionCounts: was.omissionCounts || {} },
        { focus: was.focus, app: was.app, index: (was.questionIndex || 0) + 1 });
      const { assessment, ...kept } = old.checkpoint; // eslint-disable-line no-unused-vars
      const out = await applyCoachingAction(env, actor, { actionId: body.actionId, expectedRevision: body.expectedRevision, action: 'activate_activity',
        payload: { activity: { goalId: old.goalId, objective: next.objective, prompt: next.prompt, responseKind: next.responseKind, criterionRefs: goalCriteria(state, old.goalId),
          sourceRefs: old.sourceRefs, checkpoint: { ...kept, codebase: { ...base, questionIndex: next.checkpoint.codebase.questionIndex } } } } });
      return json({ state: out.state, activityId: out.state.activeActivityId });
    }
    return json({ error: 'action must be start, refresh or another' }, 400);
  } catch (error) {
    if (error instanceof CoachingConflict) {
      if (error.status !== 409) return json({ error: error.code }, error.status);
      return json({ error: error.code, state: await readCoachingState(env, actor).catch(() => null) }, 409);
    }
    // ids only, never learner text or repository content
    console.error(JSON.stringify({ event: 'learn_codebase_error', app: actor.app, error: error?.name || 'Error', message: String(error?.message || '').slice(0, 120) }));
    return json({ error: 'codebase_unavailable' }, 503);
  }
}
