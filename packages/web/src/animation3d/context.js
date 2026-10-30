// /animation minimal provenance (AN-06): which artifact revision a card shows, the approved plan it was made from (its hash), and the
// sources the server actually read for it. Pure. Built from the card's verified reference (storage.js: hydration checked the artifact
// matches it) and the server's answer only, never a client field, so a card cannot claim a source it was not made from. The Tutor's
// activity evidence is AN-13, after owner MVP approval.

const ID = /^[A-Za-z0-9_.:-]{1,128}$/;
const SOURCES = 8;
const text = (value, max) => (typeof value === 'string' && value ? value.slice(0, max) : null);

// -> { artifactId, revision, planHash, sources: [{ sourceId, revision, kind?, title? }] }. A source enters only when the server marked it
// read (read: true) and names a stored id at a revision; duplicates once.
//   ref: the card's saved reference (envelope.ref); sources: the authorized result read's source list (as /explain's answer.sources).
export function animationProvenance(ref, sources = []) {
  const out = [];
  for (const source of Array.isArray(sources) ? sources : []) {
    if (source?.read !== true || !ID.test(source.sourceId ?? '') || !ID.test(source.revision ?? '')) continue;
    if (out.some(seen => seen.sourceId === source.sourceId && seen.revision === source.revision)) continue;
    const kind = text(source.kind, 40), title = text(source.title, 200);
    out.push({ sourceId: source.sourceId, revision: source.revision, ...(kind ? { kind } : {}), ...(title ? { title } : {}) });
    if (out.length === SOURCES) break;
  }
  return { artifactId: ref.artifactId, revision: ref.revision, planHash: ref.planHash, sources: out };
}

// The card's "made from" line: what was read, by title, never a guess about a source that was not read.
export function provenanceText(provenance) {
  if (!provenance) return 'Its sources are not known on this page.';
  if (!provenance.sources.length) return 'Made from your request only.';
  return `Made from: ${provenance.sources.map(source => source.title || source.kind || 'a source').join(', ')}.`.slice(0, 500);
}
