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
import { reviewTools, runIt } from './flags.js';
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
// The intake question's rows are live until a topic is chosen, the learner sets them aside, or Run it is taken.
export const optionsOpen = state => !state.learn && !state.elsewhere && !state.use;
// Intake asked once (intake-once-spec.md, owner 2026-11-18 22:09): the catalogue is in, and its teachable options too (a catalogue still adding them waits).
export const intakeReady = state => !!state.doc && !(learnOf(state.doc).options.length === 0 && state.get?.learn?.status === 'queued');
// The one Tutor message: the catalogue's one-line fact, the question, and the teachable options as rows (no Run it / Learn from it step). Run it (flag runIt) leads the rows
// only where the codebase can run. The dev build's Load sample section stays last.
export function intakeMessage(doc, { key = 'intake', run = runIt } = {}) {
  const learn = learnOf(doc), cm = catalogueMessage(doc);
  const rows = [...(run && ['one', 'choose'].includes(cm.kind) ? [{ id: 'mode:run', label: SENTENCES.runIt }] : []), ...optionRows(learn.options), ...sampleRow()];
  return { key, role: 'assistant', text: `${factsMessage(doc, cm).text}\n\n${learn.options.length ? SENTENCES.intake : SENTENCES.learnNone}`, choices: rows, intakeRows: true };
}
// -> the state change that asks the question, or null: asked once per open (asked counts), again only when the router fires codebase-options (again: true).
// Run it off: the answer is a Learn topic, so the Learn options are what typing replies to (mode learn).
export function askIntake(state, { again = false, run = runIt } = {}) {
  if (!intakeReady(state) || (state.asked && !again)) return null;
  const asked = (state.asked || 0) + 1;
  return { asked, mode: run ? null : 'learn', log: [...(state.log || []), intakeMessage(state.doc, { key: asked === 1 ? 'intake' : `intake-${asked}`, run })] };
}

// The route the pipeline runs once "Use the codebase" is chosen with exactly one practical route.
export const onlyRoute = doc => { const practical = (doc?.routes || []).filter(route => route.practical); return practical.length === 1 ? practical[0] : null; };

export function flowMessages(state, { repo, run = runIt }) {
  const name = repoName(repo), out = [], g = state.get, cat = g?.catalogue?.status, doc = state.doc;
  // 1. before the catalogue: indexing, its failure, the catalogue's failure
  if (g?.indexing === 'failed') return [note('indexing-failed', indexingFailure(name, g?.catalogue?.error))];
  if (!doc) {
    if (cat === 'failed' || state.docError) return [note('catalogue-failed', SENTENCES.catalogueFailed(name), [RETRY_CATALOGUE])];
    return [pending('indexing', !g || ['queued', 'indexing'].includes(g.indexing) ? `Reading ${name}` : `Working out how ${name} can be used`)];
  }
  // 2. Intake asked once (intake-once-spec.md, owner 2026-11-18 22:09): the question is ONE message in the thread (askIntake appends it to the log), never pinned here.
  // Until it is asked, a catalogue still adding its Learn options says so (transient, like the indexing line above).
  const cm = catalogueMessage(doc), openLearn = learnOpen(state), open = optionsOpen(state);
  if (!state.asked && !intakeReady(state)) out.push(pending('learn-wait', 'Working out what you can learn here'));
  // 3. the thread: the question (its rows live until a topic is set), what was typed, the Tutor's answers (rows in a typed reply live only while the Learn options are open)
  for (const line of state.log) {
    if (line.intakeRows) out.push({ ...line, choices: line.choices.map(choice => (choice.id === 'sample:load' ? choice : { ...choice, disabled: !open })) });
    else out.push(line.learnRows ? { ...line, choices: line.choices.map(choice => ({ ...choice, disabled: !openLearn })) } : line);
  }
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
  // 5. "Use the codebase" (Run it, flag runIt only): the route question when more than one route is practical, then the rehearsal
  if (run && state.use === 'use_codebase' && cm.kind !== 'zero' && cm.kind !== 'none') {
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
