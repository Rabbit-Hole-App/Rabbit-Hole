// Agent Bar logic that needs no React (T02 §6, §7.3, §9): the result lists the
// sheet and the Context panel share, SSE folding, the draft and scope rules,
// card states and copy. Pure apart from the in-memory store; node:test loads it.
import { askLiveOnPreview } from '../flags.js';
import { chipsFor, scopeKey } from './scope.js';
import { commandsFor, descFor, placeOf, reviewOff, SLASH } from './slash.js';

// Results and threads are per resource: org|kind:slug. A selection is context for
// one question (repository_context), not a thread of its own (§6.3 thread table).
// Drafts stay per scopeKey, selection included.
export const resultsKey = (scope) => `${scope.org}|${scope.kind}:${scope.slug || ''}`;

// One result list per results key. Entries carry their own actions (retry, undo,
// confirm), so the sheet and the Context panel render the same thing.
const EMPTY = [];
const lists = new Map();
const listeners = new Set();
let last = null;
const emit = (event) => listeners.forEach((fn) => fn(event));
export const getTurns = (key) => lists.get(key) || EMPTY;
export const getLatest = () => (last && getTurns(last.key).find((t) => t.id === last.id)) || null;
// listener({ key, pushed }): key is a results key; pushed is true for a new entry, false for an update.
export function subscribeTurns(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function pushTurn(key, entry) { lists.set(key, [...getTurns(key), entry]); last = { key, id: entry.id }; emit({ key, pushed: true }); }
export function updateTurn(key, id, fn) { lists.set(key, getTurns(key).map((t) => (t.id === id ? fn(t) : t))); emit({ key, pushed: false }); }
export function setTurns(key, entries) { lists.set(key, entries); emit({ key, pushed: false }); }

// Threads stay per scope: one agent visually, separate conversations.
export const threadIds = new Map();
export function resetThread(key) { threadIds.delete(key); setTurns(key, EMPTY); }

const withSources = (answer, more) => ({ ...answer, sources: [...(answer.sources || []), ...more] });

// One SSE event folded into an answer. `ref` is the §9 research source for
// [Add to canvas]. outline and paper only act on a mounted canvas, and the bar
// handles proposals itself, so those and unknown events change nothing.
export function applyEvent(answer, type, data) {
  switch (type) {
    case 'chunk': return { ...answer, text: answer.text + data.text };
    case 'progress': return { ...answer, stage: data.stage };
    case 'graph': return { ...answer, graph: data };
    case 'papers': return withSources(answer, data.papers.map((p) => ({ label: p.title, href: p.pdfUrl, ref: { kind: 'arxiv', ref: p.id } })));
    case 'wiki': return withSources(answer, [{ label: data.title, href: data.url, ref: { kind: 'wiki', ref: data.url } }]);
    case 'video': return withSources(answer, [{ label: data.title || data.videoId, href: `https://www.youtube.com/watch?v=${encodeURIComponent(data.videoId)}`, ref: { kind: 'youtube', ref: data.videoId } }]);
    case 'error': return { ...answer, error: data.error, done: true };
    case 'done': return { ...answer, done: true };
    default: return answer;
  }
}

// The collapsed sheet: the latest result as one line (§6.5).
export function lineOf(t) {
  const n = t.results?.length;
  const text = t.kind === 'card' ? t.card.model.title
    : t.kind === 'choose' ? 'Which one do you mean?'
    : t.kind === 'results' ? (n ? `${n} ${n === 1 ? 'match' : 'matches'}` : 'No matches')
    : t.kind === 'note' ? t.text
    : t.error ? `✗ ${t.error}` : t.text || t.stage || '';
  return `${t.label} · ${text.split('\n')[0]}`;
}

// §6.3 no silent retargeting. The input types into `held`. While held has a
// waiting draft it keeps its scope; otherwise the bar follows the page and shows
// that scope's own draft (drafts are kept per scope key).
export const follow = (held, live, drafts) => (held && drafts.get(scopeKey(held))?.trim() ? held : live);

// Switching a waiting draft to another scope. × and [Use selection] refine the
// same question, so the text moves; [Ask about X instead] copies it, so the old
// scope still has its draft on return. A scope's own draft is never overwritten,
// and then the source keeps its text too: no draft is ever dropped.
export function carry(drafts, from, to, keep) {
  const [a, b] = [scopeKey(from), scopeKey(to)];
  if (a === b || drafts.get(b)?.trim()) return drafts;
  const next = new Map(drafts).set(b, drafts.get(a) || '');
  if (!keep) next.delete(a);
  return next;
}

// The bar names a scope by its chips, and the workspace (no chip) by its name.
export const labelOf = (scope, workspace) => chipsFor(scope).map((chip) => chip.label).join(' · ') || workspace;

// The router's 'about' (a connected repository named in a question, router.js rule 2) as the
// project scope its answer belongs to: kind 'project', as the project page publishes it.
export const aboutScope = (scope, about) => (about.slug === scope.slug ? scope : { org: scope.org, kind: 'project', slug: about.slug, title: about.title, selected: null });

// What to offer once the page moved away from a waiting draft.
export function offerFor(target, live) {
  if (scopeKey(target) === scopeKey(live)) return null;
  return target.org === live.org && target.slug === live.slug && live.selected ? 'selection' : 'resource';
}

// × on a chip widens the page's scope for this visit (§6.2); dropping the
// resource drops its selection too.
export function widen(surface, removed) {
  if (removed.includes('resource')) return { ...surface, resource: null, selected: null };
  if (removed.includes('selected')) return { ...surface, selected: null };
  return surface;
}

// §13 "Placeholder per scope". The map status is the page's own first
// (RepositoryPage publishes resource.status on every poll), else the catalog row
// Shell loaded (repository_apps.status, merged into /api/apps by dev-worker.js:23-28).
export function placeholderFor(scope, { resource = null, catalog = [] } = {}) {
  if (scope.kind === 'workspace') return 'Start, open, ask, or paste a link…';
  const status = resource?.slug === scope.slug && resource.status ? resource.status : (catalog || []).find((a) => a.name === scope.slug)?.status;
  if (scope.kind === 'project' && status !== 'ready') return 'Code answers are available once the map is ready';
  return `Ask about ${scope.selected?.label || scope.title || scope.slug}…`;
}

// §6.6 catalog lookup: none -> [Ask instead], up to 5 -> pills, more -> a list.
export const resultsView = (results) => (!results.length ? 'empty' : results.length <= 5 ? 'pills' : 'list');

// §6.2: the four modes, then the place's shortcuts - one list for every input (agent/slash.js).
export const MODES = SLASH.filter((c) => c.group === 'mode').map((c) => [c.name, descFor(c, 'home')]);
export const modesFor = (scope) => SLASH.filter((c) => c.group === 'mode').map((c) => [c.name, descFor(c, placeOf(scope) === 'project' ? 'project' : 'home')]);

// '/' at position 0 opens the picker and '/te' filters it; null means no picker.
export const modeQuery = (text) => text.match(/^\/([a-z]*)$/)?.[1] ?? null;

// Home and Library shortcuts under the modes (user, 2026-09-28). Each is its sentence (router.js
// rule 1b); the picker only lists them. Unavailable ones are not shown.
export function shortcutsFor(scope, catalog = []) {
  const place = placeOf(scope) === 'project' ? 'project' : 'home';
  return commandsFor(place, { catalog }).filter((c) => c.group === 'shortcut').map((c) => [c.name, descFor(c, place)]);
}

// §6.4: which modes a scope can serve; the reason shows dimmed in the picker, and
// ask() refuses with it. Workspace and app asks go to /api/ask, which writes live
// chat history (control-plane index.js:1194-1201), so the preview keeps them off
// until the user turns askLiveOnPreview on (flags.js). Project and canvas asks use LEARN_DB.
// The product offers every mode everywhere (agent/slash.js); this preview's own safety limits come from reviewOff.
export function modeAvailability(mode, kind, askLive = askLiveOnPreview) {
  const off = reviewOff(mode, kind, { askLive });
  if (off) return { ok: false, ...off };
  if (mode === 'teach' && kind === 'workspace') return { ok: true, reason: 'creates a canvas first' };
  return { ok: true };
}

// §7.4: a proposal older than 15 minutes can no longer be approved.
export const EXPIRY_MS = 15 * 60 * 1000;
const EXPIRED = { state: 'expired', note: 'Expired: older than 15 minutes. Ask again to redo it.' };
const CANCELLED = { state: 'cancelled', note: 'Cancelled.' };

// §7.3 card state from what the user did (phase) and the approve or reject error.
// 409 carries the proposal's status ({status} once the §7.4 fixes ship; live
// today only says 'already <status>', index.js:1422). A failed permission
// recheck is 403, or 400 'no edit access' on live today (index.js:1428,1505).
export function cardView({ blocked, createdAt, phase, error }, now) {
  if (phase === 'cancelled') return CANCELLED;
  if (blocked) return { state: 'blocked' };
  if (phase === 'failed') {
    const status = error?.status === 409 && (error.data?.status || /^already (\w+)/.exec(error.data?.error || '')?.[1]);
    if (status === 'approved') return { state: 'done-elsewhere', note: 'Already approved.' };
    if (status === 'rejected') return CANCELLED;
    if (status === 'invalidated') return { state: 'cancelled', note: 'This thread was deleted.' };
    if (status === 'expired') return EXPIRED;
    if (error?.status === 403 || error?.data?.error === 'no edit access') return { state: 'no-longer-allowed', note: 'No longer allowed: your permission in this workspace changed.' };
    return { state: 'failed' };
  }
  if (phase) return { state: phase }; // executing | done
  return now - createdAt > EXPIRY_MS ? EXPIRED : { state: 'pending' };
}

// §7.4 #3: Cancel is recorded server-side as rejected.
// ponytail: live small-cp has no /api/ask/reject until the §7.4 fixes are
// promoted, and D7 blocks every proposal on dev builds, so a Blocked card (and a
// rule-routed card, which has no proposal) cancels locally only.
export const rejectBody = (card) => (card.proposalId && !card.blocked ? { proposal_id: card.proposalId } : null);

// §9: learnAction words every outcome in result.message (agent/learn-hook.js); the
// bar only decides whether the draft is done and whether the line is an error.
export function learnOutcome(r) {
  return { done: r.status === 'prefilled' || r.status === 'added', text: r.message || null, tone: r.status === 'rejected' || r.status === 'failed' ? 'error' : null };
}

// §6.3 History: the existing thread endpoints per scope, as AskPanel uses them
// (index.js:1358-1372, repositories.js:162-166). Canvas threads live in LEARN_DB
// on the same /api/ask/threads paths (backend-canvas 'Learn resolves canvas-*').
export function threadsPath(scope, id) {
  if (scope.kind === 'project') return `/api/repositories/${scope.slug}/threads${id ? `/${id}` : ''}`;
  if (id) return `/api/ask/threads/${id}`;
  if (scope.kind === 'canvas') return `/api/ask/threads?scope=learn&ref=${encodeURIComponent(scope.slug)}`;
  return scope.kind === 'app' ? `/api/ask/threads?scope=app&ref=${encodeURIComponent(scope.slug)}` : '/api/ask/threads?scope=org';
}
