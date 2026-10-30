// /animation minimal provenance (AN-06): which artifact revision a card shows, the approved plan it was made from (its hash), and the
// sources the server actually read for it. Pure. Built from the server's answer only, never from a client field, so a card cannot
// claim a source it was not made from. The Tutor's activity evidence is AN-13, after owner MVP approval.
import { validateSourceRef } from './assets.js';

const ID = /^[A-Za-z0-9_.:-]{1,160}$/;

// -> { artifactId, revision, planHash, sources: [{ role, kind, sourceId, revision, title? }] } or null when the answer does not name
// this card's artifact. A source enters only when the server marked it read (read: true) and its reference is valid; duplicates once.
//   ref: the card's saved reference (storage.js envelope.ref); answer: the authorized result read's { identity, provenance }.
export function animationProvenance(ref, answer) {
  const identity = answer?.identity;
  if (!ref || !identity || identity.resultId !== ref.artifactId || identity.revision !== ref.revision) return null;
  const planHash = typeof identity.planHash === 'string' && ID.test(identity.planHash) ? identity.planHash : null;
  const sources = [], seen = new Set();
  for (const source of Array.isArray(answer.provenance?.sources) ? answer.provenance.sources : []) {
    if (source?.read !== true) continue;
    const { read: _read, ...rest } = source;
    const checked = validateSourceRef(rest);
    const key = checked.ok && `${checked.value.sourceId}@${checked.value.revision}`;
    if (!checked.ok || seen.has(key)) continue;
    seen.add(key);
    sources.push(checked.value);
  }
  return { artifactId: ref.artifactId, revision: ref.revision, planHash, sources };
}

// The card's "made from" line: what was read, by title, never a guess about a source that was not read.
export function provenanceText(provenance) {
  if (!provenance) return 'Its sources are not known on this page.';
  if (!provenance.sources.length) return 'Made from your request only.';
  return `Made from: ${provenance.sources.map(source => source.title || source.kind).join(', ')}.`.slice(0, 500);
}
