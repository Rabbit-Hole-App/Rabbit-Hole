// Frozen Explain-back resource evidence (docs/superpowers/plans/2026-10-30-explain-back.md section 7A/7C, EB-05.3). The
// answer's `resources` EvidenceRefs (web/src/explain-back-contract.js; built by web/src/explain-inputs.js) name each source
// at the revision it had when submitted. This resolves them, server-side and under the learner's own board, into bounded
// excerpts with locators, and one coverage entry per input and per Group member. It never runs code, calls a model or
// converts a file: it reads what is stored, at the submitted revision, or says why it could not.
//
//   resolveExplainEvidence(env, actor, attempt, resources, deps?, options?) -> { items, coverage }
//     items: [{ evidenceId, memberId, sourceKind, sourceId, media, label, revision, hash, scope, derivative, excerpts:
//              [{ locator, label, text }], image, cut, provenance: [{ evidenceId, memberId }] }]  - one per distinct source+scope
//     coverage: [{ evidenceId, memberId?, status: read|partial|unavailable|unsupported|processing, inspected?, derivative?, note? }]
//   evidenceParts({ items }) -> { parts, fields, blocks }: request parts, quotable fields and image blocks for the evaluator.
//
// Freezing: a stored file is immutable (id + sha256); its text derivative is pinned (the ref's or options.pins', else the one
// read now, reported in coverage so a reassessment can pin it). A board-held source (Notebook, card, note) is read from the
// learner's saved board and accepted only when its content hash still equals the submitted one; otherwise it is
// unavailable ('source_changed'), never the newer content.
// ponytail: board-held content is not copied at submission; a frozen copy (deps.readFrozenSnapshot, D's private store) is used
// when present. Member boards (another owner's canvas) resolve through deps.loadBoard only.
import { canonicalJson, scopeKey, snapshotOf } from '../../web/src/explain-inputs.js';
import { authorizeFileSource } from './file-access.js';
import { inRange, locLabel, unitsOf } from './file-context.js';
import { ownerRow } from './learn-boards.js';
import { MEDIA_UPLOAD_LIMIT, sniffImageType } from './learn-media.js';
import { base64 } from './token.js';

export const EVIDENCE_LIMITS = Object.freeze({ perInput: 6000, total: 24000, imageBytes: MEDIA_UPLOAD_LIMIT });
const PICTURE = /^image\/(png|jpeg|webp)$/;
const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
const sha256 = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2, '0')).join('');

// ---- default loaders (each injectable) --------------------------------------------------------------------------------
// The learner's own saved board for this attempt: users.id -> email, then the owner's learn_boards row of app/board.
async function loadOwnBoard(env, actor) {
  const user = await env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(actor.userId).first();
  const row = user?.email && await ownerRow(env, { org: actor.org, email: user.email }, actor.app, actor.board);
  if (!row) return null;
  return { row, state: JSON.parse(row.state_json || '{}') };
}
// A stored file source this board references (file_source_refs), else null.
async function authorizeFile(env, row, sourceId) {
  const got = await authorizeFileSource(null, env, sourceId, { row });
  return got instanceof Response ? null : got.source;
}
// The text derivative of one source revision: the pinned one exactly, else the newest ready one.
async function findDerivative(env, sourceId, sourceSha, pin) {
  const db = env.LEARN_DB;
  if (pin) {
    return db.prepare("SELECT * FROM file_derivatives WHERE id = ? AND source_id = ? AND source_sha256 = ? AND sha256 = ? AND converter_version = ? AND status = 'ready'")
      .bind(pin.derivativeId, sourceId, sourceSha, pin.hash, pin.converterVersion).first();
  }
  return db.prepare("SELECT * FROM file_derivatives WHERE source_id = ? AND source_sha256 = ? AND kind IN ('text', 'transcript') AND status = 'ready' ORDER BY updated_at DESC LIMIT 1")
    .bind(sourceId, sourceSha).first();
}
const conversionPending = async (env, sourceId, sourceSha) => !!(await env.LEARN_DB.prepare("SELECT 1 FROM file_jobs WHERE source_id = ? AND source_sha256 = ? AND state IN ('queued', 'validating', 'converting', 'preparing_preview')")
  .bind(sourceId, sourceSha).first());
