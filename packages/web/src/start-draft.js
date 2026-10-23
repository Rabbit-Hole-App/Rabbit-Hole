// The Start a rabbit hole source draft (docs/features/start-sources.md): one list of files, links and at most one
// repository, each with its own Use as context / Add to canvas choice. Pure, so node tests every rule; the dialog
// renders it (StartDialog.jsx) and the orchestrator drives it (start-run.js). No React, no fetch, no File reads:
// a row keeps a file's name, size and type, and the File object lives in the orchestrator's memory.
import { familyOf, formatBytes, BOARD_FILE_LIMIT } from './file-capabilities.js';
import { isPdf, takesContext } from './upload-destination.js';
import { ATTACHED_LIMIT } from './context-docs.js';
import { classifyLink } from './link-kind.js';

// Every string the owner wrote (brief 2026-10-23) lives here once, so the dialog and its tests cannot drift.
export const COPY = {
  title: 'Start a rabbit hole',
  subtitle: 'Add files, links or a repository. You can combine them.',
  addFiles: 'Add files',
  addLink: 'Add link',
  connectRepository: 'Connect repository',
  explainContext: 'Context lets Chat and Tutor use a source.',
  explainCanvas: 'Canvas shows it as a card in your workspace.',
  context: 'Use as context',
  canvas: 'Add to canvas',
  overview: 'Add overview to canvas',
  blank: 'Start with a blank canvas',
  start: 'Start rabbit hole',
  choose: 'Choose context, canvas, or both.',
  excluded: 'This source will not be added.',
  connectContext: 'Connect repository as context',
  fileLimit: 'Context takes PDF, text and Markdown files only.',
  remove: 'Remove',
  oneRepository: 'A rabbit hole can have one repository. Remove it to connect another.',
};

export const KINDS = ['file', 'link', 'repository'];
export const STATES = ['idle', 'checking', 'uploading', 'importing', 'ready', 'failed'];
// The only moves a row may make. ready is terminal; failed goes back to idle on retry, never straight to work.
const NEXT = {
  idle: ['checking', 'uploading', 'importing', 'ready', 'failed'],
  checking: ['checking', 'uploading', 'importing', 'ready', 'failed'],
  uploading: ['uploading', 'importing', 'ready', 'failed'],
  importing: ['importing', 'ready', 'failed'],
  ready: [],
  failed: ['idle'],
};
export const canMove = (from, to) => (NEXT[from] || []).includes(to);

export const CONTEXT_LIMIT = ATTACHED_LIMIT; // switched-on context documents per canvas (learn-context-docs.js)
export const STATUS_TEXT = { checking: 'Checking', uploading: 'Uploading', importing: 'Adding', ready: 'Ready' };

export { classifyLink };
const clean = (value) => String(value || '').trim();

// ---------------------------------------------------------------------------------------------------------------
// Files: the families the canvas imports (file-capabilities.js). A model's loose parts and its multi-file packages
// are chosen on the canvas, where their companions can be dropped together.

const WHOLE = new Set(['drop', 'media', 'pdf', 'import', 'doc']);
export function classifyFile(file) {
  const name = clean(file?.name);
  if (!name) return { ok: false, error: 'A file has no name.' };
  const family = familyOf({ name, type: file.type });
  if (!family || !WHOLE.has(family.route)) return { ok: false, error: `${name}: this kind of file is added from the canvas.` };
  if (!file.size) return { ok: false, error: `${name}: the file is empty.` };
  const limit = family.limits?.bytes || BOARD_FILE_LIMIT;
  if (file.size > limit) return { ok: false, error: `${name} is ${formatBytes(file.size)}; ${family.label} files up to ${formatBytes(limit)} can be added.` };
  return { ok: true, family: family.id, label: family.label };
}
export const fileKey = (file) => `file:${file.name}|${file.size}|${file.lastModified || 0}`;

// ---------------------------------------------------------------------------------------------------------------
// The draft.

export function createDraft() {
  return { rows: [], seq: 0, phase: 'editing', destination: null, notices: [], attempt: 0, error: '' };
}
const rowOf = (draft, id) => draft.rows.find((row) => row.id === id);
const repositoryRow = (draft) => draft.rows.find((row) => row.kind === 'repository');
const isFile = (row) => row.kind === 'file';

