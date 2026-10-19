import { editableImage } from './inline-image-plan.js';
import { validateExtraction } from './inline-extraction.js';
import { fileContextManifest } from './file-context-manifest.js';
import { validateCardContent } from './inline-card-edit.js';
import { validateEquationResult } from './inline-equation-result.js';
import { equationTransaction } from './inline-equation-apply.js';
import { validateDiagram, layoutDiagram, toCanvasObjects } from './inline-diagram.js';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const keys = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => allowed.includes(key));
const fail = error => ({ ok: false, error, errors: [error] });
function available(original, board) {
  return editableImage(original) && !original.groupId && !original.group_id && fileContextManifest(original.fileRef)?.family === 'image'
    && !(board.links || []).some(link => link.from === original.id || link.to === original.id)
    && !(board.groups || []).some(group => group.members?.includes(original.id));
}
function nativeContent(content, output) {
  if (output === 'equation') {
    if (!keys(content, ['kind', 'latex', 'label', 'assumptions']) || content.kind !== 'equation') return fail('Invalid equation replacement.');
    const { kind, ...input } = content, checked = validateEquationResult(input);
    return checked.ok && checked.result.kind === 'equation' ? { ok: true, content: checked.result } : fail(checked.error);
  }
  if (output === 'diagram') {
    if (!keys(content, ['kind', 'spec']) || content.kind !== 'diagram') return fail('Invalid diagram replacement.');
    const checked = validateDiagram(content.spec);
    return checked.ok ? { ok: true, content: { kind: 'diagram', spec: checked.spec } } : fail(checked.errors[0]);
  }
  const table = output === 'table', type = table ? 'table' : 'snippet';
  if (!['table', 'code'].includes(output) || !keys(content, ['kind', 'block']) || content.kind !== 'card'
    || !keys(content.block, table ? ['type', 'columns', 'rows'] : ['type', 'code']) || content.block.type !== type) return fail('Invalid native card replacement.');
  const { type: ignored, ...value } = content.block;
  const checked = validateCardContent(table ? { type, columns: [''], rows: [] } : { type, code: '' }, value);
  if (!checked.ok || table && (!value.rows.length || value.rows.length > 100 || value.columns.length > 50) || !table && !value.code.trim()) return fail(checked.error || 'The replacement is empty or exceeds supported bounds.');
  return { ok: true, content: structuredClone(content) };
}
export function validateImageReplacement(result, frozen, board, { mode, readOnly, locked } = {}) {
  if (readOnly || locked || mode !== 'edit' || frozen?.actionMode !== 'edit'
    || !keys(result, ['kind', 'requestId', 'targetId', 'output', 'content', 'extraction', 'summary']) || result.kind !== 'image_replacement'
    || typeof result.requestId !== 'string' || !/^[A-Za-z0-9-]{8,80}$/.test(result.requestId) || result.requestId !== frozen.requestId
    || !keys(frozen.imageReplacement, ['targetId', 'output']) || result.targetId !== frozen.imageReplacement.targetId || result.output !== frozen.imageReplacement.output
    || !same(frozen.ids, [result.targetId]) || typeof result.summary !== 'string' || !result.summary.trim() || result.summary.length > 300
    || !frozen.extractionScope?.app || frozen.extractionScope.board !== 'main' || frozen.extractionScope.member || frozen.extractionScope.share) return fail('Choose an explicit image replacement in Edit on your main canvas.');
  const matches = (board.blocks || []).filter(block => block.id === result.targetId), original = matches[0];
  if (matches.length !== 1 || !same(original, frozen.extractionImage) || !available(original, board)) return fail('The original image, permissions or dependencies changed. Request a new preview.');
  const receipt = validateExtraction(result.extraction, { block: original, ids: frozen.ids });
  if (!receipt.ok || !receipt.extraction.source.source) return fail(receipt.error || 'Save or normalize the original image before replacing it.');
  const checked = nativeContent(result.content, result.output);
  if (!checked.ok) return checked;
  return { ok: true, preview: { content: checked.content, extraction: receipt.extraction, raw: structuredClone(result), original: structuredClone(original), output: result.output, summary: result.summary, frozen: structuredClone(frozen) } };
}
export function imageReplacementTransaction(preview, { requestId, board, bounds, retainedSource, provenance, mode = 'edit', readOnly = false, locked = false } = {}) {
  const checked = validateImageReplacement(preview?.raw, preview?.frozen, board, { mode, readOnly, locked });
  if (!checked.ok) return checked;
  const current = checked.preview, original = current.original, source = original.fileRef.source;
  if (requestId !== current.raw.requestId || !retainedSource || retainedSource.id !== `file:${source.id}@${source.rev}` || retainedSource.kind !== 'file' || retainedSource.attached !== false
    || !same(fileContextManifest(retainedSource.fileRef), fileContextManifest(original.fileRef))) return fail('Retain the verified original asset before replacement.');
  if (!bounds || !['x', 'y', 'w', 'h'].every(key => Number.isFinite(bounds[key])) || bounds.w <= 0 || bounds.h <= 0) return fail('The original image placement is unavailable.');
  const inline = { ...structuredClone(provenance || {}), requestId, mode: 'edit', extraction: structuredClone(current.extraction), replacement: { originalId: original.id, output: current.output } };
  const stamp = value => ({ ...value, inline });
  let tx;
  if (current.output === 'table' || current.output === 'code') {
    const placement = Object.fromEntries(['dx','dy','w','h','cardLayout','expanded'].filter(key => Object.hasOwn(original,key)).map(key => [key,structuredClone(original[key])]));
    const after = stamp({ ...current.content.block, ...placement, id: original.id });
    tx = { kind: 'edit', changes: [{ id: original.id, list: 'blocks', after }], additions: [], removals: [] };
  } else {
    const taken = new Set(['blocks','items','shapes','links','groups'].flatMap(list => (board[list] || []).map(value => value.id)));
    if (current.output === 'equation') {
      const made = equationTransaction(current.content, { point: { x: bounds.x, y: bounds.y }, requestId, taken: [...taken] });
      if (!made.ok) return made;
      tx = made.tx;
      tx.additions = tx.additions.map(entry => ({ ...entry, after: stamp(entry.after) }));
    } else {
      try {
        const made = toCanvasObjects(current.content.spec, layoutDiagram(current.content.spec), { requestId, at: { x: bounds.x, y: bounds.y }, taken });
        tx = { kind: 'edit', changes: [], additions: ['shapes','links','groups'].flatMap(list => made[list].map(after => ({ id: after.id, list, after: stamp(after) }))), removals: [] };
      } catch (error) { return fail(error.message); }
    }
    tx.removals = [{ id: original.id, list: 'blocks' }];
  }
  return { ok: true, tx: { ...tx, id: requestId, retainedSources: [structuredClone(retainedSource)] } };
}
