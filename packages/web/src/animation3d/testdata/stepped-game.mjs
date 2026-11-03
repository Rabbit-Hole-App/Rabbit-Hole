// A stepped game (test data, not a contract fixture): Launch starts the robot along x and the host's steps move it 0.1 a step until it
// lands on the target at x = 3, 30 steps (one second) later. Owner canvas 2026-11-02: a generated stepped Launch game stayed "Ball in
// flight" in the card, because nothing started the step clock. Used by session.test.mjs and e2e/animation-mvp-check.mjs.
import { gameFixture } from '../fixtures.js';
import { hashProgramSource } from '../contract.js';

const SOURCE = `export function initialState() { return { x: 0, flying: false, status: 'playing' }; }
export function reduce({ state, event }) {
  if (event.type === 'action' && event.action === 'launch' && !state.flying && state.status === 'playing') return { ...state, flying: true };
  if (event.type === 'step' && state.flying) { const x = Math.min(3, Math.round((state.x + 0.1) * 10) / 10); return { x, flying: x < 3, status: x >= 3 ? 'won' : 'playing' }; }
  return state;
}
export function evaluate({ state }) {
  const s = state || initialState();
  return { nodes: { robot: { position: [s.x, 0.3, 0] } }, readouts: { distance: s.x }, goal: { status: s.status, message: s.status === 'won' ? 'Landed on the target.' : s.flying ? 'In flight.' : 'Press Launch.' } };
}
`;

export async function steppedGameArtifact() {
  const { keys: _keys, ...game } = structuredClone(gameFixture.artifact);
  return { ...game, artifactId: 'stepped-game-stub', title: 'Launch to the target', stepped: true, provenance: { origin: 'generated' },
    actions: [{ id: 'launch', label: 'Launch' }], readouts: [{ id: 'distance', label: 'Distance', unit: 'm', decimals: 1 }],
    game: { objective: 'Launch the robot onto the target.' },
    program: { ...game.program, source: SOURCE, sourceHash: await hashProgramSource(SOURCE) } };
}

// A stepped scene whose actions are of the two kinds (contract.js startsMotion): nudge only changes the state once and declares
// startsMotion false; launch starts a motion and declares nothing. The step event counts host ticks, so a runaway shows as ticks.
const STUDY_SOURCE = `export function initialState() { return { taken: 0, ticks: 0, flying: false, x: 0 }; }
export function reduce({ state, event }) {
  if (event.type === 'action' && event.action === 'nudge') return { ...state, taken: state.taken + 1 };
  if (event.type === 'action' && event.action === 'launch' && !state.flying) return { ...state, flying: true };
  if (event.type === 'step') return { ...state, ticks: state.ticks + 1, x: state.flying ? Math.min(3, Math.round((state.x + 0.1) * 10) / 10) : state.x, flying: state.flying && state.x < 2.9 };
  return state;
}
export function evaluate({ state }) {
  const s = state || initialState();
  return { nodes: { robot: { position: [s.x, 0.3, 0] } }, readouts: { taken: s.taken, ticks: s.ticks, distance: s.x }, goal: { status: 'playing', message: 'Study the steps.' } };
}
`;

export async function steppedStudyArtifact() {
  const game = await steppedGameArtifact();
  return { ...game, artifactId: 'stepped-study-stub', title: 'Nudge or launch',
    actions: [{ id: 'nudge', label: 'Take one step', startsMotion: false }, { id: 'launch', label: 'Launch' }],
    readouts: [{ id: 'taken', label: 'Steps taken', decimals: 0 }, { id: 'ticks', label: 'Host ticks', decimals: 0 }, { id: 'distance', label: 'Distance', unit: 'm', decimals: 1 }],
    program: { ...game.program, source: STUDY_SOURCE, sourceHash: await hashProgramSource(STUDY_SOURCE) } };
}
