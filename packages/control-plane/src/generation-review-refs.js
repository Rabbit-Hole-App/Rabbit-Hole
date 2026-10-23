// UI-15.1: reference resolution before dispatch (docs/features/generation-review-contract.md section 8). A generation proposal's
// references are re-resolved on the SERVER under the requester's own access, and each is classified ok, changed, deleted,
// inaccessible or unsupported (generation-review.js) BEFORE anything is consumed, reserved or dispatched. Nothing is silently omitted:
// a kind the executor cannot read is `unsupported`, a refused one `inaccessible` (every refusal looks alike by design, so a deleted
// source is reported as inaccessible), and the person sees which, with the draft kept.
import { blockedReferences, referenceStates, revisionOfContextRef } from '../../web/src/generation-review.js';

// The reference kinds each executor reads the content of. Motion's Director takes a prompt and the card's own context, not a
// reference's content yet, so a reference on a Motion proposal is unsupported rather than ignored. /explain reads files and code
// through the same reader its job-create uses (explain-context-refs.js), under the asker's access.
export const CONSUMES = Object.freeze({ motion: [], explain: ['file', 'code'] });

const contextRef = r => ({ sourceId: r.sourceId, kind: r.kind, name: r.label.slice(0, 120), version: r.revision, range: r.range });

// ctx: { req, user: { org, email }, app }. deps.read: the reader (tests inject), default resolveExplainRefs.
// -> { states, blocked, text, refs }: text is the resolved content for the executor, refs the reader's per-reference status.
export async function resolveReferences(env, p, ctx, deps = {}) {
  const references = p.references || [];
  if (!references.length) return { states: [], blocked: [], text: '', refs: [] };
  const consumes = CONSUMES[p.command] || [];
  const probes = {}, readable = references.filter(r => consumes.includes(r.kind));
  for (const r of references) if (!consumes.includes(r.kind)) probes[r.id] = { supported: false };
  let got = null;
  if (readable.length) {
    // The reader loads only when a readable reference exists, so Motion's job never pulls the repository and file readers in.
    try { got = await (deps.read || (await import('./explain-context-refs.js')).resolveExplainRefs)(ctx.req, env, { user: ctx.user, board: { app: ctx.app } }, readable.map(contextRef)); } catch { got = null; }
    readable.forEach((r, i) => {
      const status = got?.refs?.[i]?.status ?? 'unavailable';
      // The source's own revision, where the id carries it (a file's sha256), must still be the one the person attached.
      const own = revisionOfContextRef({ kind: r.kind, sourceId: r.sourceId, version: r.revision });
      probes[r.id] = status === 'unavailable' ? { access: false } : status === 'listed' ? { supported: false } : { revision: own };
    });
  }
  const states = referenceStates(references, probes);
  return { states, blocked: blockedReferences(states), text: got?.text ?? '', refs: got?.refs ?? [] };
}

// The 409 body for a blocked review: every blocked reference with its words, so nothing is dropped or truncated.
export const blockedBody = states => ({ error: states.filter(s => s.state !== 'ok').map(s => s.message).join(' '), code: 'reference_blocked', references: states });
// What the executor was given, as a key the executor compares against the proposal it consumes.
export const referencesKey = references => (references || []).map(r => `${r.id}|${r.sourceId}|${r.revision}`).join(',');
