// packages/web/src/rehearsal-flow.js
// The initial pipeline's Tutor conversation as data (initial-pipeline-spec.md section 1): from the repository's state (indexing, the catalogue, the learner's choices,
// the rehearsal) to the ordered list of Tutor messages the chat shows. TutorRehearsal.jsx renders the list with the existing chat message, pending and chip components and
// holds the state; nothing here touches React, the network or storage.
//
// state: { get, doc, docError, use, mode, learn, learnIntro, goalChosen, elsewhere, log[], routeId, routeTitle, run, startError }
//   get: the last GET /api/learn/rehearsal (schemas/learn-rehearsal-get.json); doc: the catalogue document; use: the chosen use id; run: { status, step, attempt, error, record } of routeId.
//   plan: null | { status: 'loading' | 'draft' | 'invalid' | 'accepted' | 'plain', text, ops, base, rows, count, previous } (the Learn plan draft, learn-plan-toc-spec.md); planLog: the typed edits and the Tutor's one-line answers after it.
//   depthAsk: the Learn topic is chosen and the depth question (Brief / Standard / Detailed) is open.
//   mode: null | 'run' | 'learn' (Intake v2: the first answer); learn: the chosen option of doc.learn; learnIntro: { status: 'loading' | 'done' | 'failed', text? } the opening paragraph.
//   section: null | { id, stage: 'brief' | 'compose' | 'ready' | 'making' | 'failed', failed, words, brief, composition, next, cards, last } (the current Learn section, docs/features/learn-sections).
// A message: { key, role: 'assistant' | 'user', text?, pending?, chips?, choices?, form?, actions?, section? }. Chip: { id, label, disabled?, note? } (a pill button: Retry, the plan's actions).
// choices: the clickable rows (ChoiceList.jsx): { id, label, hint?, star?, disabled? }. Options are always rows, never typed or in a dropdown (owner 2026-11-15).
import { CODEBASE_GOALS } from './learn-codebase-goals.js';
import { planMessage } from './learn-rehearsal-view.js';
import { SENTENCES, catalogueMessage, factsMessage, indexingFailure, rehearsalFailure, repoName, routeQuestion } from './tutor-rehearsal-text.js';
import { learnOf, optionRows } from './learn-intake.js';
import { draftText } from './learn-plan.js';
import { reviewTools } from './flags.js';
import { sampleSectionOn } from './learn-sample-section.js';
// Dev build only (Reviewer 2026-11-18 13:32): the built 1.1 fixture onto this fresh canvas, so a layout, walk or contents check costs seconds and no model call.
const SAMPLE_ROW = { id: 'sample:load', label: 'Load sample section' };
const sampleRow = () => (sampleSectionOn() ? [SAMPLE_ROW] : []);

// Plain words for the rehearsal's status (no status code, no machine or provider term).
const STATUS_WORDS = { queued: 'Getting ready to try it', discovering: 'Reading how it is meant to run', provisioning: 'Setting up a place to run it', running: 'Running the steps', repairing: 'Fixing a step that did not work', planning: 'Writing up the plan' };
export const statusWords = run => [STATUS_WORDS[run?.status] || STATUS_WORDS.queued, run?.step ? `step ${run.step}` : '', Number.isInteger(run?.attempt) && run.attempt > 1 ? `attempt ${run.attempt}` : ''].filter(Boolean).join(', ');

const note = (key, text, chips, choices) => ({ key, role: 'assistant', text, ...(chips ? { chips } : {}), ...(choices?.length ? { choices } : {}) });
const pending = (key, text) => ({ key, role: 'assistant', pending: text });
export const RETRY_CATALOGUE = { id: 'retry:catalogue', label: 'Retry' };
export const RETRY_ROUTE = { id: 'retry:route', label: 'Retry' };
export const RETRY_LEARN = { id: 'retry:learn', label: 'Retry' };

