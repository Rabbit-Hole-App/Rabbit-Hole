// Tutor v2 free rescore (owner GO FREE RESCORE, 2026-10-01): applies the semantic-equivalence rubric
// (docs/features/tutor-v2-rescore-20261001/rubric.md) to recorded benchmark rows. No model, API or
// provider call; the recorded rows are read, never written. The rules read only the corpus turn, the
// locked route policy and the row: never the arm.
// Usage: node e2e/tutor-bench-rescore.mjs <out dir> <arm>=<rows.jsonl,...> [<arm>=...]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { CORPUS } from './tutor-corpus.mjs';
import { cardBlock } from '../src/nanogpt/board.js';
import { applyCheck, applyNewAttempt, enterPractice, setActivityAnswer } from '../src/scene-activity.js';
import { applyInputToBlock } from '../src/scene-evaluate.js';
import { cardModule, ladderStep, partLabels } from '../src/learn-tutor-claims.js';
import { partIndex } from '../src/nanogpt/depth/board.js';
import { appendEvents, deriveClaimStates, emptyStore, practiceEvents } from '../src/learn-tutor-evidence.js';

const TRACES = Object.fromEntries(CORPUS.map(trace => [trace.id, trace]));
const FAULTS = { 'B-jev-error': row => ['error', 'timeout'].includes(row.jev_outcome), 'B-larger-error': row => ['error', 'timeout'].includes(row.larger_outcome) };
const ESCALATING = ['gap', 'misconception', 'contradiction'];
const ROUTE_CLASS = row => (row === 'uncertain_unsettled' ? 'uncertain' : row);

// ---------- deterministic card practice, replayed from the scripted start (no model) ----------
function practise(block, answers) {
  let b = block;
  for (const answer of answers) { b = (b.attemptLog || []).length ? applyNewAttempt(b) : enterPractice(b); b = applyCheck(setActivityAnswer(b, answer)); }
  return b;
}
// Per turn index: the practice event keys appended at that turn, and the practice-only claim states after it.
function practiceReplay(trace) {
  let block = cardBlock(cardModule(trace.start.card));
  if (trace.start.part) block = applyInputToBlock(block, 'part', partIndex(cardModule(trace.start.card), trace.start.part));
  block = practise(block, trace.start.practice || []);
  let store = emptyStore(), inHole = false;
  const out = [];
  for (const step of trace.turns) {
    if (step.practice) block = practise(block, step.practice);
    if (step.enter_hole) inHole = true;
    if (step.climb) inHole = false;
    let keys = [];
    if (!inHole) {
      const { store: next, events } = practiceEvents(store, block, { card_id: trace.start.card, scene_id: block.scene?.id, part_id: null }, {});
      store = appendEvents(next, events).store;
      keys = events.map(event => `${event.claim}:${event.result}`);
    }
    out.push({ keys, states: Object.fromEntries(Object.entries(deriveClaimStates(store.events)).map(([id, s]) => [id, s.state])), inHole });
  }
  return out;
}
const REPLAY = Object.fromEntries(CORPUS.map(trace => [trace.id, practiceReplay(trace)]));

// ---------- functions (rubric section 6) ----------
function functions(actions, target) {
  const out = [];
  for (const action of actions) {
    const t = action.type;
    if (t === 'respond_text') out.push({ f: 'TEXT' });
    else if (t === 'ask_question') out.push({ f: 'QUESTION' });
    else if (t === 'suggest_depth') out.push({ f: 'NEXT', card: ladderStep(action.card, action.direction || 'deeper') || null, mode: 'suggest' });
    else if (t === 'show_authored_card' || t === 'focus_part') {
      const next = target && (action.mode || 'suggest') !== 'navigate' && (ladderStep(target, 'deeper') === action.card || ladderStep(target, 'shallower') === action.card);
      out.push({ f: next ? 'NEXT' : 'SHOW', card: action.card, part: action.part_id ?? null, mode: action.mode || 'suggest', alsoShow: true });
    } else if (t === 'suggest_practice') out.push({ f: 'PRACTICE' });
    else if (t === 'suggest_dive') out.push({ f: 'DIVE' });
    else if (t === 'return_from_dive') out.push({ f: 'RETURN' });
  }
  return out;
}
const has = (fs, name, card = null) => fs.some(entry => (entry.f === name || (name === 'SHOW' && entry.alsoShow)) && (!card || entry.card === card));