// What each option can do for a row. An unavailable option is shown disabled and greyed with its name, says why beside it, and
// counts as off (its stored choice is kept).
//  file: context only for what the context road keeps (PDF, .txt, .md/.markdown). A repository in the draft changes nothing:
//        its project chat reads context documents too (owner decisions 2026-10-23).
//  link: context is a note the server keeps about the link (learn-context-link.js), so it never depends on a card.
//  repository: context is connecting the project (its chat reads it); the overview card is the separate canvas choice.
export function capabilities(row) {
  if (row.kind === 'file') return { context: takesContext({ name: row.meta.name }), canvas: true };
  return { context: true, canvas: true };
}
export function effective(row, draft) {
  const can = capabilities(row, draft);
  return { context: row.context && can.context, canvas: row.canvas && can.canvas };
}
// What Chat gets from a row, said beside its context control so the dialog never claims more than the context holds.
const CONTEXT_NOTES = {
  arxiv: 'Chat gets the title and abstract.',
  wikipedia: 'Chat gets the article introduction.',
  youtube: 'Chat gets the video name and address only.',
  webpage: 'Chat gets the name and address only.',
};
export function contextNote(row) {
  if (row.kind === 'file') return capabilities(row).context ? '' : COPY.fileLimit;
  return row.kind === 'link' ? CONTEXT_NOTES[row.meta.type] || '' : '';
}
// A row with neither option on is left out of Start, and says so.
export const excluded = (row, draft) => row.status !== 'ready' && !row.needsFile && !effective(row, draft).context && !effective(row, draft).canvas;
// A row may be changed until it is ready, and not while a start is running.
export const editable = (row, draft) => draft.phase !== 'starting' && row.status !== 'ready';

// What a row still has to do: each destination it asks for that is not done yet. A repository's context is the
// connected project; its canvas is the overview card, which waits for the index (row.waiting).
export function needs(row, draft) {
  const on = effective(row, draft);
  return { context: on.context && !row.done.context, canvas: on.canvas && !row.done.canvas };
}
const settled = (row, draft) => { const n = needs(row, draft); return !n.context && !n.canvas; };

const withNotices = (draft, notices) => ({ ...draft, notices });
const addRows = (draft, made, notices) => {
  if (!made.length) return withNotices(draft, notices);
  let seq = draft.seq;
  const rows = made.map((row) => ({ id: `s${++seq}`, status: 'idle', reason: '', waiting: '', done: { context: false, canvas: false }, needsFile: false, ...row }));
  return { ...draft, seq, rows: [...draft.rows, ...rows], notices, error: '', phase: draft.phase === 'done' ? 'editing' : draft.phase };
};

