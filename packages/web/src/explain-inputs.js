// Explain-back resource inputs (plan 2026-10-30-explain-back.md section 4, EB-05): which canvas sources may feed a card's
// green Input, the one link record that is both the edge and the pill, and the EvidenceRefs (explain-back-contract.js)
// a submission freezes from it. Pure, so the canvas, the Node tests and the control plane's resolver share it.
//
// The relationship is a canvas link { id, kind: 'explain-input', from: sourceId, fromSide: 'top'|'bottom', to: cardId,
// toSide: 'input', scope }: undo, save, delete and reload treat it like any link, and pills are derived from it, never
// stored apart. `world` is { blocks, groups, exchanges, items, shapes, board }: the canvas as it is now.
import { isExplainBackCard as isExplainBack } from './explain-back-private.js';

export const INPUT_LINK = 'explain-input';
export const INPUT_SIDE = 'input';
export const isInputLink = link => link?.kind === INPUT_LINK;
// Every challenge block is a Practice card with an Input (owner 2026-10-30): explain-back-private.js holds the one test.
export { isExplainBack };
export const GROUP_MEMBER_LIMIT = 30; // ANSWER_LIMITS.groupMembers
export const INPUT_LIMIT = 20; // ANSWER_LIMITS.evidence, shared with voice and sketch: the server refuses past it

export const INPUT_PROBLEMS = {
  'not-explain-back': 'Only a Practice card has an Input.',
  self: 'An answer cannot be its own input.',
  missing: 'That source is no longer on the canvas.',
  unsupported: 'This kind of card cannot be an input yet.',
  'group-empty': 'A Group needs at least two items to be an input.',
  'group-too-large': `A Group input can hold at most ${GROUP_MEMBER_LIMIT} items.`,
  'contains-target': 'This Group contains the answer itself, so it cannot be its input.',
  'too-many': `An answer can have at most ${INPUT_LIMIT} inputs.`,
  'read-only': 'This canvas is view only.',
};

// File families (file-capabilities.js) to contract media; anything else (3D, CAD) is not read as evidence yet.
const FAMILY_MEDIA = {
  pdf: 'pdf', image: 'image', gif: 'image', svg: 'image', video: 'video', audio: 'audio', text: 'document', markdown: 'document',
  word: 'document', 'word-legacy': 'document', presentation: 'document', notebook: 'notebook', python: 'code', code: 'code',
  delimited: 'data', workbook: 'data',
};
const BLOCK_MEDIA = { notebook: 'notebook', code: 'code', snippet: 'code', 'repo-code': 'code', webpage: 'web', table: 'data', image: 'image', video: 'video' };

export const membersOf = (world, groupId) => ['blocks', 'exchanges', 'items', 'shapes']
  .flatMap(key => (world[key] || []).filter(entry => entry.groupId === groupId));

// What a canvas id is, as an input source: { sourceKind, media, assetId, revision?, hash?, state, entry }.
export function describeSource(world, id) {
  const group = (world.groups || []).find(entry => entry.id === id);
  if (group) return { sourceKind: 'group', media: 'group', assetId: id, state: membersOf(world, id).length >= 2 ? 'ready' : 'unavailable', entry: group };
  const block = (world.blocks || []).find(entry => entry.id === id);
  if (block) {
    if (isExplainBack(block)) return { sourceKind: 'card', media: 'card', assetId: id, state: 'unsupported', entry: block };
    const ref = block.fileRef;
    if (ref) {
      const media = FAMILY_MEDIA[ref.family];
      if (!media) return { sourceKind: 'file', media: 'card', assetId: ref.source?.id || id, state: 'unsupported', entry: block };
      // A stored source is immutable: its id and sha256 (rev) are the revision and the hash. Still uploading: not ready.
      return ref.source?.id
        ? { sourceKind: 'file', media, assetId: ref.source.id, revision: ref.source.rev, hash: ref.source.rev, state: 'ready', entry: block }
        : { sourceKind: 'file', media, assetId: id, state: 'uploading', entry: block };
    }
    if (block.type === 'notebook') return { sourceKind: 'notebook', media: 'notebook', assetId: id, state: 'ready', entry: block };
    return { sourceKind: 'card', media: BLOCK_MEDIA[block.type] || 'card', assetId: id, state: 'ready', entry: block };
  }
  const chat = (world.exchanges || []).find(entry => entry.id === id);
  if (chat) return { sourceKind: 'card', media: 'card', assetId: id, state: 'ready', entry: chat };
  const mark = [...(world.items || []), ...(world.shapes || [])].find(entry => entry.id === id);
  if (mark) return { sourceKind: 'mark', media: 'card', assetId: id, state: String(mark.text || mark.label || '').trim() ? 'ready' : 'unsupported', entry: mark };
  return null;
}

