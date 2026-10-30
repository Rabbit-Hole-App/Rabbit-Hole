// /animation source references (plan section 6 "Attached models and CAD", AN-06 MVP portion). Pure. The MVP reserves the shape of an
// immutable source reference and refuses attached geometry honestly: no loading, no URL, no stand-in. AN-09 (after owner MVP
// approval) resolves these through the existing model-storage / model-import seams; nothing here fetches.
//
//   ref = { role: 'context' | 'asset', kind, sourceId, revision, title? }
//   role context: a source the planner read for content (notes, a file, a link), kept as provenance.
//   role asset:   geometry to place in the scene (a GLB, a CAD model, an imported model). Refused in the MVP phase.

export const SOURCE_ROLES = Object.freeze(['context', 'asset']);
// Reserved kinds; an asset kind is accepted as a reference shape only (AN-09 binds it to stored files).
export const ASSET_KINDS = Object.freeze(['model', 'cad', 'glb']);
export const CONTEXT_KINDS = Object.freeze(['file', 'link', 'note', 'card', 'image', 'repository']);
// Plan section 5 limits: 8 attached sources.
export const SOURCE_LIMIT = 8;
export const ASSETS_UNAVAILABLE = 'Attached models are not available in Animation yet. This scene can use built-in shapes, lines and labels only.';

const ID = /^[A-Za-z0-9_.:-]{1,160}$/;
const KEYS = ['role', 'kind', 'sourceId', 'revision', 'title'];
// A reference is an id and an immutable revision, never a location: a URL (http, blob, data, a signed link) expires or points
// anywhere, so it is refused even when it looks like an id.
const looksLikeUrl = v => /^[a-z][a-z0-9+.-]*:\/\//i.test(v) || /^(blob|data|javascript):/i.test(v);

// One reference: { ok: true, value } or { ok: false, issue }.
export function validateSourceRef(ref) {
  if (!ref || typeof ref !== 'object' || Array.isArray(ref) || !Object.keys(ref).every(key => KEYS.includes(key))) return { ok: false, issue: 'a source must be { role, kind, sourceId, revision, title? }' };
  if (!SOURCE_ROLES.includes(ref.role)) return { ok: false, issue: 'role must be context or asset' };
  if (!(ref.role === 'asset' ? ASSET_KINDS : CONTEXT_KINDS).includes(ref.kind)) return { ok: false, issue: `unknown ${ref.role} kind` };
  for (const key of ['sourceId', 'revision']) {
    if (typeof ref[key] !== 'string' || looksLikeUrl(ref[key]) || !ID.test(ref[key])) return { ok: false, issue: `${key} must be a stored id, not a link` };
  }
  if (ref.title !== undefined && (typeof ref.title !== 'string' || ref.title.length > 200)) return { ok: false, issue: 'title' };
  return { ok: true, value: { role: ref.role, kind: ref.kind, sourceId: ref.sourceId, revision: ref.revision, ...(ref.title !== undefined ? { title: ref.title } : {}) } };
}

// A plan's or a job's references, admitted for the phase the server enabled. The MVP admits context references only; any attached
// asset is refused with the one honest message before anything is spent (never a silent drop or a procedural stand-in).
// -> { ok: true, refs } | { ok: false, code: 'invalid_source' | 'too_many_sources' | 'assets_unavailable', message, refs? }
export function admitSourceRefs(refs = [], { phase = 'mvp' } = {}) {
  if (!Array.isArray(refs)) return { ok: false, code: 'invalid_source', message: 'sources must be a list' };
  if (refs.length > SOURCE_LIMIT) return { ok: false, code: 'too_many_sources', message: `At most ${SOURCE_LIMIT} sources can be used.` };
  const out = [];
  const seen = new Set();
  for (const ref of refs) {
    const checked = validateSourceRef(ref);
    if (!checked.ok) return { ok: false, code: 'invalid_source', message: checked.issue };
    const key = `${checked.value.role}|${checked.value.kind}|${checked.value.sourceId}|${checked.value.revision}`;
    if (!seen.has(key)) { seen.add(key); out.push(checked.value); }
  }
  // ponytail: attached-model loading is AN-09, blocked on owner MVP approval; the MVP only reserves the reference.
  if (phase === 'mvp' && out.some(ref => ref.role === 'asset')) return { ok: false, code: 'assets_unavailable', message: ASSETS_UNAVAILABLE, refs: out };
  return { ok: true, refs: out };
}

// The source set a job is bound to (storage.js withJob / settleAnimationJob): every admitted reference by identity and revision, in one
// order, so the same sources give the same key and any changed revision a different one.
export const sourceKey = refs => JSON.stringify([...refs].map(ref => [ref.role, ref.kind, ref.sourceId, ref.revision]).sort((a, b) => (a.join('|') < b.join('|') ? -1 : a.join('|') > b.join('|') ? 1 : 0)));