// Whether the intake question is open: the catalogue says it can run, and nothing has been chosen or set aside.
export const intakeOpen = (state, cm) => !!cm && ['one', 'choose'].includes(cm.kind) && !state.mode && !state.use && !state.goalChosen && !state.elsewhere && !state.intakeDone;
// The Learn options are open until one is chosen or the learner sets them aside.
export const learnOpen = state => state.mode === 'learn' && !state.learn && !state.elsewhere;
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
  // 2. what the codebase is and what is out of reach, then ONE question with two rows: Run it or Learn from it (Intake v2, owner 2026-11-15). Run it shows the route list below (step 5);
  // Learn from it shows the options the catalogue document offers (never the route list). A codebase that cannot run keeps its reading goals under the can / cannot message.
  const cm = catalogueMessage(doc), set = state.goalChosen || state.elsewhere, ways = ['one', 'choose'].includes(cm.kind);
  const open = intakeOpen(state, cm), learn = learnOf(doc), openLearn = learnOpen(state);
  if (ways) {
    const facts = factsMessage(doc, cm);
    out.push(note('catalogue', facts.text));
    if (facts.rest) out.push(note('catalogue-rest', facts.rest));
    out.push(note('intake', SENTENCES.intake, null, [{ id: 'mode:run', label: SENTENCES.runIt, disabled: !open }, { id: 'mode:learn', label: SENTENCES.learnIt, disabled: !open }, ...sampleRow()]));
  } else {
    out.push(note('catalogue', cm.text, null, set ? null : cm.chips));
    if (cm.rest) out.push(note('catalogue-rest', cm.rest));
  }
  // 3. Learn from it: the options as rows, then the line that says typing works too
  if (state.mode === 'learn') {
    // A stored catalogue that has no `learn` yet is being added to (GET says learn: queued): the Tutor says so until it lands, never an empty list.
    if (!learn.options.length && state.get?.learn?.status === 'queued') out.push(pending('learn-wait', 'Working out what you can learn here'));
    else out.push(note('learn-options', learn.options.length ? SENTENCES.learnOptions : SENTENCES.learnNone, null, optionRows(learn.options, { disabled: !openLearn })));
    if (openLearn && learn.options.length) out.push(note('learn-or-type', SENTENCES.learnOrType));
  }
  // 4. what was typed, what the Tutor answered (rows in a typed reply are live only while the Learn options are open), the goal's own question
  for (const line of state.log) out.push(line.learnRows ? { ...line, choices: line.choices.map(choice => ({ ...choice, disabled: !openLearn })) } : line);
  // 4b. the chosen topic's opening paragraph
  if (state.learn && state.depthAsk) {
    // the topic is confirmed; how deep comes next, as three rows (the goal, the opening paragraph and the plan wait for the answer)
    out.push(note('learn-depth', SENTENCES.depthQuestion, null, [{ id: 'depth:brief', label: SENTENCES.depthBrief }, { id: 'depth:balanced', label: SENTENCES.depthStandard }, { id: 'depth:detailed', label: SENTENCES.depthDetailed }]));
  } else if (state.learn) {
    const intro = state.learnIntro;
    if (intro?.status === 'skipped') { /* a reload: the opening paragraph was said before */ }
    else if (!intro || intro.status === 'loading') out.push(pending('learn-intro', 'Reading the code for it'));
    else if (intro.status === 'failed') out.push(note('learn-intro-failed', SENTENCES.learnIntroFailed, [RETRY_LEARN]));
    else out.push(note('learn-intro', intro.text));
    // 4c. the plan: a draft of the table of contents with Accept / Change something, edited in plain words until Accept (learn-plan-toc-spec.md section 1)
    const plan = state.plan;
    if (plan?.status === 'loading') out.push(pending('learn-plan', SENTENCES.planDrafting));
    else if (plan?.status === 'draft') out.push(note('learn-plan', draftText(plan.text, plan.ops), null, plan.rows.map(row => ({ ...row, disabled: !!plan.busy }))));
    else if (plan?.status === 'invalid') out.push(note('learn-plan', SENTENCES.planInvalid, null, plan.rows));
    else if (plan?.status === 'accepted') out.push(note('learn-plan', SENTENCES.planAccepted(plan.count)));
    const liveRows = plan?.status === 'draft' && !plan.busy; // rows under a typed answer act only while a draft waits
    for (const line of state.planLog || []) out.push(line.choices ? { ...line, choices: line.choices.map(choice => ({ ...choice, disabled: !liveRows })) } : line);
    // 4d. the current section (docs/features/learn-sections, dev build): brief and compose run on Accept for 1.1 and on Next section; the beats and items under a dev disclosure;
    // the dev rows Next section and Make section; a failure says A section 5's words with Try again and Skip this section.
    const sec = plan?.status === 'accepted' ? state.section : null;
    if (sec?.stage === 'brief' || sec?.stage === 'compose') out.push(pending('learn-section', SENTENCES.sectionPlanning));
    else if (sec?.stage === 'failed') out.push(note('learn-section', sec.words || SENTENCES.sectionBriefFailed, null, [{ id: 'section:retry', label: SENTENCES.sectionTryAgain }, { id: 'section:skip', label: SENTENCES.sectionSkip }]));
    else if (sec) {
      const making = sec.stage === 'making';
      if (making) out.push(pending('learn-section-making', SENTENCES.sectionMaking));
      // Position's dev controls (Reviewer 2026-11-17 10:20 A: dev build only, never shipped): Arrange section, and the spacing toggle the owner compares on 8878.
      const dev = reviewTools ? [{ id: 'section:arrange', label: 'Arrange section', disabled: making }, ...['tight', 'normal', 'loose'].map(name => ({ id: `spacing:${name}`, label: `Spacing: ${name}` }))] : [];
      out.push({ key: 'learn-section', role: 'assistant', section: sec, choices: [{ id: 'section:next', label: SENTENCES.sectionNext, disabled: making }, { id: 'section:make', label: SENTENCES.sectionMake, disabled: making }, ...dev, ...sampleRow()] });
    }
  }
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
