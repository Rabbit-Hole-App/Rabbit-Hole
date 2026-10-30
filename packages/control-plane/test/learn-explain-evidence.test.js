// The frozen Explain-back resource resolver (EB-05.3): authorized excerpts with locators at the submitted revision, pinned
// derivatives, one coverage entry per input and Group member, direct-plus-Group dedup with provenance, honest unavailability.
import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceParts, resolveExplainEvidence } from '../src/learn-explain-evidence.js';
import { EB_SHAPES, validateExplainBackAnswer } from '../../web/src/explain-back-contract.js';
import { validateShape } from '../../web/src/learn-coaching-contract.js';
import { DERIVATIVE, PDF_SOURCE, explainEvidenceFixture, fixtureDeps } from './learn-explain-evidence-fixture.js';

const byId = coverage => Object.fromEntries(coverage.map(c => [c.memberId ? `${c.evidenceId}/${c.memberId}` : c.evidenceId, c]));

test('the fixture answer is a valid EB-01 answer', async () => {
  const { answer } = await explainEvidenceFixture();
  assert.deepEqual(validateExplainBackAnswer(answer, { board: 'main', cardId: 'card_eb' }).errors, []);
  assert.deepEqual(answer.resources.map(r => [r.evidenceId, r.media]), [['ev_L_group', 'group'], ['ev_L_pdf', 'pdf'], ['ev_L_pdf_all', 'pdf'], ['ev_L_cells', 'notebook'], ['ev_L_note', 'card']]);
});

test('every input and Group member is read at its submitted revision, the duplicate once, with provenance', async () => {
  const { env, actor, attempt, answer, deps } = await explainEvidenceFixture();
  const { items, coverage } = await resolveExplainEvidence(env, actor, attempt, answer.resources, deps);
  for (const entry of coverage) assert.deepEqual(validateShape(EB_SHAPES, 'CoverageEntry', entry), [], JSON.stringify(entry));
  const c = byId(coverage);
  assert.deepEqual(Object.keys(c), ['ev_L_group', 'ev_L_group/nb_pendulum', `ev_L_group/${PDF_SOURCE}`, 'ev_L_pdf', 'ev_L_pdf_all', 'ev_L_cells', 'ev_L_note']);
  assert.equal(c.ev_L_group.status, 'read');
  assert.deepEqual(c.ev_L_group.inspected, { members: 2, read: 2, partial: 0 });
  // The derivative read is pinned in coverage, so a reassessment reads the same extraction.
  assert.deepEqual(c[`ev_L_group/${PDF_SOURCE}`].derivative, DERIVATIVE);
  // The whole PDF connected directly is the Group's member: read once, its entry says so, the item keeps both connections.
  assert.deepEqual([c.ev_L_pdf_all.status, c.ev_L_pdf_all.note], ['read', `same_as:ev_L_group/${PDF_SOURCE}`]);
  const pdfItem = items.find(item => item.sourceId === PDF_SOURCE && !item.scope);
  assert.deepEqual(pdfItem.provenance, [{ evidenceId: 'ev_L_group', memberId: PDF_SOURCE }, { evidenceId: 'ev_L_pdf_all' }]);
  // A page scope reads only that page, with its locator.
  const page = items.find(item => item.evidenceId === 'ev_L_pdf');
  assert.deepEqual(page.excerpts.map(e => [e.locator, e.label]), [[{ page: 2 }, 'p. 2']]);
  assert.match(page.excerpts[0].text, /independent of amplitude/);
  // Selected Notebook cells: source and saved output, never run; the unselected cell is not read.
  const cells = items.find(item => item.evidenceId === 'ev_L_cells');
  assert.deepEqual(cells.excerpts.map(e => e.locator), [{ cell: 'c1' }, { cell: 'c2' }]);
  assert.match(cells.excerpts[0].text, /saved output from run 3[\s\S]*\[output\] 2\.006/);
  assert.deepEqual(c.ev_L_cells.inspected.cells, [{ id: 'c1', executed: true }, { id: 'c2', executed: false }]);
  assert.equal(c.ev_L_cells.inspected.codeRun, false);
  assert.match(items.find(item => item.evidenceId === 'ev_L_note').excerpts[0].text, /Longer string, longer period/);
  assert.equal(items.length, 5, 'group notebook, group pdf, pdf page 2, notebook cells, note');
});

test('a source edited after submission is unavailable, never its newer content', async () => {
  const { env, actor, attempt, answer, state } = await explainEvidenceFixture();
  const edited = structuredClone(state);
  edited.blocks.find(b => b.id === 'nb_pendulum').ipynb.cells[0].source = 'print("changed")';
  edited.blocks.find(b => b.id === 'note_1').dx = 900; // a move is not an edit
  const { coverage, items } = await resolveExplainEvidence(env, actor, attempt, answer.resources, fixtureDeps(edited));
  const c = byId(coverage);
  assert.deepEqual([c['ev_L_group/nb_pendulum'].status, c['ev_L_group/nb_pendulum'].note], ['unavailable', 'source_changed']);
  assert.deepEqual([c.ev_L_cells.status, c.ev_L_cells.note], ['unavailable', 'source_changed']);
  assert.equal(c.ev_L_group.status, 'partial');
  assert.equal(c.ev_L_note.status, 'read');
  assert.ok(!items.some(item => item.excerpts.some(e => /changed/.test(e.text))));
});