// Selected part of a source: { pages: [2, 3] }, { cells: ['c1'] }, null for the whole. Order and key order never matter.
export const scopeKey = scope => (scope && Object.keys(scope).length ? canonicalJson(scope) : '');

// Why `from` cannot feed `to`'s Input, or null. Self-reference and cycles: an Explain-back card is never a source (its
// answer is not reference material), and a Group holding the target is refused, so no input chain can loop back.
export function inputProblem(world, links, { to, from }) {
  const target = (world.blocks || []).find(entry => entry.id === to);
  if (!isExplainBack(target)) return 'not-explain-back';
  if (from === to) return 'self';
  const source = describeSource(world, from);
  if (!source) return 'missing';
  if (source.sourceKind === 'group') {
    const members = membersOf(world, from);
    if (members.some(member => member.id === to)) return 'contains-target';
    if (members.length < 2) return 'group-empty';
    if (members.length > GROUP_MEMBER_LIMIT) return 'group-too-large';
  } else if (source.state === 'unsupported') return 'unsupported';
  if (links.filter(link => isInputLink(link) && link.to === to).length >= INPUT_LIMIT) return 'too-many';
  return null;
}

// The one operation picker, drag and click-click all call. Returns { links, link, duplicate, problem }: a source already
// connected with the same scope (through either port) is that existing link, never a second one.
export function addInput(world, links, { id, to, from, fromSide = 'bottom', scope = null }) {
  const key = scopeKey(scope);
  const duplicate = links.find(link => isInputLink(link) && link.to === to && link.from === from && scopeKey(link.scope) === key);
  if (duplicate) return { links, link: duplicate, duplicate: true, problem: null };
  const problem = inputProblem(world, links, { to, from });
  if (problem) return { links, link: null, duplicate: false, problem };
  const link = { id, kind: INPUT_LINK, from, fromSide, to, toSide: INPUT_SIDE, ...(key ? { scope } : {}) };
  return { links: [...links, link], link, duplicate: false, problem: null };
}

const nameOfEntry = entry => entry?.label || entry?.title || entry?.fileRef?.meta?.title || entry?.fileRef?.meta?.name || entry?.question || entry?.text || entry?.type || 'Item';
const scopeText = scope => (scope?.pages ? `${scope.pages.length === 1 ? 'page' : 'pages'} ${scope.pages.join(', ')}`
  : scope?.cells ? `${scope.cells.length} ${scope.cells.length === 1 ? 'cell' : 'cells'}` : null);

