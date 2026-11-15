// packages/web/src/rehearsal-cards.js
// The two canvas cards the rehearsal flow makes (owner decisions 2026-11-14): the Run card (type 'run', RunCard.jsx) and the Runbook (a 'doc' card, DocCard.jsx),
// both "generated": they carry `generated: { kind: 'rehearsal', repo, commit }`, and no delete path removes a card that has it (the canvas's per-card rule;
// deleting the canvas still removes them). One of each per (repo, commit). Pure: no React, no network, no storage.
import { buildRunbook, isRunbookBlock, runbookTitle } from './learn-runbook.js';

export const GENERATED_NOTE = 'Generated cards stay on the canvas';
export const RUN_CARD_SIZE = { w: 680, h: 640 };
export const TAIL_BYTES = 8192; // one cell's stored output: the board is saved whole and shares a 1.9 MB limit
const EXPECTED_BYTES = 2048; // a cell's recorded stdout head and tail, kept on the card so its expected output reads before the first Start

export const isGenerated = block => !!block?.generated && typeof block.generated === 'object';

// ---- the delete rule ---------------------------------------------------------------------------------------------------

// The ids a delete or cut may remove: every id but a generated card's. refused counts the generated cards left, so the caller toasts once.
export function deletableIds(ids, blocks) {
  const kept = new Set((blocks || []).filter(isGenerated).map(block => block.id));
  const allowed = (ids || []).filter(id => !kept.has(id));
  return { ids: allowed, refused: (ids || []).length - allowed.length };
}

// A restored history step (undo, redo, Esc on a gesture) never removes a generated card: any that the step lacks is put back as it is now.
export function keepGenerated(next, current) {
  const have = new Set((next || []).map(block => block.id)), missing = (current || []).filter(block => isGenerated(block) && !have.has(block.id));
  return missing.length ? [...(next || []), ...missing] : next;
}

// ---- finding and building ----------------------------------------------------------------------------------------------

const short = commit => String(commit || '').slice(0, 7);
export const runTitle = record => `Run - ${record.repo} @ ${short(record.commit)}`;
const generatedOf = (record, app) => ({ kind: 'rehearsal', repo: record.repo, commit: record.commit, ...(app ? { app } : {}) });

// The card of this type already made for this (repo, commit). A copy (Duplicate, paste) has no `generated`, so it is never mistaken for it.
export const findRehearsalCard = (blocks, type, record) => (blocks || []).find(block => block.type === type && isGenerated(block)
  && block.generated.kind === 'rehearsal' && block.generated.repo === record.repo && block.generated.commit === record.commit) || null;

// The Run card: the record reference (app, board: where POST /api/learn/run finds it; commit; hardware), and nothing of a session. Cells and results arrive with the
// first Start and the first run (RunCard.jsx).
export const newRunBlock = (record, { app, board }) => ({ id: crypto.randomUUID(), type: 'run', dx: 0, dy: 0, title: runTitle(record), generated: generatedOf(record),
  run: { app, board, commit: record.commit, hardware: record.hardware || 'cpu' } });

export const newRunbookBlock = (record, repositoryApp) => ({ id: crypto.randomUUID(), type: 'doc', dx: 0, dy: 0, title: runbookTitle(record), generated: generatedOf(record, repositoryApp),
  blocks: buildRunbook(record) });

// Regeneration in place: the generator's own blocks are replaced, as one run, where the first of them stood; everything else (the owner's annotations) is left where it
// is. A runbook whose own blocks are all gone gets the fresh ones at the top.
export function regenerate(existing, fresh) {
  const list = Array.isArray(existing) ? existing : [], at = list.findIndex(isRunbookBlock);
  const rest = list.filter(block => !isRunbookBlock(block));
  const index = at < 0 ? 0 : list.slice(0, at).filter(block => !isRunbookBlock(block)).length;
  return [...rest.slice(0, index), ...fresh, ...rest.slice(index)];
}

// Open one of the two cards (the chip's buttons). ops: the Chat's canvasOps (blocks, locate, canEdit, insertGenerated, updateCard). An existing card is focused (selected and
// panned to); a Runbook is also regenerated in place. A new one goes beside its sibling, else beside the selection, else where the learner looks.
// -> { id, existed } or null when the canvas cannot take a card (view-only).
export function openRehearsalCard(ops, kind, record, { app, board, repositoryApp }) {
  const blocks = ops.blocks?.() || [], type = kind === 'run' ? 'run' : 'doc';
  const existing = findRehearsalCard(blocks, type, record);
  if (existing) {
    if (kind === 'runbook' && ops.canEdit?.()) ops.updateCard?.(existing.id, block => ({ ...block, blocks: regenerate(block.blocks, buildRunbook(record)) }));
    ops.locate?.(existing.id);
    return { id: existing.id, existed: true };
  }
  if (!ops.canEdit?.()) return null;
  const sibling = findRehearsalCard(blocks, kind === 'run' ? 'doc' : 'run', record);
  const block = kind === 'run' ? newRunBlock(record, { app, board }) : newRunbookBlock(record, repositoryApp);
  const id = ops.insertGenerated?.(block, { beside: sibling?.id || null });
  return id ? { id, existed: false } : null;
}

// ---- what the Run card stores ------------------------------------------------------------------------------------------

// The last `max` characters of a pane's text (about 8 KB for Latin output): the end of an output is what says how it ended.
export const tailOf = (text, max = TAIL_BYTES) => { const s = String(text ?? ''); return s.length > max ? s.slice(s.length - max) : s; };

// A cell as the card keeps it: the controller's cell with its recorded stdout cut (the full record stays server-side).
export const storedCell = cell => ({ ...cell, expected: { ...cell.expected, ...(cell.expected?.stdoutHead ? { stdoutHead: tailOf(cell.expected.stdoutHead, EXPECTED_BYTES) } : {}), ...(cell.expected?.stdoutTail ? { stdoutTail: tailOf(cell.expected.stdoutTail, EXPECTED_BYTES) } : {}) } });

// A finished run (run-status.json plus its pane text) as the card keeps it, stamped with when it ended. No runId and no session id.
export const storedResult = (run, text, at = new Date().toISOString()) => ({ status: run.status, rc: run.rc ?? null, sec: run.sec ?? null, cmd: run.cmd || '', out: tailOf(text), at });

// A stored result back as the run status the card renders from.
export const runFromStored = result => ({ status: result.status, rc: result.rc, sec: result.sec, cmd: result.cmd, stdoutTail: result.out || '', stderrTail: '', complete: true, at: result.at });
export const resultsToRuns = results => Object.fromEntries(Object.entries(results || {}).map(([id, result]) => [id, runFromStored(result)]));

// What Chat, Search and the semantic board read from a Run card: its commands and the last outputs, as plain text, bounded.
export function runText(block) {
  const run = block?.run || {};
  const cells = (run.cells || []).map(cell => {
    const last = run.results?.[cell.cellId];
    return [`${cell.title}: ${cell.cmd}`, last ? `Last run ${last.status}${last.rc != null ? ` rc ${last.rc}` : ''}${last.at ? ` at ${last.at}` : ''}:\n${tailOf(last.out, 1500)}` : ''].filter(Boolean).join('\n');
  });
  return [`Run card for ${block?.generated?.repo || 'a repository'} at ${short(run.commit)}`, ...cells].join('\n\n').slice(0, 12000);
}
