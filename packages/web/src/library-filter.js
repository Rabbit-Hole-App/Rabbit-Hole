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
  // ?d=<folder id>: an open Library folder (docs/features/library-folders.md), the preview's only.
  const folderId = preview && /^[0-9a-f-]{36}$/.test(q.get('d') || '') ? q.get('d') : null;
  return { type, archived: type === 'canvases' && q.get('archived') === '1', section, folderId };
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
// control, View all and the Agent Bar's filter_library all build it here. `path` is the page: /library, or /explore,
// whose Type filter is this one (EXPLORE_TYPES).
export function libraryHref({ d, f, s, type, archived, project } = {}, path = '/library') {
  const q = new URLSearchParams();
  if (d) q.set('d', d);
  if (project) q.set('project', project);
  if (f) q.set('f', f);
  if (s) q.set('s', s);
  if (type) q.set('type', type);
  if (archived && type === 'canvases') q.set('archived', '1');
  const query = q.toString();
  return query ? `${path}?${query}` : path;
}

// Sets or clears one parameter and keeps the rest; changing type leaves Archived.
export function chipHref(search, key, value, path = '/library') {
  const q = new URLSearchParams(search);
  const state = { project: q.get('project'), d: q.get('d'), f: q.get('f'), s: q.get('s'), type: q.get('type'), archived: q.get('archived') };
  if (key === 'type') state.archived = null;
  state[key] = value || null;
  return libraryHref(state, path);
}

// Explore's Type filter (owner 2026-10-09: "Explore should have a filter for Projects or Canvas"; "same filter as
// library?"): the Library's own control, labels and ?type= values, for the two types Explore lists. Apps, Archived and
// Ownership are the Library's alone.
export const EXPLORE_TYPES = ['projects', 'canvases'];
export const exploreType = (search) => { const type = new URLSearchParams(search).get('type'); return EXPLORE_TYPES.includes(type) ? type : null; };

// Projects and canvases live in LEARN_DB: the live app actions (share, rename, duplicate,
// trash, drag to a folder, the runbook peek) never apply to them.
export const isLearnResource = (a) => a.kind === 'repository' || a.kind === 'canvas';
