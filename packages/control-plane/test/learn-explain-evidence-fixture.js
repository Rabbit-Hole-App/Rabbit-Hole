// A synthetic Explain-back resource packet (EB-05) for the frozen evidence resolver and its consumers (assessment, A): a
// saved board with a Notebook and two PDF cards of one stored file in a Group, the same file connected directly, a scoped
// Notebook input and a note card. The resources are built by the browser's own code (web/src/explain-inputs.js), so their
// hashes are the ones a real submission carries. No real learner content.
//   const { env, actor, attempt, answer, deps } = await explainEvidenceFixture();
//   await resolveExplainEvidence(env, actor, attempt, answer.resources, deps)
import { createHash } from 'node:crypto';
import { inputEvidence } from '../../web/src/explain-inputs.js';

export const sha = text => createHash('sha256').update(text).digest('hex');
export const PDF_SOURCE = 'fs_0000000000000000000000aa';
export const PDF_SHA = sha('pendulum.pdf bytes');
export const DERIVATIVE = { derivativeId: 'fd_pendulum_text', hash: sha('pendulum text derivative'), converterVersion: 'pdf-text-2' };
export const PDF_TEXT = { v: 1, complete: true, units: [
  { loc: { page: 1 }, text: 'A simple pendulum: a mass on a light string swings under gravity.' },
  { loc: { page: 2 }, text: 'For small angles the period is T = 2*pi*sqrt(L/g), independent of amplitude.' },
] };

const pdfCard = (id, groupId) => ({ id, type: 'file', kind: 'pdf', ...(groupId ? { groupId } : {}), dx: 0, dy: 0,
  fileRef: { v: 1, family: 'pdf', source: { id: PDF_SOURCE, rev: PDF_SHA }, meta: { name: 'pendulum.pdf', title: 'Pendulum notes' } } });
export const boardState = () => ({
  blocks: [
    { id: 'card_eb', type: 'challenge', mode: 'explain_back', prompt: 'Why does the period not depend on the amplitude?', dx: 0, dy: 0 },
    { id: 'nb_pendulum', type: 'notebook', notebook_id: 'n-pendulum', active_path: 'notebook.ipynb', groupId: 'grp_forces', dx: 0, dy: 0, ipynb: { cells: [
      { id: 'c1', cell_type: 'code', source: 'import math\nT = lambda L: 2*math.pi*math.sqrt(L/9.81)\nprint(T(1.0))', outputs: [{ output_type: 'stream', name: 'stdout', text: '2.006\n' }], execution_count: 3 },
      { id: 'c2', cell_type: 'markdown', source: 'Amplitude does not appear in T.', outputs: [] },
      { id: 'c3', cell_type: 'code', source: 'T(4.0)', outputs: [], execution_count: null },
    ] } },
    pdfCard('pdf_in_group', 'grp_forces'),
    pdfCard('pdf_direct'),
    { id: 'note_1', type: 'explanation', title: 'My note', text: 'Longer string, longer period.', dx: 0, dy: 0 },
  ],
  groups: [{ id: 'grp_forces', label: 'Forces' }],
  links: [
    { id: 'L_group', kind: 'explain-input', from: 'grp_forces', fromSide: 'bottom', to: 'card_eb', toSide: 'input' },
    { id: 'L_pdf', kind: 'explain-input', from: 'pdf_direct', fromSide: 'top', to: 'card_eb', toSide: 'input', scope: { pages: [2] } },
    { id: 'L_pdf_all', kind: 'explain-input', from: 'pdf_direct', fromSide: 'bottom', to: 'card_eb', toSide: 'input' },
    { id: 'L_cells', kind: 'explain-input', from: 'nb_pendulum', fromSide: 'top', to: 'card_eb', toSide: 'input', scope: { cells: ['c1', 'c2'] } },
    { id: 'L_note', kind: 'explain-input', from: 'note_1', fromSide: 'bottom', to: 'card_eb', toSide: 'input' },
  ],
  items: [], shapes: [], strokes: [],
});

// Fake loaders with the same contracts as the resolver's defaults. over: replace any of them, or the board state.
export function fixtureDeps(state, over = {}) {
  const objects = { 'derivatives/pendulum-text': JSON.stringify(PDF_TEXT) };
  return {
    loadBoard: async (env, actor) => (actor.board === 'main' ? { row: { id: 'board_row_1' }, state } : null),
    authorizeFile: async (env, row, sourceId) => (row?.id === 'board_row_1' && sourceId === PDF_SOURCE ? { id: PDF_SOURCE, sha256: PDF_SHA, media_type: 'application/pdf', bytes: 2048, r2_key: 'file-sources/pdf/original' } : null),
    findDerivative: async (env, sourceId, sourceSha, pin) => {
      if (sourceId !== PDF_SOURCE || sourceSha !== PDF_SHA) return null;
      if (pin && (pin.derivativeId !== DERIVATIVE.derivativeId || pin.hash !== DERIVATIVE.hash || pin.converterVersion !== DERIVATIVE.converterVersion)) return null;
      return { id: DERIVATIVE.derivativeId, kind: 'text', media_type: 'application/json', r2_key: 'derivatives/pendulum-text', sha256: DERIVATIVE.hash, converter_version: DERIVATIVE.converterVersion };
    },
    conversionPending: async () => false,
    readObject: async (env, key) => (key in objects ? { text: async () => objects[key], arrayBuffer: async () => new TextEncoder().encode(objects[key]).buffer } : null),
    ...over,
  };
}

export async function explainEvidenceFixture() {
  const state = boardState();
  const world = { board: 'main', blocks: state.blocks, groups: state.groups, exchanges: [], items: state.items, shapes: state.shapes };
  const resources = await inputEvidence(world, state.links, 'card_eb', { sha256: async text => sha(text) });
  const answer = { v: 1, kind: 'explain_back', text: 'The period only depends on length and gravity.', voice: [], resources, assistance: [] };
  return { env: {}, actor: { org: 'org_1', userId: 'user_1', app: 'canvas-pendulum', board: 'main' }, attempt: { attemptId: 'at_fixture_1', submittedContent: answer }, answer, state, deps: fixtureDeps(state) };
}
