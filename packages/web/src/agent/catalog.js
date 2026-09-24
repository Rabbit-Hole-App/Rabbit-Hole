// The name the user sees: a project by owner/repository (App.jsx:386, Sidebar.jsx:616), a canvas
// by its title, an app by its name. The only titleOf: Home, Sidebar and Library import it from here.
export const titleOf = (row) => (row.kind === 'repository' ? row.repo : row.title || row.name);

// The type shown beside a title in choose pills and result lists.
const KIND = { repository: 'Project', canvas: 'Canvas', job: 'App · job', server: 'App · server' };
export const kindLabel = (kind) => KIND[kind] || 'App';

// Title and slug lookup over the loaded catalog (T02 §6.6). Canvas text stays in the
// browser and is never searched. Exact names win over names that merely contain the text.
// ponytail: substring only, so "open my attention notes" finds nothing; token matching when real phrasing needs it.
export function lookup(catalog, text) {
  const q = String(text || '').trim().toLowerCase();
  if (!q) return [];
  const items = (catalog || []).map((row) => ({ slug: row.name, title: titleOf(row), kind: row.kind }));
  const exact = items.filter((item) => item.slug.toLowerCase() === q || item.title.toLowerCase() === q);
  return exact.length ? exact : items.filter((item) => item.slug.toLowerCase().includes(q) || item.title.toLowerCase().includes(q));
}

// Connected repositories named by owner/repository, compared the way GitHub does: case-insensitive
// and without .git. The router and connect_repository both use it, so neither creates a duplicate.
const repoKey = (repo) => String(repo || '').toLowerCase().replace(/\.git$/, '');
export const repositoriesOf = (catalog, repo) => (catalog || []).filter((row) => row.kind === 'repository' && repoKey(row.repo) === repoKey(repo));
// The connected project on this branch. A /tree/ link may run on into a folder, so the longest
// connected branch the link starts with counts.
export const onBranch = (rows, branch) =>
  rows.filter((row) => row.branch && (branch === row.branch || branch.startsWith(`${row.branch}/`))).sort((a, b) => b.branch.length - a.branch.length)[0] || null;
