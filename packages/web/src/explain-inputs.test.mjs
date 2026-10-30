// Explain-back resource inputs (EB-05): one link is the edge and the pill; source/scope dedup across ports; Group rules;
// the frozen EvidenceRefs pass D's contract (explain-back-contract.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { addInput, canonicalJson, describeSource, inputEvidence, inputPills, inputProblem, inputSubmission, scopeKey, snapshotHash } from './explain-inputs.js';
import { validateExplainBackAnswer } from './explain-back-contract.js';

const sha256 = async text => createHash('sha256').update(text).digest('hex');
const SHA = 'a'.repeat(64);
const card = { id: 'eb1', type: 'challenge', mode: 'explain_back', prompt: 'Why does the period not depend on amplitude?', dx: 0, dy: 0 };
const notebook = { id: 'nb1', type: 'notebook', notebook_id: 'n-1', active_path: 'notebook.ipynb', dx: 10, dy: 20, groupId: 'g1',
  ipynb: { cells: [{ id: 'c1', cell_type: 'code', source: 'T = 2*pi', outputs: [{ text: '6.28' }], execution_count: 1 }, { id: 'c2', cell_type: 'markdown', source: 'note', outputs: [] }] } };
const pdf = { id: 'pdf1', type: 'file', kind: 'pdf', groupId: 'g1', fileRef: { v: 1, family: 'pdf', source: { id: 'fs_000000000000000000000001', rev: SHA }, meta: { name: 'pendulum.pdf', title: 'Pendulum' } } };
const pdfCopy = { ...pdf, id: 'pdf2', groupId: undefined };
const uploading = { id: 'up1', type: 'file', kind: 'pdf', fileRef: { v: 1, family: 'pdf', source: null, meta: { name: 'draft.pdf' } } };
const model = { id: 'm1', type: 'file', kind: 'model', fileRef: { v: 1, family: 'mesh', source: { id: 'fs_x', rev: SHA }, meta: { name: 'arm.stl' } } };
const other = { id: 'eb2', type: 'challenge', mode: 'explain_back', prompt: 'Other', groupId: 'g2' };
const world = (over = {}) => ({
  board: 'board_1', blocks: [card, notebook, pdf, pdfCopy, uploading, model, other], exchanges: [], items: [{ id: 'i1', kind: 'text', text: 'hi', groupId: 'g2' }], shapes: [],
  groups: [{ id: 'g1', label: 'Forces' }, { id: 'g2', label: 'Mixed' }, { id: 'g3', label: 'Lonely' }], ...over,
});

test('one operation adds the semantic link; the same source and scope through the other port is the same input', () => {
  const w = world();
  const first = addInput(w, [], { id: 'L1', to: 'eb1', from: 'nb1', fromSide: 'top' });
  assert.equal(first.problem, null);
  assert.deepEqual(first.link, { id: 'L1', kind: 'explain-input', from: 'nb1', fromSide: 'top', to: 'eb1', toSide: 'input' });
  const again = addInput(w, first.links, { id: 'L2', to: 'eb1', from: 'nb1', fromSide: 'bottom' });
  assert.equal(again.duplicate, true);
  assert.equal(again.links.length, 1);
  assert.equal(again.link.id, 'L1');
  // A different scope is a different input; scope key order does not matter.
  const scoped = addInput(w, again.links, { id: 'L3', to: 'eb1', from: 'nb1', scope: { cells: ['c1'] } });
  assert.equal(scoped.links.length, 2);
  assert.equal(scopeKey({ b: 1, a: 2 }), scopeKey({ a: 2, b: 1 }));
  assert.equal(scopeKey({}), '');
});

