// The Library's chip rows and sections (T02 §4, preview only). Pure, so the rules are tested
// without a browser; App.jsx reads the URL and renders. Only the Apps view is a table.
export const TYPES = {
  projects: { label: 'Projects', kinds: ['repository'] },
  canvases: { label: 'Canvas', kinds: ['canvas'] },
  apps: { label: 'Apps', kinds: ['job', 'server'] },
};
// Scope chips are the sidebar sections under their T02 §4 names (sectionOf, api.js:9-14). Rabbit Hole v1 is
// solo, so Mine is the only one: Shared with me and Workspace stay live-build sidebar sections.
export const SCOPES = { private: 'Mine' };
// Mine (?s=private) on the preview is what the person owns. sectionOf cannot say: projects always come back
// with visibility 'domain' (control-plane repositories.js repositoryApp), so it files them under Workspace.
export const isMine = (a, email) => !!email && a.owner_email === email;

// The live build never reads ?type, so its Library is exactly today's; its ?s= is any sidebar section.
// The preview ignores a ?s= that is not a scope (an old ?s=shared link shows the whole Library).
export function libraryQuery(search, preview) {
  const q = new URLSearchParams(search);
  const type = preview && Object.hasOwn(TYPES, q.get('type')) ? q.get('type') : null;
  const section = !preview || Object.hasOwn(SCOPES, q.get('s')) ? q.get('s') : null;
  return { type, archived: type === 'canvases' && q.get('archived') === '1', section };
}

export const ofType = (apps, type) => (type ? apps.filter((a) => TYPES[type].kinds.includes(a.kind)) : apps);

// All (§4): learning first - Projects, then Canvases, then Apps - each opened-in-this-browser
// first (small.recent), then newest (a redeploy counts), SECTION_LIMIT shown and the rest counted.
export const SECTION_LIMIT = 6;
const when = (a) => a.deployed_at || a.created_at || '';
export function byRecent(apps, recent = []) {
  const rank = (a) => (recent.includes(a.name) ? recent.indexOf(a.name) : Infinity);
  return [...apps].sort((x, y) => rank(x) - rank(y) || when(y).localeCompare(when(x)));
}
export function librarySections(apps, recent = []) {
  return Object.entries(TYPES).map(([key, t]) => {
    const all = byRecent(ofType(apps, key), recent);
    return { key, label: t.label, items: all.slice(0, SECTION_LIMIT), more: Math.max(0, all.length - SECTION_LIMIT) };
  });
}

// The one URL for a Library state (folder f, ownership s, type, archived canvases). The Filters
// control, View all and the Agent Bar's filter_library all build it here.
export function libraryHref({ f, s, type, archived } = {}) {
  const q = new URLSearchParams();
  if (f) q.set('f', f);
  if (s) q.set('s', s);
  if (type) q.set('type', type);
  if (archived && type === 'canvases') q.set('archived', '1');
  const query = q.toString();
  return query ? `/library?${query}` : '/library';
}

// Sets or clears one parameter and keeps the rest; changing type leaves Archived.
export function chipHref(search, key, value) {
  const q = new URLSearchParams(search);
  const state = { f: q.get('f'), s: q.get('s'), type: q.get('type'), archived: q.get('archived') };
  if (key === 'type') state.archived = null;
  state[key] = value || null;
  return libraryHref(state);
}

// Projects and canvases live in LEARN_DB: the live app actions (share, rename, duplicate,
// trash, drag to a folder, the runbook peek) never apply to them.
export const isLearnResource = (a) => a.kind === 'repository' || a.kind === 'canvas';
