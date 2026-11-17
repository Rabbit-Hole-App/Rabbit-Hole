// Pinned Study for a codebase canvas (pinned-study-codebase-spec.md 2c, 2f, 2g): what the work pane offers, when the Study | Canvas
// pill shows, and the actions Study these runs. Pure: no React, no DOM; the canvas's blocks and the Study state go in.
import { parseSource } from './learn-runbook.js';
import { isGenerated } from './rehearsal-cards.js';
import { WORK_ID } from './study-state.js';
export { ownedId } from './study-state.js';

// The canvas's cards of each kind Study can work in: a Run card, the generated Runbook (a generated doc card), a notebook.
export function workCards(blocks) {
  const list = Array.isArray(blocks) ? blocks : [];
  return {
    run: list.filter(block => block?.type === 'run'),
    runbook: list.filter(block => block?.type === 'doc' && isGenerated(block)),
    notebook: list.filter(block => block?.type === 'notebook'),
  };
}

// The work pane's options, in order: what the canvas has, Canvas always. A canvas with no Run card and no Runbook keeps Release 1's row:
// Notebook (greyed when there is none) and Canvas.
export function workOptions(blocks) {
  const cards = workCards(blocks), generated = cards.run.length || cards.runbook.length;
  return [
    ...(cards.run.length ? [{ work: 'run', label: 'Run' }] : []),
    ...(cards.runbook.length ? [{ work: 'runbook', label: 'Runbook' }] : []),
    ...(cards.notebook.length || !generated ? [{ work: 'notebook', label: 'Notebook', disabled: !cards.notebook.length }] : []),
    { work: 'canvas', label: 'Canvas' },
  ];
}

// The card a work option opens: the one this Study last worked in when it is still on the canvas, else the only one of its kind. null: none, or several and
// none remembered (the picker asks).
export function workTarget(state, blocks, work) {
  const list = workCards(blocks)[work];
  if (!list) return null;
  const id = state?.[WORK_ID[work]];
  return list.find(block => block.id === id) || (list.length === 1 ? list[0] : null);
}

// A Study that was never given a work opens on Run, else the Runbook, once the canvas has them (spec 2a); { work, cardId } or null.
export function defaultWork(state, blocks) {
  if (!state || state.workSet || state.work !== 'canvas') return null;
  const cards = workCards(blocks), card = cards.run[0] || cards.runbook[0];
  return card ? { work: cards.run[0] ? 'run' : 'runbook', cardId: card.id } : null;
}

// The Study | Canvas pill (spec 2f): only when the canvas has a generated Run card or Runbook, or a card pin (Release 1).
export const studyPill = (blocks, pin) => !!pin || (Array.isArray(blocks) ? blocks : []).some(block => (block?.type === 'run' || block?.type === 'doc') && isGenerated(block));

// The route's first source file in the record (route.steps[].source "README.md:85", then the route's own, then its install's): { path, line } or null.
export function firstSourceFile(record) {
  const route = record?.route || {};
  for (const source of [...(route.steps || []).map(step => step?.source), route.source, route.install?.[0]?.source]) {
    const at = parseSource(source);
    if (at) return { path: at.path, line: at.line };
  }
  return null;
}

// Study these (spec 2g): Files at the route's first source file, the Run card as the work, Study open. The three existing actions (and the Files place
// the first one needs); no new state.
export function studyTheseActions({ blocks, place = null }) {
  const cards = workCards(blocks), card = cards.run[0] || cards.runbook[0];
  return [
    ...(place ? [{ type: 'filesAt', path: place.path, line: place.line }] : []),
    { type: 'setReferenceTab', tab: 'files' },
    ...(card ? [{ type: 'setWork', work: cards.run[0] ? 'run' : 'runbook', cardId: card.id }] : []),
    { type: 'setMode', mode: 'study' },
  ];
}