const readObject = (env, key) => env.LEARN_MEDIA.get(key);
export const DEFAULT_DEPS = Object.freeze({ loadBoard: loadOwnBoard, authorizeFile, findDerivative, conversionPending, readObject, readFrozenSnapshot: null });

// ---- reading one source -----------------------------------------------------------------------------------------------
const inScope = (loc, scope) => {
  if (!scope || !Object.keys(scope).length) return true;
  if (Array.isArray(scope.pages)) return loc?.page != null && scope.pages.includes(loc.page);
  if (Array.isArray(scope.cells)) return loc?.cell != null && scope.cells.includes(loc.cell);
  return inRange(loc, scope);
};
const outputText = output => {
  if (!isObj(output)) return '';
  const join = v => (Array.isArray(v) ? v.join('') : typeof v === 'string' ? v : '');
  if (output.output_type === 'error' || output.ename) return `${output.ename || 'Error'}: ${output.evalue || ''}`;
  return join(output.text) || join(output.data?.['text/plain']) || (output.data && Object.keys(output.data).some(k => k.startsWith('image/')) ? '[image output, not inspected]' : '');
};
// A Notebook snapshot as cell units: the source, then its saved outputs. Reading code is not running it.
const notebookUnits = snapshot => snapshot.cells.map(cell => ({
  loc: { cell: cell.id },
  executed: cell.executionCount != null,
  text: [`(${cell.type}${cell.type === 'code' ? (cell.executionCount != null ? `, saved output from run ${cell.executionCount}` : ', never run') : ''})`, cell.source,
    ...cell.outputs.map(outputText).filter(Boolean).map(text => `[output] ${text}`)].join('\n'),
}));
// A card's or note's readable words: every string field but ids and styling, in key order.
const SKIP = new Set(['id', 'type', 'kind', 'mode', 'color', 'fill', 'dash', 'font', 'level', 'align', 'route', 'head', 'notebook_id', 'attemptId', 'assetKey', 'runs', 'sketch', 'fileRef', 'promptUsed', 'refs']);
function cardText(value, key = '', out = []) {
  if (SKIP.has(key)) return out;
  if (typeof value === 'string') { if (value.trim()) out.push(key ? `${key}: ${value}` : value); }
  else if (Array.isArray(value)) value.forEach(entry => cardText(entry, key, out));
  else if (isObj(value)) for (const k of Object.keys(value).sort()) cardText(value[k], k, out);
  return out;
}
const boardEntry = (state, kind, id) => (kind === 'mark'
  ? [...(state.items || []), ...(state.shapes || [])].find(entry => entry.id === id)
  : [...(state.blocks || []), ...(state.exchanges || [])].find(entry => entry.id === id));

