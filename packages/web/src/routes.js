// Which page a URL shows, and the Agent Bar's starting surface for it (T02 §1, §6).
// No router dependency: main.jsx calls these on every render. With preview false every
// answer is today's main.jsx:57-70 and Sidebar.jsx:714,717.
const KNOWN = /^\/(apps(\/[a-z0-9-]+(\/runs\/[\w-]+)?)?|dash|members|chat)$/;
const PREVIEW_ONLY = /^\/(library|explore)$/;

// The path an unknown URL is replaced with, or null when the URL is served.
// The preview has no /chat page: that page writes live chat history (D7). Nor /members: Rabbit Hole v1 is
// solo, so the members page is not a destination (the /api/members routes stay for the live build).
export const canonicalPath = (pathname, preview) =>
  (preview && (pathname === '/chat' || pathname === '/members') ? '/apps' : KNOWN.test(pathname) || (preview && PREVIEW_ONLY.test(pathname)) ? null : '/apps');

// D7 (WP7): on the preview api() sends only the writes the dev worker serves itself - repositories, canvases and
// their chats, Learn and BYOC (dev-worker.js; the canvas half is control-plane/src/canvases.js canvasRoute). Any
// other write would reach live small-cp, so api() refuses it with this reason (agent/slash.js D7_REASON).
// A browser consistency check only, not a storage proof: fetch() callers and GETs skip it, and a route the dev
// worker serves is not by that alone kept off live storage. The dev handlers enforce that (C1 in
// docs/features/learn-cleanup.md: learnMomentsDb, refuseLiveLearnAsk), proven by control-plane tests.
export const PREVIEW_WRITE_REFUSED = 'Blocked on this preview: it would change live apps.';
export function previewWriteAllowed(url) {
  const u = new URL(url, 'https://preview.invalid'), p = u.pathname;
  return /^\/api\/(repositories|learn|byoc)(\/|$)/.test(p) || /^\/api\/canvases(\/dives(\/canvas-[a-f0-9]{8})?)?$/.test(p) || /^\/api\/apps\/canvas-[a-f0-9]{8}(\/|$)/.test(p)
    || /^\/api\/apps\/repo-[a-z0-9-]+(\/learn-course)?$/.test(p) // dev-worker.js repositoryRoute: served as /api/repositories/...
    || /^\/api\/ask\/threads\/canvaschat-/.test(p) || (p === '/api/ask/threads' && u.searchParams.get('scope') === 'learn' && /^canvas-[a-f0-9]{8}$/.test(u.searchParams.get('ref') || ''));
}

export function pageFor(pathname, search, preview) {
  const app = pathname.match(/^\/apps\/([a-z0-9-]+)(?:\/runs\/([\w-]+))?$/);
  if (app) return { page: 'app', slug: app[1], runId: app[2] };
  if ((pathname === '/members' && !preview) || pathname === '/chat') return { page: pathname.slice(1) }; // solo v1: the preview's /members is Home
  if (!preview) return { page: 'library' };
  if (PREVIEW_ONLY.test(pathname)) return { page: pathname.slice(1) };
  // Bare /apps (and /dash) is Home; the sidebar's ?s= and ?f= links keep the Library.
  const params = new URLSearchParams(search);
  return { page: params.has('s') || params.has('f') ? 'library' : 'home' };
}

// The sidebar's section labels. In the preview bare /apps is Home, so the Apps label
// opens the Library, and a label lights up on any Library URL with its ?s=.
export const sectionHref = (s, preview) => (s ? `/apps?s=${s}` : preview ? '/library' : '/apps');
export function sectionActive(pathname, search, s, preview) {
  const onList = preview ? pageFor(pathname, search, true).page === 'library' : pathname === '/apps';
  return onList && (new URLSearchParams(search).get('s') || null) === (s || null);
}

// Where the bar starts on each URL, before the page refines it. The resource stays null
// until a page has loaded one, so error and denied states never keep a stale scope.
// Learn, every canvas route (its content-not-on-this-device gate included), chat and run
// pages own the bottom input (T02 §6.1).
// App pages show the bar (WP6): on the preview their Graph tab's Graph Agent input gives way to it
// (SharePage). The run subpage keeps its own chat and its hidden bar.
// `from` (contract v3) carries the workspace identity Shell published, so the baseline is a
// complete surface by itself; agent-core's setSurface keeps identity as well.
// Rabbit Hole dev: a workspace switch goes to /apps?ws=<slug> and the page that loads applies it.
// Setting small.ws before navigating would leave a user who answers Stay at the Agent Bar's
// unsent-draft warning on this page with every request going to the other workspace.
export function takeWs(search) {
  const q = new URLSearchParams(search);
  if (!q.has('ws')) return null;
  const ws = q.get('ws');
  q.delete('ws');
  const rest = q.toString();
  return { ws, search: rest ? `?${rest}` : '' };
}

const IDENTITY = ['org', 'email', 'orgName', 'catalog'];
export function baseSurfaceFor(pathname, search, from = {}) {
  const at = pageFor(pathname, search, true);
  const place = at.page !== 'app' ? at.page
    : at.runId ? 'run'
    : at.slug.startsWith('canvas-') ? 'canvas'
    : at.slug.startsWith('repo-') && projectTab(search) === 'learn' ? 'learn' // a project opens on Learn; an app's ?tab=learn is its Runbook (D7)
    : at.slug.startsWith('repo-') ? 'project' : 'app';
  const identity = Object.fromEntries(IDENTITY.filter((k) => from[k] !== undefined).map((k) => [k, from[k]]));
  return { ...identity, place, resource: null, selected: null, barHidden: ['learn', 'canvas', 'chat', 'run'].includes(place), resultsHost: 'sheet', handlers: {} };
}

// Project tabs (T02 §1 aliases): a project is Map or Learn (owner, 2026-10-04: no Overview). A project has both a
// Map and a canvas, so it opens on the Map (owner, 2026-10-04); ?tab=learn is Learn, anything else (map, the legacy
// code, graph and agent, an old ?tab=overview or sources) is the Map.
export const projectTab = (search) => (new URLSearchParams(search).get('tab') === 'learn' ? 'learn' : 'map');
// Learn is immersive (WP6 closeout): Shell shows no sidebar or icon rail on a canvas or a project's Learn tab.
// An app's ?tab=learn lands on Runbook (D7), so it keeps the sidebar.
export const immersiveAt = (pathname, search) => {
  const at = pageFor(pathname, search, true);
  return at.page === 'app' && !at.runId && (at.slug.startsWith('canvas-') || (at.slug.startsWith('repo-') && projectTab(search) === 'learn'));
};
