// /animation attached sources (plan section 6 "Attached models and CAD", AN-06 MVP portion). Pure. A plan's or artifact's
// sourceRefs (contract.js: { sourceId, revision }, an immutable stored revision) name geometry to place in the scene. The MVP phase
// allows none (capabilities.js limits.sourceRefs = 0): the contract refuses them with a diagnostic; this gives the learner the honest
// sentence before anything is spent, and never loads, fetches or substitutes a procedural stand-in. AN-09 (after owner MVP approval)
// resolves them through the existing model-storage / model-import seams.
import { ANIMATION_CAPABILITIES } from './capabilities.js';

export const ASSETS_UNAVAILABLE = 'Attached models are not available in Animation yet. This scene can use built-in shapes, lines and labels only.';

const ID = /^[A-Za-z0-9_.:-]{1,128}$/; // contract.js sourceRef
// A reference is an id and an immutable revision, never a location: a URL (http, blob, data, a signed link) expires or points anywhere.
const looksLikeUrl = v => /^[a-z][a-z0-9+.-]*:\/\//i.test(v) || /^(blob|data|javascript):/i.test(v);

// One reference: { ok: true, value } or { ok: false, issue }.
export function validateSourceRef(ref) {
  if (!ref || typeof ref !== 'object' || Array.isArray(ref) || !Object.keys(ref).every(key => key === 'sourceId' || key === 'revision')) return { ok: false, issue: 'a source must be { sourceId, revision }' };
  for (const key of ['sourceId', 'revision']) {
    if (typeof ref[key] !== 'string' || looksLikeUrl(ref[key]) || !ID.test(ref[key])) return { ok: false, issue: `${key} must be a stored id, not a link` };
  }
  return { ok: true, value: { sourceId: ref.sourceId, revision: ref.revision } };
}

// A request's attached sources against the enabled phase -> { ok: true, refs } | { ok: false, code, message }. Over the phase's limit
// (every one in the MVP) is the one honest message, never a silent drop.
export function admitSourceRefs(refs = [], capabilities = ANIMATION_CAPABILITIES) {
  if (!Array.isArray(refs)) return { ok: false, code: 'invalid_source', message: 'sources must be a list' };
  const out = [];
  for (const ref of refs) {
    const checked = validateSourceRef(ref);
    if (!checked.ok) return { ok: false, code: 'invalid_source', message: checked.issue };
    if (!out.some(seen => seen.sourceId === checked.value.sourceId && seen.revision === checked.value.revision)) out.push(checked.value);
  }
  // ponytail: attached-model loading is AN-09, blocked on owner MVP approval; the MVP only reserves the reference.
  if (out.length > capabilities.limits.sourceRefs) return { ok: false, code: 'assets_unavailable', message: capabilities.limits.sourceRefs ? `At most ${capabilities.limits.sourceRefs} attached sources can be used.` : ASSETS_UNAVAILABLE };
  return { ok: true, refs: out };
}

// The source set a job is bound to (storage.js withJob / settleAnimationJob): every reference by id and revision in one order, so the
// same sources give the same key and any changed revision a different one. Context sources the planner read count too.
export const sourceKey = refs => JSON.stringify(refs.map(ref => `${ref.sourceId}@${ref.revision}`).sort());