// The pills for card `to`, in connection order: what U renders under the answer field. One per link; a Group is one pill
// with its members. A direct source that is also in a connected Group says so (viaGroups); the resolver reads it once.
export function inputPills(world, links, to, nameOf = nameOfEntry) {
  const mine = links.filter(link => isInputLink(link) && link.to === to);
  const grouped = new Map();
  for (const link of mine) {
    const source = describeSource(world, link.from);
    if (source?.sourceKind === 'group') for (const member of membersOf(world, link.from)) grouped.set(member.id, [...(grouped.get(member.id) || []), link.from]);
  }
  return mine.map(link => {
    const source = describeSource(world, link.from);
    if (!source) return { linkId: link.id, sourceId: link.from, port: link.fromSide, kind: 'missing', media: 'card', label: 'Removed source', state: 'unavailable', problem: 'missing', scope: link.scope || null };
    const pill = { linkId: link.id, sourceId: link.from, port: link.fromSide, kind: source.sourceKind === 'group' ? 'group' : 'source', media: source.media,
      label: source.sourceKind === 'group' ? (source.entry.label || 'Group') : nameOf(source.entry), scope: link.scope || null, scopeLabel: scopeText(link.scope), state: source.state };
    if (source.sourceKind === 'group') {
      const members = membersOf(world, link.from);
      pill.count = members.length;
      pill.members = members.map(member => { const it = describeSource(world, member.id); return { id: member.id, label: nameOf(member), media: it.media, state: it.state }; });
      if (members.some(member => member.id === to)) Object.assign(pill, { state: 'unavailable', problem: 'contains-target' });
      else if (members.length < 2) pill.problem = 'group-empty';
      else if (members.length > GROUP_MEMBER_LIMIT) Object.assign(pill, { state: 'unavailable', problem: 'group-too-large' });
    } else if (grouped.has(link.from)) pill.viaGroups = grouped.get(link.from);
    return pill;
  });
}

