// The Library's chip rows and sections (T02 §4, preview only). Pure, so the rules are tested
// without a browser; App.jsx reads the URL and renders. Only the Apps view is a table.
export const TYPES = {
  projects: { label: 'Projects', kinds: ['repository'] },
  canvases: { label: 'Canvases', kinds: ['canvas'] },
  apps: { label: 'Apps', kinds: ['job', 'server'] },
};
// Scope chips are the sidebar sections under their T02 §4 names (sectionOf, api.js:9-14).
export const SCOPES = { private: 'Mine', shared: 'Shared with me', apps: 'Workspace' };

// The live build never reads ?type, so its Library is exactly today's.
export function libraryQuery(search, preview) {
  const q = new URLSearchParams(search);
  const type = preview && Object.hasOwn(TYPES, q.get('type')) ? q.get('type') : null;
  return { type, archived: type === 'canvases' && q.get('archived') === '1' };
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

// A chip sets or clears one parameter and keeps the rest; changing type leaves Archived.
export function chipHref(search, key, value) {
  const q = new URLSearchParams(search);
  if (key === 'type') q.delete('archived');
  if (value) q.set(key, value); else q.delete(key);
  const s = q.toString();
  return s ? `/library?${s}` : '/library';
}

// Projects and canvases live in LEARN_DB: the live app actions (share, rename, duplicate,
// trash, drag to a folder, the runbook peek) never apply to them.
export const isLearnResource = (a) => a.kind === 'repository' || a.kind === 'canvas';