// One source of { sourceKind, sourceId, revision, hash, media, scope } -> { status, excerpts|image, derivative, note, cut }.
async function readSource(env, ctx, src, pin) {
  const { deps, board } = ctx;
  if (src.sourceKind === 'file') {
    const source = board && await deps.authorizeFile(env, board.row, src.sourceId);
    if (!source) return { status: 'unavailable', note: 'not_authorized_or_gone' };
    if (source.sha256 !== src.revision) return { status: 'unavailable', note: 'revision_gone' };
    if (src.media === 'image' && PICTURE.test(source.media_type) && source.bytes <= EVIDENCE_LIMITS.imageBytes && !src.scope) {
      const object = await deps.readObject(env, source.r2_key);
      const bytes = object && new Uint8Array(await object.arrayBuffer());
      const type = bytes && bytes.length === source.bytes && sniffImageType(bytes);
      return type ? { status: 'read', image: { mime: type, data: base64(bytes), bytes: bytes.length } } : { status: 'unavailable', note: 'image_unreadable' };
    }
    const derivative = await deps.findDerivative(env, src.sourceId, source.sha256, pin);
    if (!derivative) {
      if (pin) return { status: 'unavailable', note: 'pinned_derivative_gone' };
      return await deps.conversionPending(env, src.sourceId, source.sha256) ? { status: 'processing', note: 'extraction_running' } : { status: 'unsupported', note: 'no_text_extraction' };
    }
    const object = await deps.readObject(env, derivative.r2_key);
    if (!object) return { status: 'unavailable', note: 'derivative_unreadable' };
    let read;
    try { read = unitsOf(await object.text(), derivative.media_type, null); } catch { return { status: 'unavailable', note: 'derivative_unreadable' }; }
    const units = read.units.filter(unit => inScope(unit.loc, src.scope));
    const pinned = derivative.sha256 ? { derivativeId: derivative.id, hash: derivative.sha256, converterVersion: derivative.converter_version || 'v1' } : null;
    if (!units.length) return { status: 'unavailable', note: 'scope_not_in_extraction', derivative: pinned };
    return { units, complete: read.complete, limited: read.limited, derivative: pinned, transcript: derivative.kind === 'transcript' };
  }
  // A board-held source: the frozen copy when one was kept, else the saved board, only at the submitted hash.
  let entry = null;
  if (deps.readFrozenSnapshot) { try { entry = await deps.readFrozenSnapshot(env, ctx.actor, ctx.attempt, src); } catch { entry = null; } }
  const snapshot = entry ? (entry.snapshot ?? null) : null;
  let content = snapshot;
  if (!content) {
    const live = board && boardEntry(board.state, src.sourceKind, src.sourceId);
    if (!live) return { status: 'unavailable', note: 'source_gone' };
    content = snapshotOf(live, src.scope || null);
  }
  if (!src.hash || await sha256(canonicalJson(content)) !== src.hash) return { status: 'unavailable', note: 'source_changed' };
  if (Array.isArray(content.cells) && content.notebook !== undefined) {
    const units = notebookUnits(content);
    return units.length ? { units, complete: true, notebook: { cells: units.map(unit => ({ id: unit.loc.cell, executed: unit.executed })) } } : { status: 'unavailable', note: 'scope_not_in_notebook' };
  }
  const text = cardText(content).join('\n');
  return text ? { units: [{ loc: null, text }], complete: true } : { status: 'unsupported', note: 'no_readable_text' };
}

// Units -> bounded excerpts; what was cut says partial.
function excerpt(read, budget) {
  const excerpts = [];
  let left = budget, cut = false;
  for (const unit of read.units) {
    if (left <= 0) { cut = true; break; }
    const text = unit.text.slice(0, left);
    if (text.length < unit.text.length) cut = true;
    excerpts.push({ locator: unit.loc, label: locLabel(unit.loc), text });
    left -= text.length;
  }
  return { excerpts, cut: cut || read.complete === false, used: budget - left };
}

/**
 * Resolve the answer's resource EvidenceRefs. actor: the attempt's {org, userId, app, board}; attempt: the saved attempt
 * (for deps.readFrozenSnapshot); options.pins: { [evidenceId or evidenceId/memberId]: DerivativeRef } from an earlier
 * coverage, so a reassessment reads the same extraction.
 */