export function reduce(draft, action) {
  const starting = draft.phase === 'starting';
  switch (action.type) {
    case 'add-files': {
      if (starting) return draft;
      const notices = [], made = [];
      let rows = draft.rows;
      for (const file of action.files) {
        const key = fileKey(file);
        const lost = rows.find((row) => row.key === key && row.needsFile);
        if (lost) { rows = rows.map((row) => (row === lost ? { ...row, needsFile: false, status: 'idle', reason: '' } : row)); continue; }
        if (rows.some((row) => row.key === key) || made.some((row) => row.key === key)) { notices.push(`${file.name} is already in the list.`); continue; }
        const checked = classifyFile(file);
        if (!checked.ok) { notices.push(checked.error); continue; }
        made.push({ kind: 'file', key, label: file.name, detail: `${checked.label}, ${formatBytes(file.size)}`, context: takesContext(file), canvas: true,
          meta: { name: file.name, size: file.size, type: file.type || '', lastModified: file.lastModified || 0, family: checked.family, pdf: isPdf(file) } });
      }
      return addRows({ ...draft, rows }, made, notices);
    }
    case 'add-link': {
      if (starting) return draft;
      const link = classifyLink(action.text);
      if (!link.ok) return withNotices(draft, [link.error]);
      if (draft.rows.some((row) => row.key === link.key)) return withNotices(draft, ['That link is already in the list.']);
      return addRows(draft, [{ kind: 'link', key: link.key, label: link.label, detail: link.detail, context: true, canvas: true,
        meta: { url: link.url, type: link.type, id: link.id } }], []);
    }
    case 'add-repository': {
      if (starting) return draft;
      if (repositoryRow(draft)) return withNotices(draft, [COPY.oneRepository]);
      if (draft.destination && draft.destination.kind !== 'repository') return withNotices(draft, ['A canvas was already created for this start. Start a new rabbit hole to connect a repository.']);
      const { url, repo, branch, existing = null, connect = null } = action;
      return addRows(draft, [{ kind: 'repository', key: 'repository', label: repo, detail: `${branch}, public GitHub${existing ? ', already connected' : ''}`, context: true, canvas: false,
        meta: { url, repo, branch, existing, connect } }], []);
    }
    case 'remove': {
      const row = rowOf(draft, action.id);
      if (!row || !editable(row, draft)) return draft;
      return { ...draft, rows: draft.rows.filter((r) => r !== row), notices: [] };
    }
    case 'set-option': {
      const row = rowOf(draft, action.id);
      if (!row || !editable(row, draft) || !['context', 'canvas'].includes(action.option)) return draft;
      if (!capabilities(row, draft)[action.option]) return draft;
      return { ...draft, notices: [], rows: draft.rows.map((r) => (r === row ? { ...r, [action.option]: !!action.value } : r)) };
    }
    case 'dismiss-notices': return draft.notices.length ? withNotices(draft, []) : draft;
    case 'begin': {
      if (starting || !canStart(draft)) return draft;
      // Rows with neither option are left out here; failed rows start over from what is already done.
      const rows = draft.rows.filter((row) => !excluded(row, draft)).map((row) => (row.status === 'failed' && !row.needsFile ? { ...row, status: 'idle', reason: '' } : row));
      return { ...draft, rows, phase: 'starting', attempt: draft.attempt + 1, error: '', notices: [] };
    }
    case 'destination': {
      // Created once per draft: a second report is a retry reaching the same one and changes nothing.
      if (draft.destination) return draft;
      return { ...draft, destination: { kind: action.kind, slug: action.slug, existing: !!action.existing } };
    }
    case 'row': {
      const row = rowOf(draft, action.id);
      if (!row) return draft;
      const done = { ...row.done, ...(action.done || {}) };
      const next = { ...row, done, ...(action.meta ? { meta: { ...row.meta, ...action.meta } } : {}), ...(action.label ? { label: action.label } : {}), ...(action.detail ? { detail: action.detail } : {}), ...('waiting' in action ? { waiting: action.waiting } : {}) };
      if (action.status && action.status !== row.status) {
        if (!canMove(row.status, action.status)) return draft;
        if (action.status === 'ready' && !settled(next, draft)) return draft;
        next.status = action.status;
      }
      if (next.status === 'failed') next.reason = action.reason || row.reason || 'This could not be added.';
      else if (action.status || 'reason' in action) next.reason = action.reason || '';
      if (next.status === 'ready') next.waiting = '';
      return { ...draft, rows: draft.rows.map((r) => (r === row ? next : r)) };
    }
    case 'lock': return starting ? draft : { ...draft, phase: 'starting', error: '', notices: [] };
    case 'finish': {
      const all = draft.rows.length > 0 && draft.rows.every((row) => row.status === 'ready');
      const anyFailed = draft.rows.some((row) => row.status === 'failed');
      return { ...draft, phase: all ? 'done' : anyFailed ? 'partial' : 'editing', error: action.error || '' };
    }
    default: return draft;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Validation, summary, plans.

// Anything that stops Start: a file lost to a reload asks for the file again, and more than ten files as context. A row with
// neither option is not a problem: it is left out (excluded) and says so.
export function problems(draft) {
  const list = [];
  for (const row of draft.rows) {
    if (row.status !== 'ready' && row.needsFile) list.push({ id: row.id, code: 'file-needed', message: 'Add this file again.' });
  }
  const contextFiles = draft.rows.filter((row) => isFile(row) && effective(row, draft).context).length;
  if (contextFiles > CONTEXT_LIMIT) list.push({ id: null, code: 'context-limit', message: `Up to ${CONTEXT_LIMIT} files can be used as context. Turn some off or remove them.` });
  return list;
}
export const problemOf = (draft, id) => problems(draft).find((p) => p.id === id) || null;

export const canStart = (draft) => draft.phase !== 'starting' && problems(draft).length === 0
  && draft.rows.some((row) => row.status !== 'ready' && !excluded(row, draft));
// The blank shortcut needs no sources and is always there, except while a start is running.
export const canBlank = (draft) => draft.phase !== 'starting';

// Counts for the line above the footer: sources the chat can use, cards the canvas will show. A repository's one
// card is its overview, never a card per file.
export function summary(draft) {
  let context = 0, cards = 0;
  for (const row of draft.rows) {
    const on = effective(row, draft);
    if (on.context) context += 1;
    if (on.canvas) cards += 1;
  }
  return { context, cards, sources: draft.rows.length };
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export function summaryText(draft) {
  if (!draft.rows.length) return 'No sources added.';
  const s = summary(draft), left = draft.rows.filter((row) => excluded(row, draft)).length;
  return `${plural(s.context, 'context source', 'context sources')}, ${plural(s.cards, 'canvas card', 'canvas cards')}${left ? `, ${left} not added` : ''}`;
}

// What the status line of a row says: the state, a reason when it failed, the index wait for an overview card.
export function statusText(row) {
  if (row.status === 'failed') return row.reason || 'Failed';
  if (row.status === 'idle') return row.kind === 'link' && row.meta.type === 'webpage' ? 'Will be resolved when you start' : '';
  if (row.status === 'importing' && row.waiting === 'index') return 'Waiting for the index';
  return STATUS_TEXT[row.status] || '';
}

// One destination for the whole batch: a repository's project when the draft has one, else one canvas. A repository
// already connected is opened, and the other sources attach to its Main board.
export const destinationKind = (draft) => draft.destination?.kind || (repositoryRow(draft) ? 'repository' : 'canvas');

// Work in order: the repository first (it creates the destination), then files, then links. Settled rows are left
// out, so the same call plans the first run and every retry: a done destination is never done twice. Each step
// lists only what is still missing, and a failed row is planned again from where it stopped.
export function planStart(draft) {
  const order = { repository: 0, file: 1, link: 2 };
  const steps = draft.rows
    .filter((row) => row.status !== 'ready' && !row.needsFile)
    .map((row) => ({ id: row.id, kind: row.kind, needs: needs(row, draft) }))
    .filter((step) => step.needs.context || step.needs.canvas)
    .sort((a, b) => order[a.kind] - order[b.kind]);
  const kind = destinationKind(draft);
  const existing = repositoryRow(draft)?.meta.existing || null;
  return {
    destination: { kind, create: !draft.destination && !existing, slug: draft.destination?.slug || existing?.slug || null },
    steps,
    // rows whose options are all settled but never marked ready (an option was unchecked after a failure)
    complete: draft.rows.filter((row) => row.status !== 'ready' && !row.needsFile && settled(row, draft)).map((row) => row.id),
  };
}
// Blank never imports the listed sources, and never makes a second canvas when a failed start already made one.
export const blankPlan = (draft) => ({ create: !draft.destination, slug: draft.destination?.slug || null, kind: draft.destination?.kind || 'canvas' });

// ---------------------------------------------------------------------------------------------------------------
// Reload recovery. The list survives a reload of the tab (sessionStorage); a File does not, so a file that was not
// finished is listed as needing to be added again. Work that was running when the page went away is failed, with
// the reason, and retries from what is already done.

const KEY = 'small.start.draft';
const VERSION = 1;
export function serialize(draft) {
  return JSON.stringify({ v: VERSION, draft });
}
export function restore(text) {
  let data;
  try { data = JSON.parse(text); } catch { return null; }
  if (!data || data.v !== VERSION || !data.draft || !Array.isArray(data.draft.rows)) return null;
  const draft = data.draft;
  const phase = draft.phase === 'starting' ? 'partial' : draft.phase;
  const base = { ...draft, phase, notices: [] };
  const rows = draft.rows.map((row) => {
    if (row.status === 'ready') return row;
    const running = ['checking', 'uploading', 'importing'].includes(row.status);
    // The File object is gone: a file with work left must be chosen again before it can run.
    if (isFile(row) && !settled(row, base)) return { ...row, needsFile: true, status: 'failed', reason: 'Add this file again.', waiting: '' };
    if (running) return { ...row, status: 'failed', reason: 'Interrupted by a reload. Retry to continue.', waiting: '' };
    return row;
  });
  return { ...base, rows };
}
// An empty draft with nothing created is not worth remembering. Storage can be missing, full or blocked (private
// windows): the result says so, the dialog keeps working without it, and nothing here throws.
const store = (storage) => { try { return storage || globalThis.sessionStorage || null; } catch { return null; } };
export function saveDraft(draft, storage) {
  const s = store(storage);
  if (!s) return { ok: false };
  try {
    if (!draft.rows.length && !draft.destination) s.removeItem(KEY);
    else s.setItem(KEY, serialize(draft));
    return { ok: true };
  } catch { return { ok: false }; }
}
export function loadDraft(storage) {
  const s = store(storage);
  try { return s ? restore(s.getItem(KEY)) : null; } catch { return null; }
}
export function clearDraft(storage) {
  const s = store(storage);
  try { s?.removeItem(KEY); } catch { /* nothing to forget */ }
}
