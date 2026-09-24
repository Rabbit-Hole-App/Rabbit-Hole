// Where a message goes and which thread it joins. The bar freezes this at Send
// (T02 §6.3); nothing here reads the live page.
export function scopeOf(surface) {
  const resource = surface.resource;
  if (!resource) return { org: surface.org, kind: 'workspace', slug: null, title: null, selected: null };
  return { org: surface.org, kind: resource.kind, slug: resource.slug, title: resource.title || null, selected: surface.selected || null };
}

// Drafts are kept per org|kind:slug|selected. A rename or a new commit keeps the draft.
export const scopeKey = (scope) => `${scope.org}|${scope.kind}:${scope.slug || ''}|${scope.selected?.id || ''}`;

// Home, Library and Explore are places, not scope: they show no chip (T02 §6.2).
export function chipsFor(scope) {
  if (scope.kind === 'workspace') return [];
  return [{ key: 'resource', label: scope.title || scope.slug }, ...(scope.selected ? [{ key: 'selected', label: scope.selected.label }] : [])];
}

// Workspace and app threads stay on /api/ask; projects and canvases use Learn's LEARN_DB threads (T02 §6.3).
export function endpointFor(scope) {
  if (scope.kind === 'workspace') return { path: '/api/ask', scope: {} };
  return { path: scope.kind === 'app' ? '/api/ask' : '/api/learn/ask', scope: { app: scope.slug } };
}