export async function resolveExplainEvidence(env, actor, attempt, resources = [], deps = {}, { pins = {}, limits = EVIDENCE_LIMITS } = {}) {
  const ctx = { actor, attempt, deps: { ...DEFAULT_DEPS, ...deps }, board: null };
  try { ctx.board = await ctx.deps.loadBoard(env, actor); } catch { ctx.board = null; }
  const items = [], coverage = [], seen = new Map();
  let left = limits.total;
  const one = async (evidenceId, memberId, src, pin) => {
    const at = memberId ? { evidenceId, memberId } : { evidenceId };
    if (src.state !== 'ready') return { ...at, status: src.state === 'unsupported' ? 'unsupported' : src.state === 'uploading' ? 'processing' : 'unavailable', note: `evidence_${src.state}` };
    if (src.board != null && src.board !== actor.board) return { ...at, status: 'unavailable', note: 'cross_scope_evidence' };
    // Direct and through a Group, or two links to one stored file: read once, every connection kept as provenance.
    const key = `${src.sourceKind}:${src.sourceId}:${scopeKey(src.scope)}`;
    if (seen.has(key)) {
      const first = seen.get(key);
      first.item?.provenance.push(at);
      return { ...at, status: first.status, note: `same_as:${first.at.evidenceId}${first.at.memberId ? `/${first.at.memberId}` : ''}` };
    }
    let read;
    try { read = await readSource(env, ctx, src, pin); } catch { read = { status: 'unavailable', note: 'read_failed' }; }
    let entry;
    let item = null;
    if (read.units) {
      const { excerpts, cut, used } = excerpt(read, Math.min(limits.perInput, left));
      left -= used;
      const status = !excerpts.length ? 'unavailable' : cut ? 'partial' : 'read';
      item = { evidenceId, memberId: memberId || null, sourceKind: src.sourceKind, sourceId: src.sourceId, media: src.media, label: src.label || null, revision: src.revision, hash: src.hash || null,
        scope: src.scope || null, derivative: read.derivative || null, excerpts, image: null, cut, provenance: [at], ...(read.notebook ? { notebook: read.notebook } : {}) };
      entry = { ...at, status, inspected: { chars: used, units: excerpts.length, ...(read.notebook ? { cells: read.notebook.cells, codeRun: false } : {}), ...(read.transcript ? { transcriptOnly: true } : {}) },
        ...(read.derivative ? { derivative: read.derivative } : {}), ...(!excerpts.length ? { note: 'over_budget' } : cut ? { note: read.limited ? `extraction_kept:${read.limited}` : 'excerpt_cut' } : {}) };
    } else if (read.image) {
      item = { evidenceId, memberId: memberId || null, sourceKind: src.sourceKind, sourceId: src.sourceId, media: src.media, label: src.label || null, revision: src.revision, hash: src.hash || null,
        scope: null, derivative: null, excerpts: [], image: read.image, cut: false, provenance: [at] };
      entry = { ...at, status: 'read', inspected: { image: true, bytes: read.image.bytes } };
    } else entry = { ...at, status: read.status, ...(read.derivative ? { derivative: read.derivative } : {}), note: read.note };
    if (item && (entry.status === 'read' || entry.status === 'partial')) items.push(item); else item = null;
    seen.set(key, { at, status: entry.status, item });
    return entry;
  };
  for (const ref of resources.filter(r => r?.role === 'resource')) {
    if (ref.media !== 'group') {
      coverage.push(await one(ref.evidenceId, null, { ...ref, sourceId: ref.assetId }, ref.derivative || pins[ref.evidenceId] || null));
      continue;
    }
    // A Group: its frozen members, each read on its own; the Group's entry sums them.
    if (ref.board != null && ref.board !== actor.board) { coverage.push({ evidenceId: ref.evidenceId, status: 'unavailable', note: 'cross_scope_evidence' }); continue; }
    const members = [];
    for (const m of ref.members || []) members.push(await one(ref.evidenceId, m.sourceId, { ...m, label: null }, pins[`${ref.evidenceId}/${m.sourceId}`] || null));
    const read = members.filter(m => m.status === 'read').length, some = members.filter(m => m.status === 'read' || m.status === 'partial').length;
    const status = ref.state !== 'ready' ? (ref.state === 'unsupported' ? 'unsupported' : 'unavailable') : !members.length ? 'unavailable' : read === members.length ? 'read' : some ? 'partial' : members.some(m => m.status === 'processing') ? 'processing' : 'unavailable';
    coverage.push({ evidenceId: ref.evidenceId, status, inspected: { members: members.length, read, partial: some - read }, ...(ref.state !== 'ready' ? { note: `evidence_${ref.state}` } : {}) }, ...members);
  }
  return { items, coverage };
}

/** Evaluator parts for resolved items: a part per source (resource kind), a quotable field per part, image blocks. */
export function evidenceParts({ items }) {
  const parts = [], fields = [], blocks = [];
  for (const item of items) {
    const id = item.memberId ? `${item.evidenceId}/${item.memberId}` : item.evidenceId;
    const text = item.excerpts.map(e => (e.label ? `[${e.label}] ${e.text}` : e.text)).join('\n');
    parts.push({ id, kind: 'resource', media: item.media, label: item.label, source: `${item.sourceKind}:${item.sourceId}`, revision: item.revision, scope: item.scope,
      ...(item.image ? { image: 'attached below' } : { text }), ...(item.notebook ? { note: 'Saved notebook cells and outputs. The code was not run for this review.' } : {}),
      ...(item.provenance.length > 1 ? { alsoConnectedAs: item.provenance.slice(1).map(p => (p.memberId ? `${p.evidenceId}/${p.memberId}` : p.evidenceId)) } : {}) });
    if (text) fields.push({ field: id, text, locators: item.excerpts.map(e => e.locator) });
    if (item.image) blocks.push({ type: 'image', source: { type: 'base64', media_type: item.image.mime, data: item.image.data } });
  }
  return { parts, fields, blocks };
}