// ---- freezing: the content a board-held source had, hashed the same way here and on the server --------------------------
const LAYOUT = new Set(['dx', 'dy', 'x', 'y', 'w', 'h', 'x1', 'y1', 'x2', 'y2', 'space', 'cardLayout', 'groupId', 'fresh', 'grading', 'sketchOpen', 'home', 'z']);
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(entry => (entry === undefined ? 'null' : canonicalJson(entry))).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}
// What of a board-held source is evidence: a Notebook's (selected) cells with their saved outputs, else the card's content
// without its position or size, so moving a card never changes its hash.
export function snapshotOf(entry, scope = null) {
  if (entry?.type === 'notebook') {
    const cells = (entry.ipynb?.cells || []).filter(cell => !scope?.cells || scope.cells.includes(cell.id));
    return { notebook: entry.notebook_id || entry.id, path: entry.active_path || null, cells: cells.map(cell => ({ id: cell.id, type: cell.cell_type, source: Array.isArray(cell.source) ? cell.source.join('') : String(cell.source ?? ''), outputs: cell.outputs || [], executionCount: cell.execution_count ?? null })) };
  }
  // An inline data: image is dropped from the saved board past 120 KB (canvas-persist.js lightBlocks): never part of the hash.
  return Object.fromEntries(Object.entries(entry || {}).filter(([key, value]) => !LAYOUT.has(key) && !(key === 'src' && typeof value === 'string' && value.startsWith('data:'))));
}
const subtleSha = async text => [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
export const snapshotHash = (entry, scope, sha256 = subtleSha) => sha256(canonicalJson(snapshotOf(entry, scope)));

// Where in a source the selection lies, for citations: Notebook cells, PDF pages.
const locatorsOf = (entry, scope) => (entry?.type === 'notebook'
  ? { cells: snapshotOf(entry, scope).cells.map(cell => ({ id: cell.id, executed: cell.executionCount != null })) }
  : scope?.pages ? { pages: scope.pages } : null);

async function frozen(world, id, scope, sha256) {
  const source = describeSource(world, id);
  if (!source) return { sourceKind: 'card', media: 'card', assetId: id, revision: 0, state: 'unavailable' };
  if (source.sourceKind === 'file' || source.state !== 'ready') return { ...source, revision: source.revision ?? 0 };
  const hash = await snapshotHash(source.entry, scope, sha256);
  return { ...source, revision: hash, hash };
}

// The EvidenceRefs (role 'resource') card `to`'s links freeze at submission, in link order, deduplicated by source and
// scope (two cards of one stored file are one input); every link it came through stays in connection.links.
export async function inputEvidence(world, links, to, { sha256 = subtleSha } = {}) {
  const refs = [], byKey = new Map();
  for (const link of links.filter(entry => isInputLink(entry) && entry.to === to)) {
    const scope = link.scope || null;
    const it = await frozen(world, link.from, scope, sha256);
    const via = { linkId: link.id, port: link.fromSide, sourceId: link.from };
    const key = `${it.sourceKind}:${it.assetId}:${scopeKey(scope)}`;
    if (byKey.has(key)) { byKey.get(key).connection.links.push(via); continue; }
    const ref = { evidenceId: `ev_${link.id}`, role: 'resource', media: it.media, state: it.state, sourceKind: it.sourceKind, assetId: it.assetId, revision: it.revision,
      ...(it.hash ? { hash: it.hash } : {}), ...(world.board ? { board: world.board } : {}), label: String(nameOfEntry(it.entry) || '').slice(0, 200),
      ...(scope ? { scope } : {}), ...(locatorsOf(it.entry, scope) ? { locators: locatorsOf(it.entry, scope) } : {}), connection: { port: link.fromSide, linkId: link.id, links: [via] } };
    if (it.sourceKind === 'group') {
      const all = membersOf(world, link.from);
      ref.members = [];
      // The answer itself is never listed (the server would refuse it as self_reference); the Group is then unavailable.
      for (const member of all.filter(entry => entry.id !== to).slice(0, GROUP_MEMBER_LIMIT)) {
        const m = await frozen(world, member.id, null, sha256);
        ref.members.push({ sourceKind: m.sourceKind, sourceId: m.assetId, revision: m.revision, ...(world.board ? { board: world.board } : {}), ...(m.hash ? { hash: m.hash } : {}), media: m.media, state: m.state });
      }
      // The membership itself is the Group's revision: a later add, remove or edit is a different input.
      ref.revision = ref.hash = await sha256(canonicalJson(ref.members.map(m => [m.sourceKind, m.sourceId, m.revision])));
      if (all.length < 2 || all.length > GROUP_MEMBER_LIMIT || all.some(member => member.id === to)) ref.state = 'unavailable';
    }
    byKey.set(key, ref);
    refs.push(ref);
  }
  return refs;
}

// What a submission sends for its inputs (control-plane learn-attempt-assets.js freezeSnapshots): the `resources` above and
// `snapshots`, the content of each board-held input (a card, note or Notebook selection, direct or a Group member) whose hash
// the resources name, so the server keeps that copy privately as submitted. Files are immutable stored sources and send none.
// Bounded like the server (SNAPSHOT_LIMITS): at most 50 snapshots and 1 MiB; one past either is left out and is then read from
// the saved board only while it is unchanged.
export const SNAPSHOT_LIMITS = Object.freeze({ count: 50, totalChars: 1024 * 1024 });
export async function inputSubmission(world, links, to, { sha256 = subtleSha } = {}) {
  const resources = await inputEvidence(world, links, to, { sha256 });
  const snapshots = [], kept = new Set();
  let chars = 0;
  const keep = async (id, scope, hash) => {
    if (!hash || kept.has(hash) || snapshots.length >= SNAPSHOT_LIMITS.count) return;
    const source = describeSource(world, id);
    if (!source || source.sourceKind === 'file' || source.sourceKind === 'group') return;
    const snapshot = snapshotOf(source.entry, scope);
    const text = canonicalJson(snapshot);
    if (chars + text.length > SNAPSHOT_LIMITS.totalChars || await sha256(text) !== hash) return;
    chars += text.length;
    kept.add(hash);
    snapshots.push(snapshot);
  };
  for (const ref of resources) {
    if (ref.state !== 'ready') continue;
    if (ref.members) { for (const m of ref.members) if (m.state === 'ready') await keep(m.sourceId, null, m.hash); }
    else await keep(ref.assetId, ref.scope || null, ref.hash);
  }
  return { resources, snapshots };
}
