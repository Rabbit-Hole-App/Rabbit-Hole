// The Library's chip rows (T02 §4, preview only). Pure, so the rules are tested without a
// browser; App.jsx reads the URL and renders. The Apps view stays today's table.
export const TYPES = {
  projects: { label: 'Projects', kinds: ['repository'] },
  canvases: { label: 'Canvases', kinds: ['canvas'] },
  apps: { label: 'Apps', kinds: ['job', 'server'] },
};
// Scope chips are the sidebar sections under their T02 §4 names (sectionOf, api.js:9-14).
export const SCOPES = { private: 'Mine', shared: 'Shared with me', apps: 'Workspace' };
const OPS = ['watch', 'deployed', 'lastrun'];

// The live build never reads ?type, so its Library is exactly today's.
export function libraryQuery(search, preview) {
  const q = new URLSearchParams(search);
  const type = preview && Object.hasOwn(TYPES, q.get('type')) ? q.get('type') : null;
  return { type, archived: type === 'canvases' && q.get('archived') === '1' };
}

export const ofType = (apps, type) => (type ? apps.filter((a) => TYPES[type].kinds.includes(a.kind)) : apps);

// Projects and Canvases hide the ops columns by default (§4); users can still toggle any
// column, and those toggles (`mine`) stay in memory so small.tblCols is never written here.
export const opsView = (type) => type === 'projects' || type === 'canvases';
export const hiddenFor = (type, stored, mine = {}) => (opsView(type) ? { ...Object.fromEntries(OPS.map((k) => [k, true])), ...mine } : stored);

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