test('self-reference, Explain-back sources, a Group holding the answer and too-small Groups are refused', () => {
  const w = world({ blocks: [{ ...card, groupId: 'g2' }, notebook, pdf, other], items: [] });
  assert.equal(inputProblem(w, [], { to: 'eb1', from: 'eb1' }), 'self');
  assert.equal(inputProblem(w, [], { to: 'eb1', from: 'eb2' }), 'unsupported');
  assert.equal(inputProblem(w, [], { to: 'eb1', from: 'g2' }), 'contains-target');
  assert.equal(inputProblem(w, [], { to: 'eb1', from: 'g3' }), 'group-empty');
  assert.equal(inputProblem(w, [], { to: 'nb1', from: 'pdf1' }), 'not-explain-back');
  assert.equal(inputProblem(w, [], { to: 'eb1', from: 'gone' }), 'missing');
  assert.equal(inputProblem(world(), [], { to: 'eb1', from: 'm1' }), 'unsupported');
  const full = Array.from({ length: 20 }, (_, i) => ({ id: `x${i}`, kind: 'explain-input', from: `s${i}`, to: 'eb1' }));
  assert.equal(inputProblem(world(), full, { to: 'eb1', from: 'nb1' }), 'too-many');
});

test('pills are derived from the links: one per link, a Group pill with its members, direct-plus-Group marked', () => {
  const w = world();
  const links = [
    { id: 'L1', kind: 'explain-input', from: 'g1', fromSide: 'bottom', to: 'eb1', toSide: 'input' },
    { id: 'L2', kind: 'explain-input', from: 'pdf1', fromSide: 'top', to: 'eb1', toSide: 'input', scope: { pages: [2] } },
    { id: 'L3', kind: 'explain-input', from: 'deleted', fromSide: 'top', to: 'eb1', toSide: 'input' },
    { id: 'L4', from: 'nb1', fromSide: 'bottom', to: 'eb1', toSide: 'top' }, // an ordinary connector is no pill
  ];
  const pills = inputPills(w, links, 'eb1');
  assert.equal(pills.length, 3);
  assert.deepEqual([pills[0].kind, pills[0].label, pills[0].count, pills[0].members.map(m => m.id)], ['group', 'Forces', 2, ['nb1', 'pdf1']]);
  assert.deepEqual(pills[1].viaGroups, ['g1']);
  assert.equal(pills[1].scopeLabel, 'page 2');
  assert.equal(pills[1].label, 'Pendulum');
  assert.deepEqual([pills[2].state, pills[2].problem], ['unavailable', 'missing']);
  // Removing the link is removing the pill: there is no second list to drift.
  assert.equal(inputPills(w, links.filter(link => link.id !== 'L2'), 'eb1').length, 2);
});

test('moving a card never changes its hash; editing a cell does', async () => {
  const moved = { ...notebook, dx: 400, dy: -3, groupId: 'other' };
  assert.equal(await snapshotHash(moved, null, sha256), await snapshotHash(notebook, null, sha256));
  const edited = { ...notebook, ipynb: { cells: [{ ...notebook.ipynb.cells[0], source: 'T = 3' }, notebook.ipynb.cells[1]] } };
  assert.notEqual(await snapshotHash(edited, null, sha256), await snapshotHash(notebook, null, sha256));
  // A scope to the unchanged cell keeps its hash through an edit of the other one.
  const onlyC2 = { cells: ['c2'] };
  assert.equal(await snapshotHash(edited, onlyC2, sha256), await snapshotHash(notebook, onlyC2, sha256));
  assert.equal(canonicalJson({ b: [1, { d: 1, c: undefined }], a: null }), '{"a":null,"b":[1,{"d":1}]}');
});

