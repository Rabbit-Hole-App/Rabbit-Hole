// packages/web/src/rehearsal-flow.js
// The initial pipeline's Tutor conversation as data (initial-pipeline-spec.md section 1): from the repository's state (indexing, the catalogue, the learner's choices,
// the rehearsal) to the ordered list of Tutor messages the chat shows. TutorRehearsal.jsx renders the list with the existing chat message, pending and chip components and
// holds the state; nothing here touches React, the network or storage.
//
// state: { get, doc, docError, use, goalChosen, elsewhere, log[], routeId, routeTitle, run, startError }
//   get: the last GET /api/learn/rehearsal (schemas/learn-rehearsal-get.json); doc: the catalogue document; use: the chosen use id; run: { status, step, attempt, error, record } of routeId.
// A message: { key, role: 'assistant' | 'user', text?, pending?, chips?, choices?, form?, actions? }. Chip: { id, label, disabled?, note? } (a pill button: Retry, the plan's actions).
// choices: the clickable rows (ChoiceList.jsx): { id, label, hint?, star?, disabled? }. Options are always rows, never typed or in a dropdown (owner 2026-11-15).
import { CODEBASE_GOALS } from './learn-codebase-goals.js';
import { planMessage } from './learn-rehearsal-view.js';
import { SENTENCES, catalogueMessage, indexingFailure, rehearsalFailure, repoName, routeQuestion } from './tutor-rehearsal-text.js';

// Plain words for the rehearsal's status (no status code, no machine or provider term).
const STATUS_WORDS = { queued: 'Getting ready to try it', discovering: 'Reading how it is meant to run', provisioning: 'Setting up a place to run it', running: 'Running the steps', repairing: 'Fixing a step that did not work', planning: 'Writing up the plan' };
export const statusWords = run => [STATUS_WORDS[run?.status] || STATUS_WORDS.queued, run?.step ? `step ${run.step}` : '', Number.isInteger(run?.attempt) && run.attempt > 1 ? `attempt ${run.attempt}` : ''].filter(Boolean).join(', ');

const note = (key, text, chips, choices) => ({ key, role: 'assistant', text, ...(chips ? { chips } : {}), ...(choices?.length ? { choices } : {}) });
const pending = (key, text) => ({ key, role: 'assistant', pending: text });
export const RETRY_CATALOGUE = { id: 'retry:catalogue', label: 'Retry' };
export const RETRY_ROUTE = { id: 'retry:route', label: 'Retry' };

// Whether the intake question is open: the catalogue says it can run, and nothing has been chosen or set aside.
export const intakeOpen = (state, cm) => !!cm && ['one', 'choose'].includes(cm.kind) && !state.use && !state.goalChosen && !state.elsewhere && !state.intakeDone;
// The route the pipeline runs once "Use the codebase" is chosen with exactly one practical route.
export const onlyRoute = doc => { const practical = (doc?.routes || []).filter(route => route.practical); return practical.length === 1 ? practical[0] : null; };

export function flowMessages(state, { repo }) {
  const name = repoName(repo), out = [], g = state.get, cat = g?.catalogue?.status, doc = state.doc;
  // 1. before the catalogue: indexing, its failure, the catalogue's failure
  if (g?.indexing === 'failed') return [note('indexing-failed', indexingFailure(name, g?.catalogue?.error))];
  if (!doc) {
    if (cat === 'failed' || state.docError) return [note('catalogue-failed', SENTENCES.catalogueFailed(name), [RETRY_CATALOGUE])];
    return [pending('indexing', !g || ['queued', 'indexing'].includes(g.indexing) ? `Reading ${name}` : `Working out how ${name} can be used`)];
  }
  // 2. the can / cannot message: its ways are clickable rows under the heading (the reading goals when nothing can run), then what is out of reach.
  // Picking a way is the answer (owner 2026-11-15: click only, no separate question). A way stays drawn but greyed once something is chosen; the goals go away.
  const cm = catalogueMessage(doc), set = state.goalChosen || state.elsewhere, ways = ['one', 'choose'].includes(cm.kind);
  const open = intakeOpen(state, cm);
  out.push(note('catalogue', cm.text, null, ways ? cm.chips.map(chip => ({ ...chip, disabled: !open })) : set ? null : cm.chips));
  if (cm.rest) out.push(note('catalogue-rest', cm.rest));
  // 4. what was typed, what the Tutor answered, the goal's own question
  for (const line of state.log) out.push(line);
  if (state.elsewhere) return out;
  // 5. "Use the codebase": the route question when more than one route is practical, then the rehearsal
  if (state.use === 'use_codebase' && cm.kind !== 'zero' && cm.kind !== 'none') {
    if (cm.kind === 'choose' && !state.routeId) { const q = routeQuestion(doc); out.push(note('route-question', q.text, null, q.chips)); }
    if (state.routeId) {
      const run = state.run, failed = state.startError ? { text: SENTENCES.noMachine(name), retry: true } : run?.status === 'failed' ? rehearsalFailure(name, run.error) : null;
      if (failed) out.push(note('rehearsal-failed', failed.text, failed.retry ? [RETRY_ROUTE] : null));
      else if (run?.status === 'ready' && run.record) out.push({ key: 'plan', role: 'assistant', text: planMessage(run.record), actions: [{ id: 'show:run', label: 'Show run card' }, { id: 'show:runbook', label: 'Show runbook' }, { id: 'study:these', label: 'Study these' }] });
      else out.push(pending('rehearsal', statusWords(run)));
    }
  }
  return out;
}

// The reading goals' clarifying question (the existing goal flow, unchanged): the goal's own words, then a text field.
export const goalForm = goalId => { const goal = CODEBASE_GOALS.find(g => g.id === goalId); return goal ? { key: `goal-${goal.id}`, role: 'assistant', text: goal.clarify, form: { goalId: goal.id } } : null; };
