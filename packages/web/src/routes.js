// Which page a URL shows, and the Agent Bar's starting surface for it (T02 §1, §6).
// No router dependency: main.jsx calls these on every render. With preview false every
// answer is today's main.jsx:57-70 and Sidebar.jsx:714,717.
const KNOWN = /^\/(apps(\/[a-z0-9-]+(\/runs\/[\w-]+)?)?|dash|members|chat)$/;
const PREVIEW_ONLY = /^\/(library|explore)$/;

// The path an unknown URL is replaced with, or null when the URL is served.
export const canonicalPath = (pathname, preview) =>
  (KNOWN.test(pathname) || (preview && PREVIEW_ONLY.test(pathname)) ? null : '/apps');

export function pageFor(pathname, search, preview) {
  const app = pathname.match(/^\/apps\/([a-z0-9-]+)(?:\/runs\/([\w-]+))?$/);
  if (app) return { page: 'app', slug: app[1], runId: app[2] };
  if (pathname === '/members' || pathname === '/chat') return { page: pathname.slice(1) };
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
    : new URLSearchParams(search).get('tab') === 'learn' ? 'learn'
    : at.slug.startsWith('repo-') ? 'project' : 'app';
  const identity = Object.fromEntries(IDENTITY.filter((k) => from[k] !== undefined).map((k) => [k, from[k]]));
  return { ...identity, place, resource: null, selected: null, barHidden: ['learn', 'canvas', 'chat', 'run'].includes(place), resultsHost: 'sheet', handlers: {} };
}