test('frozen EvidenceRefs pass the shared contract, deduplicated by source and scope with every link kept', async () => {
  const w = world();
  const links = [
    { id: 'L1', kind: 'explain-input', from: 'g1', fromSide: 'bottom', to: 'eb1', toSide: 'input' },
    { id: 'L2', kind: 'explain-input', from: 'nb1', fromSide: 'top', to: 'eb1', toSide: 'input', scope: { cells: ['c1'] } },
    { id: 'L3', kind: 'explain-input', from: 'pdf1', fromSide: 'top', to: 'eb1', toSide: 'input' },
    { id: 'L4', kind: 'explain-input', from: 'pdf2', fromSide: 'bottom', to: 'eb1', toSide: 'input' }, // same stored file
  ];
  const resources = await inputEvidence(w, links, 'eb1', { sha256 });
  assert.equal(resources.length, 3);
  const [group, nb, file] = resources;
  assert.deepEqual(group.members.map(m => [m.sourceKind, m.sourceId, m.media, m.state]), [['notebook', 'nb1', 'notebook', 'ready'], ['file', 'fs_000000000000000000000001', 'pdf', 'ready']]);
  assert.match(group.hash, /^[0-9a-f]{64}$/);
  assert.deepEqual(nb.locators, { cells: [{ id: 'c1', executed: true }] });
  assert.deepEqual([file.sourceKind, file.assetId, file.revision, file.hash], ['file', 'fs_000000000000000000000001', SHA, SHA]);
  assert.deepEqual(file.connection.links.map(via => via.linkId), ['L3', 'L4']);
  const answer = { v: 1, kind: 'explain_back', text: '', voice: [], resources, assistance: [] };
  assert.deepEqual(validateExplainBackAnswer(answer, { board: 'board_1', cardId: 'eb1' }).errors ?? [], []);
});

test('a source still uploading, a removed source and an oversize or self-holding Group freeze as not ready', async () => {
  const w = world({ blocks: [{ ...card, groupId: 'g2' }, uploading, other] });
  const refs = await inputEvidence(w, [
    { id: 'U', kind: 'explain-input', from: 'up1', fromSide: 'top', to: 'eb1' },
    { id: 'G', kind: 'explain-input', from: 'g2', fromSide: 'top', to: 'eb1' },
    { id: 'X', kind: 'explain-input', from: 'nope', fromSide: 'top', to: 'eb1' },
  ], 'eb1', { sha256 });
  assert.deepEqual(refs.map(ref => ref.state), ['uploading', 'unavailable', 'unavailable']);
  assert.ok(!refs[1].members.some(m => m.sourceId === 'eb1'), 'the answer itself is never a listed member');
  assert.deepEqual(refs[1].members.map(m => [m.sourceId, m.state]), [['eb2', 'unsupported'], ['i1', 'ready']]);
  assert.equal(describeSource(w, 'up1').state, 'uploading');
});

test('a submission sends a snapshot for every board-held input the resources name, and none for files', async () => {
  const w = world({ blocks: [card, notebook, pdf, { id: 'note1', type: 'explanation', title: 'Note', text: 'T = 2 pi sqrt(L/g)', groupId: 'g1' }] });
  const links = [
    { id: 'L1', kind: 'explain-input', from: 'g1', fromSide: 'bottom', to: 'eb1', toSide: 'input' },
    { id: 'L2', kind: 'explain-input', from: 'nb1', fromSide: 'top', to: 'eb1', toSide: 'input', scope: { cells: ['c1'] } },
    { id: 'L3', kind: 'explain-input', from: 'pdf1', fromSide: 'top', to: 'eb1', toSide: 'input' },
  ];
  const { resources, snapshots } = await inputSubmission(w, links, 'eb1', { sha256 });
  assert.deepEqual(resources, await inputEvidence(w, links, 'eb1', { sha256 }), 'the same resources inputEvidence gives');
  const hashes = await Promise.all(snapshots.map(snapshot => sha256(canonicalJson(snapshot))));
  // Group members nb1 (whole) and note1, and the scoped nb1 cells; the PDF (a stored file) sends none.
  const named = [...resources[0].members.filter(m => m.sourceKind !== 'file').map(m => m.hash), resources[1].hash];
  assert.deepEqual(hashes.sort(), named.sort());
  assert.deepEqual(snapshots.find(snapshot => snapshot.cells?.length === 1).cells.map(cell => cell.id), ['c1']);
});
