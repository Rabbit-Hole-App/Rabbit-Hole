// Project canvases (docs/features/project-canvases.md): what the Learn header's switcher lists - the project's Main canvas
// first, then its canvases in catalog order (LibraryViews' filter: kind canvas, project = this project) - each with its URL,
// and the name a New canvas starts with. Pure, so the rules are tested.
export const canvasHref = (project, canvas = null) => `/apps/${project}?tab=learn${canvas ? `&canvas=${canvas}` : ''}`;

export function projectCanvases(project, catalog = [], current = null) {
  const own = catalog.filter((c) => c.kind === 'canvas' && c.project === project);
  return [{ name: null, label: 'Main canvas' }, ...own.map((c) => ({ name: c.name, label: c.title || 'Untitled canvas' }))]
    .map((entry) => ({ ...entry, href: canvasHref(project, entry.name), current: entry.name === (current || null) }));
}

// "Canvas 2" for a project with only its Main canvas: the next number in the list, editable before it is made.
export const newCanvasTitle = (entries) => `Canvas ${entries.length + 1}`;
