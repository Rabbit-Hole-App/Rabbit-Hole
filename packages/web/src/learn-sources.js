// What a canvas was built from, and whether the Learn agent is given it.
//
// Attaching is not provenance, it is a context switch: an attached source is
// handed to the agent when it answers; a detached one is not. That is why
// detaching deletes nothing - the blocks stay exactly where they are and keep
// saying where they came from, they just stop being read.

// Registering an existing source refreshes its label and leaves the flag alone,
// so the thing that registers it running again cannot silently re-attach
// something the reader deliberately switched off.
export function withSource(sources, source) {
  const existing = sources.find(entry => entry.id === source.id);
  if (!existing) return [...sources, { ...source, attached: true }];
  return sources.map(entry => (entry.id === source.id ? { ...entry, ...source, attached: entry.attached } : entry));
}

export function toggleSource(sources, id) {
  if (!sources.some(entry => entry.id === id)) return sources;
  return sources.map(entry => (entry.id === id ? { ...entry, attached: !entry.attached } : entry));
}

// Unknown means not yet listed, which is not the same as switched off - every
// canvas that predates this list would otherwise lose its context at a stroke.
export function isAttached(sources, id) {
  const existing = sources.find(entry => entry.id === id);
  return existing ? !!existing.attached : true;
}

export function attachedKinds(sources) {
  return [...new Set(sources.filter(entry => entry.attached).map(entry => entry.kind))];
}