// The required functions of an expected action list (A1): each expected type is read from the scripted
// plan's action of that type (the expectation is that plan after validation), with the expected mode.
function required(expect, plan, target) {
  const pool = [...(plan?.actions || [])];
  const instances = expect.actions.map(type => {
    const i = pool.findIndex(action => action.type === type);
    const action = i >= 0 ? pool.splice(i, 1)[0] : { type };
    return { ...action, mode: expect.modes?.[type] || (type === 'show_authored_card' || type === 'focus_part' ? 'suggest' : action.mode) };
  });
  return [...new Set(functions(instances, target).map(entry => entry.f))];
}
function satisfies(name, fs, row) {
  if (has(fs, name)) return true;
  if (row === 'misconception' && (name === 'QUESTION' || name === 'SHOW')) return has(fs, 'QUESTION') || has(fs, 'SHOW');
  if (row === 'understood' && (name === 'NEXT' || name === 'QUESTION')) return has(fs, 'NEXT') || has(fs, 'QUESTION');
  return false;
}

// A3 part rule (owner correction, 2026-10-01): the part is required only when the learner's words or the
// turn's context identify it.
const GENERIC = new Set(['show', 'this', 'that', 'where', 'with', 'from', 'code', 'card', 'part', 'into']);
export function partSpecific(step, trace, card, part) {
  if (trace.start.part === part || trace.start.selected === part) return true;
  const module = cardModule(card), index = module ? partIndex(module, part) : null;
  const words = `${part} ${index != null ? partLabels(module)[index] : ''}`.toLowerCase().split(/[^a-z]+/).filter(word => word.length >= 4 && !GENERIC.has(word));
  const said = String(step.raw || '').toLowerCase();
  return words.some(word => new RegExp(`(^|[^a-z])${word}`).test(said));
}
function scoreActions(expect, plan, row, target, statedNoQuiz, audit, step, trace) {
  const fs = functions(row.actions, target);
  const actualRow = row.row;
  let need;
  if (expect.row && expect.row !== actualRow && ROUTE_CLASS(expect.row) === ROUTE_CLASS(actualRow)) need = actualRow === 'uncertain_unsettled' ? [['QUESTION']] : [['TEXT', 'SHOW']]; // A2
  else need = required(expect, plan, target).map(name => [name]);
  const a1 = need.every(alternatives => alternatives.some(name => satisfies(name, fs, actualRow)));
  const a3 = (!expect.card || fs.some(entry => (entry.f === 'SHOW' || entry.f === 'NEXT') && entry.card === expect.card))
    && (!expect.part || !partSpecific(step, trace, expect.card, expect.part) || fs.some(entry => entry.part === expect.part && entry.card === (expect.card || entry.card)));
  const a4 = Object.entries(expect.modes || {}).every(([type, mode]) => {
    const same = row.actions.filter(action => action.type === type || ((type === 'show_authored_card' || type === 'focus_part') && (action.type === 'show_authored_card' || action.type === 'focus_part')));
    return mode === 'navigate' ? same.some(action => action.mode === 'navigate' && (!expect.card || action.card === expect.card)) : !same.some(action => action.mode === 'navigate');
  });
  const a5 = !(statedNoQuiz && has(fs, 'QUESTION'));
  const a6 = !expect.max_sentences || (audit?.policy || 0) === 0;
  return { pass: a1 && a3 && a4 && a5 && a6, why: [!a1 && `A1 missing ${need.filter(alternatives => !alternatives.some(name => satisfies(name, fs, actualRow))).map(a => a.join('|')).join(',')}`, !a3 && 'A3 card/part', !a4 && 'A4 mode', !a5 && 'A5 question after no_quiz', !a6 && 'A6 sentences'].filter(Boolean) };
}

function scoreEvidence(expect, row, ctx) {
  const why = [];
  if (expect.events) {
    const bag = list => { const m = {}; for (const key of list) { const [claim, result] = key.replace(/\?$/, '').split(':'); (m[claim] ||= new Set()).add(result); } return JSON.stringify(Object.keys(m).sort().map(claim => [claim, [...m[claim]].sort()])); };
    if (bag(expect.events) !== bag(row.events)) why.push('E1 polarity');
    // E2: an unsettled actual event matches a settled expected one; an expected unsettled event needs '?'.
    for (const key of expect.events.filter(key => key.endsWith('?'))) if (!row.events.includes(key)) why.push('E2 settled where unsettled expected');
  }
  let unreconstructable = 0;
  for (const [claim, state] of Object.entries(expect.states || {})) {
    const got = ctx.stateOf(claim);
    if (got === null) { unreconstructable++; continue; }
    if (got !== state) why.push(`E3 ${claim} ${got} != ${state}`);
  }
  return { pass: !why.length, why, unreconstructable };
}

