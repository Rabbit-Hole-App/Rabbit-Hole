// R4 integration glue: the request-bound `readSource(access, {sourceId, revision, scope}, env)` the create route calls (roadmap-routes.js), over Tools'
// readRoadmapSource and the production owner-only reader (roadmap-source-reader.js). It runs inside the learner's request, reads the declared Markdown
// scope completely or says why not, and returns what createRoadmap stores. Planning later re-reads the same bytes request-less and checks the revision
// and the scope fingerprint (the source revision is the sha256 of the stored bytes, so equal means the same text: no separate R2 snapshot, ponytail).
//   scope { kind: 'whole' }                      the whole bounded source
//   scope { kind: 'passage', sourceRefId }       R3's server-minted reference; its quote must occur exactly once (or be settled by its context)
// R3 (learn_source_refs) is read through `resolveSourceRef`; without it a passage request is unsupported, never guessed.
import { readRoadmapSource } from './roadmap-source.js';
import { readMarkdownForActor } from './roadmap-source-reader.js';
import { longMarkdownEnabled, indexSource, scopeChoices, resolveChoice, INDEX_COPY } from './roadmap-source-index.js';
import { readLongSource, LONG_CHOICE, longChoice } from './roadmap-source-long.js';

export const LIMIT_COPY = Object.freeze({
  tooLarge: 'This source is longer than one roadmap can read completely. Choose a section or a passage and it will be covered fully.', // S15
  offers: Object.freeze([{ kind: 'passage', label: 'Select a passage' }, { kind: 'section', label: 'Pick a section' }]), // S16
  unavailable: 'This source is not available.', // NEW (S32)
  changed: 'The source changed since this plan was made. Update the plan to continue.', // S23
  passage: 'This passage could not be found in the source exactly once. Select it again.', // NEW (S33)
  section: 'That part of the source is not in the current outline. Choose again.', // NEW (S43) R7a, only with long Markdown on
});

const SREF_ID = /^sref_[0-9a-f]{24}$/;
const TABLE_MISSING = /no such table/i;

// R3's own row, owner-scoped (source-refs.js ownRow): this learner minted it for this source. Absent table (R3 not deployed) is "no reference".
export async function d1ResolveSourceRef(env, access, id) {
  if (!SREF_ID.test(id || '')) return null;
  try {
    const row = await env.LEARN_DB.prepare('SELECT * FROM learn_source_refs WHERE id = ? AND org = ? AND owner_email = ?').bind(id, access.org, access.actorEmail).first();
    return row && row.kind === 'markdown' ? { key: row.source_key, rev: row.source_rev, name: row.source_name, quote: JSON.parse(row.anchor_json)?.quote } : null;
  } catch (error) { if (TABLE_MISSING.test(String(error?.message))) return null; throw error; }
}

// R3's public reference (publicRef in source-refs.js) of this learner's row, for the card's metadata. null when absent (R3 not deployed).
export async function d1PublicRef(env, access, id) {
  if (!SREF_ID.test(id || '')) return null;
  try {
    const row = await env.LEARN_DB.prepare('SELECT * FROM learn_source_refs WHERE id = ? AND org = ? AND owner_email = ?').bind(id, access.org, access.actorEmail).first();
    return row ? { v: 1, id: row.id, kind: row.kind, source: { key: row.source_key, rev: row.source_rev, name: row.source_name, home: row.source_home ?? null }, anchor: JSON.parse(row.anchor_json) } : null;
  } catch (error) { if (TABLE_MISSING.test(String(error?.message))) return null; throw error; }
}

// Many references at once, for the view: id -> public reference (the same shape as d1PublicRef). Absent table or unknown ids give an empty map.
export async function d1PublicRefs(env, access, ids) {
  const wanted = [...new Set(ids.filter(id => SREF_ID.test(id || '')))];
  if (!wanted.length) return new Map();
  try {
    const { results } = await env.LEARN_DB.prepare(`SELECT * FROM learn_source_refs WHERE org = ? AND owner_email = ? AND id IN (${wanted.map(() => '?').join(',')})`).bind(access.org, access.actorEmail, ...wanted).all();
    return new Map((results || []).map(row => [row.id, { v: 1, id: row.id, kind: row.kind, source: { key: row.source_key, rev: row.source_rev, name: row.source_name, home: row.source_home ?? null }, anchor: JSON.parse(row.anchor_json) }]));
  } catch (error) { if (TABLE_MISSING.test(String(error?.message))) return new Map(); throw error; }
}

// The offsets of a quote inside the source text: its only occurrence, or the only one its prefix and suffix settle. null = zero or several.
export function locateUnique(text, { exact, prefix = '', suffix = '' }) {
  const at = [];
  for (let i = text.indexOf(exact); i !== -1; i = text.indexOf(exact, i + 1)) at.push(i);
  const fit = at.length === 1 ? at : at.filter(i => text.slice(Math.max(0, i - prefix.length), i) === prefix && text.startsWith(suffix, i + exact.length));
  return fit.length === 1 ? { start: fit[0], end: fit[0] + exact.length } : null;
}

const refuse = (code, error, status, extra = {}) => ({ error, code, status, ...extra });
const limit = (read, extra = {}) => refuse('source_too_large', extra.message ?? LIMIT_COPY.tooLarge, 422, { limitation: { code: 'source_too_large', message: LIMIT_COPY.tooLarge, readChars: 0, sourceChars: read.sourceChars ?? read.passageChars ?? 0, offers: LIMIT_COPY.offers, ...extra } });