test('a frozen copy, when the store kept one, is read instead of the live board', async () => {
  const { env, actor, attempt, answer, state } = await explainEvidenceFixture();
  const original = structuredClone(state.blocks.find(b => b.id === 'note_1'));
  const edited = structuredClone(state);
  edited.blocks.find(b => b.id === 'note_1').text = 'Rewritten later.';
  const { snapshotOf } = await import('../../web/src/explain-inputs.js');
  const readFrozenSnapshot = async (e, a, t, src) => (src.sourceId === 'note_1' ? { snapshot: snapshotOf(original) } : null);
  const { coverage, items } = await resolveExplainEvidence(env, actor, attempt, answer.resources, fixtureDeps(edited, { readFrozenSnapshot }));
  assert.equal(byId(coverage).ev_L_note.status, 'read');
  assert.match(items.find(item => item.evidenceId === 'ev_L_note').excerpts[0].text, /Longer string/);
});

test('unauthorized, revoked, cross-board, pinned-gone, processing and over-budget inputs say exactly that', async () => {
  const { env, actor, attempt, answer, state } = await explainEvidenceFixture();
  // Access revoked: the board no longer references the file.
  let c = byId((await resolveExplainEvidence(env, actor, attempt, answer.resources, fixtureDeps(state, { authorizeFile: async () => null }))).coverage);
  assert.deepEqual([c.ev_L_pdf.status, c.ev_L_pdf.note], ['unavailable', 'not_authorized_or_gone']);
  // No board for this actor (another learner, another canvas): nothing board-held or file-backed is read.
  c = byId((await resolveExplainEvidence(env, { ...actor, board: 'other' }, attempt, answer.resources, fixtureDeps(state))).coverage);
  assert.ok(Object.values(c).every(entry => entry.status !== 'read'), JSON.stringify(c));
  assert.equal(c.ev_L_note.note, 'cross_scope_evidence');
  // A pinned derivative that is gone is not replaced by a newer one.
  const pinned = answer.resources.map(r => (r.evidenceId === 'ev_L_pdf' ? { ...r, derivative: { ...DERIVATIVE, derivativeId: 'fd_old' } } : r));
  c = byId((await resolveExplainEvidence(env, actor, attempt, pinned, fixtureDeps(state))).coverage);
  assert.deepEqual([c.ev_L_pdf.status, c.ev_L_pdf.note], ['unavailable', 'pinned_derivative_gone']);
  // Extraction still running: processing; none at all: unsupported.
  c = byId((await resolveExplainEvidence(env, actor, attempt, answer.resources, fixtureDeps(state, { findDerivative: async () => null, conversionPending: async () => true }))).coverage);
  assert.equal(c.ev_L_pdf.status, 'processing');
  c = byId((await resolveExplainEvidence(env, actor, attempt, answer.resources, fixtureDeps(state, { findDerivative: async () => null }))).coverage);
  assert.equal(c.ev_L_pdf.status, 'unsupported');
  // A tiny budget cuts the excerpts: partial, then over budget.
  c = byId((await resolveExplainEvidence(env, actor, attempt, answer.resources, fixtureDeps(state), { limits: { perInput: 40, total: 60, imageBytes: 0 } })).coverage);
  assert.equal(c['ev_L_group/nb_pendulum'].status, 'partial');
  assert.equal(c.ev_L_note.status, 'unavailable');
  assert.equal(c.ev_L_note.note, 'over_budget');
});

test('not-ready evidence is never read: uploading is processing, unsupported stays unsupported', async () => {
  const { env, actor, attempt, answer, deps } = await explainEvidenceFixture();
  const refs = [{ ...answer.resources[1], state: 'uploading' }, { ...answer.resources[4], state: 'unsupported' }];
  const { coverage, items } = await resolveExplainEvidence(env, actor, attempt, refs, deps);
  assert.deepEqual(coverage.map(c => c.status), ['processing', 'unsupported']);
  assert.equal(items.length, 0);
});

test('evidence parts: one quotable field per source, labelled locators, the duplicate named', async () => {
  const { env, actor, attempt, answer, deps } = await explainEvidenceFixture();
  const { parts, fields, blocks } = evidenceParts(await resolveExplainEvidence(env, actor, attempt, answer.resources, deps));
  assert.equal(parts.length, 5);
  assert.equal(blocks.length, 0);
  const pdf = parts.find(part => part.id === `ev_L_group/${PDF_SOURCE}`);
  assert.deepEqual(pdf.alsoConnectedAs, ['ev_L_pdf_all']);
  assert.match(pdf.text, /^\[p\. 1\] A simple pendulum/);
  assert.match(parts.find(part => part.id === 'ev_L_cells').note, /not run/);
  assert.deepEqual(fields.find(field => field.field === 'ev_L_pdf').locators, [{ page: 2 }]);
});
