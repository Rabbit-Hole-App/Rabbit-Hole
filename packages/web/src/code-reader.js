// The Files view's facts (docs/features/repository-browser.md): the file tree and the shared search, read from the stored
// snapshot only. Pure; node:test loads it.
const nameOf = (path) => path.split('/').pop();

// Folders first, then files, each by name: [{ name, path, children }] for a folder, [{ name, path }] for a file.
export function fileTree(paths) {
  const root = { children: new Map() };
  for (const path of paths) {
    const parts = path.split('/');
    let node = root;
    parts.slice(0, -1).forEach((name, i) => {
      if (!node.children.has(`${name}/`)) node.children.set(`${name}/`, { name, path: parts.slice(0, i + 1).join('/'), children: new Map() });
      node = node.children.get(`${name}/`);
    });
    node.children.set(path, { name: parts.at(-1), path });
  }
  const sorted = (node) => [...node.children.values()].sort((a, b) => (!a.children - !b.children) || a.name.localeCompare(b.name))
    .map((n) => (n.children ? { name: n.name, path: n.path, children: sorted(n) } : n));
  return sorted(root);
}

// One search field, two views (owner brief §2): in Files it finds files by path and symbols by name. A file's own node
// (named after the file) is the file, and an external dependency has no source, so neither is a symbol hit.
// ponytail: substring match, capped at 50 each; add ranking when a repository outgrows it.
export function searchRepository(snapshot, query) {
  const q = query.trim().toLowerCase();
  if (!q) return { files: [], symbols: [] };
  return {
    files: snapshot.files.map((f) => f.path).filter((p) => p.toLowerCase().includes(q)).slice(0, 50),
    symbols: snapshot.graph.nodes.filter((n) => n.path && n.label !== nameOf(n.path) && n.label.toLowerCase().includes(q)).slice(0, 50),
  };
}