export function rescoreRows(rows) {
  const out = [];
  const runs = {};
  for (const row of rows) (runs[`${row.stage}|${row.trace}`] ||= []).push(row);
  for (const list of Object.values(runs)) {
    list.sort((a, b) => a.turn - b.turn);
    const trace = TRACES[list[0].trace], replay = REPLAY[list[0].trace];
    const transitions = {}, touched = {}; // claim -> last transition { turn, to }; claim -> first free-text turn
    const practiceTurns = trace.turns.map((s, i) => ((i === 0 ? (trace.start.practice || []).length : 0) + (s.practice || []).length ? i : null)).filter(i => i != null);
    let statedNoQuiz = false, inHole = false;
    for (const row of list) {
      const step = trace.turns[row.turn], expect = step.expect;
      if (step.enter_hole) inHole = true;
      if (step.climb) inHole = false;
      const target = inHole ? null : trace.start.card;
      if (/\b(don'?t|do not|no more|stop)\s+(quiz|test)/i.test(step.raw || '')) statedNoQuiz = true;
      // E3 reconstruction: this turn's free-text events are its events minus the replayed practice ones.
      const practiceKeys = [...replay[row.turn].keys];
      for (const key of (row.events || []).map(k => k.replace(/\?$/, ''))) {
        const i = practiceKeys.indexOf(key);
        if (i >= 0) practiceKeys.splice(i, 1); else { const claim = key.split(':')[0]; if (touched[claim] == null) touched[claim] = row.turn; }
      }
      for (const t of row.transitions || []) transitions[t.claim] = { turn: row.turn, to: t.to };
      const k = row.turn;
      const stateOf = claim => {
        const t = transitions[claim];
        if (t?.turn === k) return t.to;
        if (t) return practiceTurns.some(p => p > t.turn && p <= k) ? null : t.to;
        const first = touched[claim];
        if (first != null && practiceTurns.some(p => p > first && p <= k)) return null;
        return replay[k].states[claim];
      };
      const fault = FAULTS[row.trace] && !FAULTS[row.trace](row); // rule F: scripted fault did not happen
      const checks = {}, why = {};
      if (row.error) {
        for (const dim of ['selection', 'evaluation', 'evidence', 'route', 'actions']) if (dimIn(expect, dim)) { checks[dim] = false; why[dim] = ['error']; }
      } else {
        if (expect.selected_includes || expect.selected_excludes) checks.selection = (expect.selected_includes || []).every(id => row.selected.includes(id)) && !(expect.selected_excludes || []).some(id => row.selected.includes(id));
        if (!fault) {
          if ('jev' in expect || 'larger' in expect) checks.evaluation = (!('jev' in expect) || expect.jev === (row.jev_calls > 0)) && (!('larger' in expect) || (row.larger_calls > 0) === ESCALATING.includes(row.escalation));
          if (expect.events || expect.states) { const e = scoreEvidence(expect, row, { stateOf }); checks.evidence = e.pass; why.evidence = e.why; if (e.unreconstructable) why.unreconstructable = e.unreconstructable; }
          if (expect.row) { checks.route = expect.row === row.row || ROUTE_CLASS(expect.row) === ROUTE_CLASS(row.row); if (!checks.route) why.route = [`${row.row} != ${expect.row}`]; }
          if (expect.actions) { const a = scoreActions(expect, step.stub?.plan, row, target, statedNoQuiz, row.audit, step, trace); checks.actions = a.pass; why.actions = a.why; }
        }
      }
      out.push({ stage: row.stage, trace: row.trace, turn: row.turn, group: row.group, category: row.category, golden: row.golden, na_fault: !!fault, old: row.checks, new: checks, why, pass: Object.values(checks).every(Boolean), old_pass: row.pass });
    }
  }
  return out;
}
const dimIn = (expect, dim) => ({ selection: expect.selected_includes || expect.selected_excludes, evaluation: 'jev' in expect || 'larger' in expect, evidence: expect.events || expect.states, route: expect.row, actions: expect.actions })[dim];

// ---------- CLI ----------
if (process.argv[1]?.endsWith('tutor-bench-rescore.mjs')) {
  const [OUT, ...specs] = process.argv.slice(2);
  if (!OUT || !specs.length) throw Error('usage: node e2e/tutor-bench-rescore.mjs <out dir> <arm>=<rows.jsonl,...>');
  mkdirSync(OUT, { recursive: true });
  const read = file => readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
  const arms = Object.fromEntries(specs.map(spec => { const [arm, files] = spec.split('='); return [arm, files.split(',').flatMap(read)]; }));
  const scored = Object.fromEntries(Object.entries(arms).map(([arm, rows]) => [arm, rescoreRows(rows)]));
  writeFileSync(`${OUT}/rescored.json`, JSON.stringify(scored) + '\n');
  const ratio = (list, dim, key) => { const s = list.filter(r => r[key] && dim in r[key]); return { num: s.filter(r => r[key][dim]).length, den: s.length }; };
  const summary = Object.fromEntries(Object.entries(scored).map(([arm, list]) => [arm, Object.fromEntries(['actions', 'evidence', 'route', 'evaluation', 'selection'].map(dim => [dim, { old: ratio(list, dim, 'old'), new: ratio(list, dim, 'new') }]))]));
  console.log(JSON.stringify(summary, null, 1));
}