// R7a (only with the long-Markdown switch): what the learner may narrow an over-bound source to, and exactly what is and is not covered.
// Wire shape, additive to the R4 limitation: coverage { totalChars, indexedThrough, complete, summarizedChars, unread[], notes[] }, choices [{ locationId, part, parts, label, chars }].
export function wireCoverage(coverage) {
  return { totalChars: coverage.totalChars, indexedThrough: coverage.indexedThrough, complete: coverage.complete, summarizedChars: coverage.summarized.reduce((n, r) => n + r.end - r.start, 0),
    unread: coverage.unreadable.map(({ start, end, reason }) => ({ start, end, reason })), notes: coverage.limitations.map(l => l.message) };
}
async function longLimitation(env, access, ref, readSourceForActor) {
  const got = await indexSource(env, access, { sourceKey: ref.key, sourceRevision: ref.rev }, { readSourceForActor });
  if (got.status !== 'ok') return {};
  const { index } = got, choices = scopeChoices(index);
  return { coverage: wireCoverage(index.coverage), choices: [...(index.status === 'ready' ? [longChoice(index.source.chars)] : []), ...choices].map(({ locationId, part, parts, label, chars }) => ({ locationId, part, parts, label, chars })),
    ...(index.status === 'unreadable' ? { message: INDEX_COPY.overReadLimit, offers: [] } : {}) };
}

export function makeReadSource(env, { readSourceForActor = readMarkdownForActor, resolveSourceRef = d1ResolveSourceRef, limits } = {}) {
  const deps = { readSourceForActor, ...(limits ? { limits } : {}) };
  return async function readSource(access, { sourceId, revision, scope } = {}) {
    const ref = { key: sourceId, rev: revision };
    let wanted = { kind: 'declared' };
    const long = longMarkdownEnabled(env), more = () => (long ? longLimitation(env, access, ref, readSourceForActor) : {});
    if (scope?.kind === 'section' && long) {
      if (typeof scope.locationId !== 'string' || !(scope.part === undefined || (Number.isInteger(scope.part) && scope.part >= 1))) return refuse('invalid_request', 'scope', 400);
      // R7a: the first offered part is the whole document, planned through its outline (roadmap-source-long.js). Same request shape as any part, so no new client call.
      if (scope.locationId === LONG_CHOICE) {
        const whole = await readLongSource(env, access, { ref }, { readSourceForActor });
        if (whole.status === 'ok') return { key: sourceId, rev: whole.rev, scopeFingerprint: whole.sourceFingerprint, scope: { kind: 'long', start: 0, end: whole.coverage.end, chars: whole.coverage.chars, sourceName: whole.name ?? '' } };
        if (whole.status === 'needs_clarification') return limit({}, await more());
        return whole.reason === 'source_changed' ? refuse('source_changed', LIMIT_COPY.changed, 409) : whole.reason === 'not_long' ? refuse('needs_clarification', LIMIT_COPY.section, 422) : refuse('source_unavailable', LIMIT_COPY.unavailable, 409);
      }
      const indexed = await indexSource(env, access, { sourceKey: sourceId, sourceRevision: revision }, { readSourceForActor });
      if (indexed.status !== 'ok') return indexed.reason === 'source_changed' ? refuse('source_changed', LIMIT_COPY.changed, 409) : refuse('source_unavailable', LIMIT_COPY.unavailable, 409);
      if (indexed.index.status !== 'ready') return limit({}, await more());
      const choice = resolveChoice(indexed.index, { locationId: scope.locationId, part: scope.part ?? 1 });
      if (!choice) return refuse('needs_clarification', LIMIT_COPY.section, 422);
      wanted = { kind: 'passage', start: choice.start, end: choice.end };
    } else if (scope?.kind === 'passage') {
      const found = await resolveSourceRef(env, access, scope.sourceRefId);
      if (!found || found.key !== sourceId || found.rev !== revision || !found.quote?.exact) return refuse('source_unsupported', LIMIT_COPY.unavailable, 422);
      const whole = await readSourceForActor(env, access, ref);
      if (whole.status !== 'ok') return refuse(whole.status === 'changed' ? 'source_changed' : 'source_unavailable', whole.status === 'changed' ? LIMIT_COPY.changed : LIMIT_COPY.unavailable, 409);
      if (whole.complete === false) return limit({}, await more());
      const located = locateUnique(whole.text, found.quote);
      if (!located) return refuse('needs_clarification', LIMIT_COPY.passage, 422);
      wanted = { kind: 'passage', ...located, quote: found.quote.exact };
    } else if (scope && scope.kind !== 'whole') return refuse('invalid_request', 'scope', 400);
    const read = await readRoadmapSource(env, access, { ref, scope: wanted }, deps);
    if (read.status === 'needs_clarification') return limit(read, await more());
    if (read.status === 'unsupported') return refuse('source_unsupported', LIMIT_COPY.unavailable, 422);
    if (read.status !== 'ok') return read.reason === 'source_changed' ? refuse('source_changed', LIMIT_COPY.changed, 409) : refuse('source_unavailable', LIMIT_COPY.unavailable, 409);
    return { key: sourceId, rev: read.rev, scopeFingerprint: read.sourceFingerprint,
      scope: { kind: wanted.kind === 'passage' ? 'passage' : 'whole', start: read.coverage.start, end: read.coverage.end, chars: read.coverage.chars, sourceName: read.name ?? '' } };
  };
}
