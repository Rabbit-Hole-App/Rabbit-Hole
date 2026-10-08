// Tutor decision evaluation metrics (docs/features/tutor-decision-eval.md). Pure functions over SEGMENTS - arrays
// of folded steps (events.mjs foldSessions / segmentsBy) - so one implementation serves a session, a canvas, a
// user x canvas pair, a journey, a section, a planner version and the global aggregate, for simulated and real
// sessions alike. Runs, switches and "previous step" logic never cross a segment boundary.
// Observational: nothing here judges a repetition wrong; flagged sequences carry justified: null until a reviewer
// decides. The taxonomy is data (fixtures/taxonomy.provisional.json until the Learning checkpoint supplies the
// product's own).
import { GROUP_KEYS, claimsIn, foldSessions, round, segmentsBy, stateMap, stats, sum, tally, wholeSession } from './events.mjs';
import { costMetrics } from './cost.mjs';
import { graphMetrics, learningGraph, mergeGraphs, subgraph } from './graph.mjs';
import { materialMetrics, materialRecords, structureMetrics } from './materials.mjs';

export { claimsIn, stats };

// ---------- Small helpers ----------

const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : null);
function runsOf(list) {
  const runs = [];
  list.forEach((value, i) => { if (i && runs.at(-1).value === value) runs.at(-1).length++; else runs.push({ value, start: i, length: 1 }); });
  return runs;
}
const longest = runs => runs.reduce((best, run) => (run.length > (best?.length || 0) ? run : best), null);
const STOP = new Set('a an the of to in on for and or is are be it its this that what if how why does do with as at by from into your you we can could would should will which when where there their than then'.split(' '));
const tokens = text => new Set(String(text || '').toLowerCase().match(/[a-z0-9]+/g)?.filter(word => !STOP.has(word)) || []);
export function jaccard(a, b) {
  const x = tokens(a), y = tokens(b);
  if (!x.size && !y.size) return 1;
  let both = 0;
  for (const word of x) if (y.has(word)) both++;
  return both / (x.size + y.size - both);
}
const decisionOf = step => step.tutor_decision || {};
const stepModality = step => decisionOf(step).modality ?? 'unknown';
const classOf = (taxonomy, modality) => taxonomy.modalities?.[modality] || null;
const isActive = (taxonomy, step) => classOf(taxonomy, stepModality(step))?.mode === 'active';
const targetsOf = step => new Set(decisionOf(step).target_concepts || []);
const ref = step => ({ session_id: step.session_id, step: step.step });

// Latency statistics are never pooled across sources: one stats block per timing source; not_run is only counted.
function bySource(steps, valueOf, sourceOf) {
  const out = {};
  for (const step of steps) {
    const source = sourceOf(step);
    if (!source) continue;
    if (source === 'not_run') { out.not_run = (out.not_run || 0) + 1; continue; }
    const value = valueOf(step);
    if (value != null) (out[source] ||= []).push(value);
  }
  for (const key of Object.keys(out)) if (key !== 'not_run') out[key] = stats(out[key]);
  return out;
}
// The worst evidence state among the decision's target claims (a target concept with no claim state is unobserved).
const SEVERITY = ['misconception', 'prerequisite_gap', 'uncertain', 'not_yet_observed', 'understood'];
function targetState(step) {
  const claims = claimsIn(step.evidence_before);
  const states = [...targetsOf(step)].flatMap(concept => { const own = claims.filter(entry => entry.concept === concept); return own.length ? own.map(entry => entry.state) : ['not_yet_observed']; });
  return states.length ? SEVERITY.find(state => states.includes(state)) ?? 'other' : 'no_target';
}
// What the step's evidence did: regressed (a claim entered misconception or a gap), improved (a claim reached
// understood or left misconception / gap), else unchanged.
// ponytail: a coarse outcome; the per-claim transitions are kept for anything finer.
function evidenceOutcome(step) {
  const before = stateMap(step.evidence_before), after = stateMap(step.evidence_after);
  const moved = Object.keys({ ...before, ...after }).filter(claim => before[claim] !== after[claim]);
  if (moved.some(claim => ['misconception', 'prerequisite_gap'].includes(after[claim]))) return 'regressed';
  if (moved.some(claim => after[claim] === 'understood' || ['misconception', 'prerequisite_gap'].includes(before[claim]))) return 'improved';
  return 'unchanged';
}
export function evidenceChanged(step) {
  const before = stateMap(step.evidence_before), after = stateMap(step.evidence_after);
  return Object.keys({ ...before, ...after }).some(claim => before[claim] !== after[claim]);
}
const crossTab = (steps, rowOf, colOf) => steps.reduce((acc, step) => { const row = rowOf(step), col = colOf(step); acc[row] = { ...acc[row], [col]: (acc[row]?.[col] || 0) + 1 }; return acc; }, {});

// ---------- Modality diversity ----------

// normalized_entropy: Shannon entropy over modalities / log(K), K = the modalities AVAILABLE in these steps (union of
// available_modalities, else the taxonomy's), so an unavailable Avatar or Motion never counts against diversity.
export function modalityMetrics(segments, taxonomy) {
  const steps = segments.flat(), n = steps.length;
  const counts = tally(steps.map(stepModality));
  const available = new Set(steps.flatMap(step => step.available_modalities || []));
  const k = available.size || Object.keys(taxonomy.modalities || {}).length;
  const entropy = -Object.values(counts).reduce((h, c) => h + (c / n) * Math.log(c / n), 0);
  const lists = segments.map(segment => segment.map(stepModality));
  const pairs = sum(lists.map(list => Math.max(0, list.length - 1)));
  const switches = sum(lists.map(list => list.filter((m, i) => i && m !== list[i - 1]).length));
  const runs = segments.flatMap(segment => runsOf(segment.map(stepModality)).map(run => ({ ...run, segment })));
  const run = longest(runs);
  const modes = steps.map(step => classOf(taxonomy, stepModality(step))?.mode ?? 'unclassified');
  const active = modes.filter(mode => mode === 'active').length, passive = modes.filter(mode => mode === 'passive').length;
  return {
    counts,
    percent: Object.fromEntries(Object.entries(counts).map(([m, c]) => [m, pct(c, n)])),
    distinct: Object.keys(counts).length,
    available: k,
    normalized_entropy: n && k > 1 ? round(entropy / Math.log(k)) : 0,
    switch_rate: pairs ? round(switches / pairs) : null,
    same_modality_repetition_rate: pairs ? round(1 - switches / pairs) : null,
    repeated_within_previous_3: sum(lists.map(list => list.filter((m, i) => list.slice(Math.max(0, i - 3), i).includes(m)).length)),
    max_run: run && { modality: run.value, length: run.length, from: ref(run.segment[run.start]), to: ref(run.segment[run.start + run.length - 1]) },
    most_common_percent: n ? pct(Math.max(...Object.values(counts)), n) : null,
    active, passive, unclassified: n - active - passive,
    active_passive_ratio: passive ? round(active / passive) : null,
    after_evidence_state: crossTab(steps, targetState, stepModality),
    outcome_by_modality: crossTab(steps, stepModality, evidenceOutcome),
  };
}

// ---------- Repetition / boredom ----------

// Flags runs of boring_run_length or more (same modality, passive, or high effort) and near-duplicate activities:
// the same material_signature, or - when debug summaries exist - token Jaccard >= duplicate_threshold.
// ponytail: duplicates are structural or lexical, not semantic; the reviewer judges meaning.
export function repetitionMetrics(segments, taxonomy) {
  const minRun = taxonomy.boring_run_length || 4, threshold = taxonomy.duplicate_threshold || 0.6;
  const flagged = [], duplicates = [], explanationRuns = [], quizRuns = [];
  let maxPassive = 0, maxHigh = 0, maxCard = 0, within3 = 0;
  const same = (a, b) => (a.material_signature && b.material_signature ? a.material_signature === b.material_signature
    : a.canvas_summary && b.canvas_summary ? jaccard(a.canvas_summary, b.canvas_summary) >= threshold : false);
  for (const segment of segments) {
    const modalities = segment.map(stepModality);
    const at = run => segment.slice(run.start, run.start + run.length).map(ref);
    const flag = (kind, run, pattern) => { if (run.length >= minRun && !flagged.some(entry => JSON.stringify(entry.steps) === JSON.stringify(at(run)))) flagged.push({ id: `seq-${flagged.length + 1}`, kind, steps: at(run), pattern, justified: null }); };
    const truthRuns = test => runsOf(modalities.map(test)).filter(run => run.value);
    for (const run of runsOf(modalities)) flag('same_modality', run, Array(run.length).fill(run.value).join(' -> '));
    for (const [kind, test, track] of [['passive', m => classOf(taxonomy, m)?.mode === 'passive', len => { maxPassive = Math.max(maxPassive, len); }], ['high_effort', m => classOf(taxonomy, m)?.effort === 'high', len => { maxHigh = Math.max(maxHigh, len); }]]) {
      for (const run of truthRuns(test)) { track(run.length); flag(kind, run, modalities.slice(run.start, run.start + run.length).join(' -> ')); }
    }
    for (const run of truthRuns(m => classOf(taxonomy, m)?.family === 'explanation')) if (run.length >= 2) explanationRuns.push({ steps: at(run), length: run.length });
    for (const run of truthRuns(m => classOf(taxonomy, m)?.family === 'quiz')) if (run.length >= 2) quizRuns.push({ steps: at(run), length: run.length });
    maxCard = Math.max(maxCard, longest(runsOf(segment.map(step => decisionOf(step).card_type ?? 'unknown')))?.length ?? 0);
    within3 += modalities.filter((m, i) => modalities.slice(Math.max(0, i - 3), i).includes(m)).length;
    segment.forEach((step, i) => {
      const earlier = segment.slice(0, i).find(other => stepModality(other) === stepModality(step) && same(other, step));
      if (earlier) duplicates.push({ ...ref(step), duplicates: earlier.step });
    });
  }
  return {
    max_identical_card_type_run: maxCard, repeated_modality_within_previous_3: within3, duplicate_activities: duplicates,
    duplicate_method: 'heuristic: same material_signature, else token Jaccard of summaries (structural / lexical, not semantic)',
    explanation_only_sequences: explanationRuns, quiz_only_sequences: quizRuns,
    max_consecutive_passive: maxPassive, max_consecutive_high_effort: maxHigh, flagged_sequences: flagged,
  };
}

// ---------- Hooks (Professor Next Steps) ----------

// ponytail: lexical heuristics. generic_command: an imperative "Learn X" with no question; curiosity: a question that
// is not a command; reveals_answer: text after the question mark, or an answer phrase. The reviewer scores quality.
const COMMAND = /^(learn|study|review|explore|understand|practi[cs]e|read|watch|see|go over|continue|next|dive into|introduction to|intro to|cover|recap)\b/i;
const ANSWERED = /\b(because|which means|the answer is|it turns out|spoiler|so that)\b/i;
export const hookFlags = text => {
  const t = String(text || '').trim();
  const question = t.includes('?');
  return {
    generic_command: COMMAND.test(t) && !question,
    curiosity: question && !COMMAND.test(t),
    reveals_answer: (question && t.slice(t.indexOf('?') + 1).trim().length > 0) || ANSWERED.test(t),
  };
};
export function hookMetrics(segments, taxonomy = {}) {
  const near = taxonomy.hook_repeat_threshold || 0.8;
  const perSet = [], shownCount = {}, pickedCount = {};
  for (const segment of segments) {
    let previous = null, previousIndex = -1;
    segment.forEach((step, index) => {
      const options = step.next_step_options;
      if (!options?.length) return;
      const pairs = [];
      for (let i = 0; i < options.length; i++) for (let j = i + 1; j < options.length; j++) pairs.push(1 - jaccard(options[i].text, options[j].text));
      const repeated = previous ? options.filter(option => previous.some(old => jaccard(old.text, option.text) >= near)).length : 0;
      // Evidence changed anywhere between the previous set and this one.
      const changed = previous ? segment.slice(previousIndex, index).some(evidenceChanged) : false;
      const flags = options.map(option => hookFlags(option.text));
      // A hook's identity across sets: its id when stable, else its normalized text.
      for (const option of options) { const key = option.id ?? option.text.toLowerCase().trim(); shownCount[key] = (shownCount[key] || 0) + 1; }
      const picked = options.find(option => option.id === step.learner_selected_option?.id);
      if (picked) { const key = picked.id ?? picked.text.toLowerCase().trim(); pickedCount[key] = (pickedCount[key] || 0) + 1; }
      perSet.push({
        ...ref(step), size: options.length, distinctness: pairs.length ? round(sum(pairs) / pairs.length) : null,
        repeated_from_previous: repeated,
        repeated_learning_goal: previous ? options.filter(option => option.learning_goal && previous.some(old => old.learning_goal === option.learning_goal)).length : 0,
        generic_commands: flags.filter(flag => flag.generic_command).length, curiosity: flags.filter(flag => flag.curiosity).length, reveals_answer: flags.filter(flag => flag.reveals_answer).length,
        selected_position: step.learner_selected_option?.position ?? null, overridden: !!step.hooks_overridden, state_changed_after_start: !!step.hook_state_changed_after_start,
        unchanged_after_evidence_change: !!previous && changed && repeated === options.length,
      });
      previous = options; previousIndex = index;
    });
  }
  const hooks = sum(perSet.map(set => set.size));
  const total = key => sum(perSet.map(set => set[key]));
  const selected = perSet.filter(set => set.selected_position != null).length;
  const withPrevious = perSet.filter((set, i) => i && perSet[i - 1].session_id === set.session_id);
  return {
    sets: perSet.length, hooks, selected, selection_rate: round(selected / perSet.length),
    overridden_by_typed_request: perSet.filter(set => set.overridden).length,
    selected_position: tally(perSet.filter(set => set.selected_position != null).map(set => String(set.selected_position))),
    mean_distinctness: stats(perSet.map(set => set.distinctness).filter(x => x != null)).mean,
    distinctness_method: 'heuristic: mean pairwise 1 - token Jaccard (lexical, not semantic)',
    flags_method: 'heuristic: lexical patterns for generic commands, curiosity questions and answer-revealing hooks',
    repeated_from_previous: total('repeated_from_previous'), repeated_learning_goal: total('repeated_learning_goal'),
    generic_command_rate: round(total('generic_commands') / hooks), curiosity_rate: round(total('curiosity') / hooks), reveals_answer_rate: round(total('reveals_answer') / hooks),
    stale_suggestion_rate: withPrevious.length ? round(withPrevious.filter(set => set.repeated_from_previous > 0).length / withPrevious.length) : null,
    unchanged_after_evidence_change: perSet.filter(set => set.unchanged_after_evidence_change).length,
    // Generated in the background, then the learner's answer changed the evidence before the pick.
    generated_before_evidence_changed: perSet.filter(set => set.state_changed_after_start).length,
    repeatedly_ignored: Object.keys(shownCount).filter(key => shownCount[key] >= 2 && !pickedCount[key]).length,
    per_set: perSet,
  };
}

// ---------- Reason-code consistency (deterministic where possible) ----------

const PREDICATES = {
  // repair_misconception: a misconception on a targeted concept is in the evidence the decision was made on.
  misconception_on_target: step => claimsIn(step.evidence_before).some(entry => entry.state === 'misconception' && targetsOf(step).has(entry.concept)),
  // fill_prerequisite_gap: a prerequisite gap on, or for, a targeted concept.
  prerequisite_gap: step => claimsIn(step.evidence_before).some(entry => entry.state === 'prerequisite_gap' && (targetsOf(step).has(entry.concept) || targetsOf(step).has(entry.prerequisite))),
  // vary_modality: the previous three decisions actually repeat a modality.
  recent_modality_repetition: (step, i, segment) => { const recent = segment.slice(Math.max(0, i - 3), i).map(stepModality); return recent.length >= 2 && new Set(recent).size < recent.length; },
  // advance_goal: some targeted concept is not yet understood.
  unfinished_target: step => targetState(step) !== 'understood' && targetState(step) !== 'no_target',
};
export function reasonConsistency(segments, taxonomy) {
  const checks = [], unchecked = [];
  for (const segment of segments) segment.forEach((step, i) => {
    for (const code of decisionOf(step).reason_codes || []) {
      const rule = taxonomy.reason_codes?.[code];
      if (!rule?.requires || !PREDICATES[rule.requires]) { unchecked.push({ ...ref(step), code }); continue; }
      checks.push({ ...ref(step), code, requires: rule.requires, ok: PREDICATES[rule.requires](step, i, segment) });
    }
  });
  return { checked: checks.length, violations: checks.filter(check => !check.ok), unchecked, checks };
}

// ---------- Evidence ----------

const signature = step => JSON.stringify([decisionOf(step).action_type, stepModality(step), [...targetsOf(step)].sort()]);
// Tutor steps from the first evidence_after holding `state` on a claim to the first later one where it no longer does.
function repairLatency(segments, state) {
  const repaired = [], unresolved = [];
  for (const segment of segments) {
    const open = {};
    for (const step of segment) for (const [claim, now] of Object.entries(stateMap(step.evidence_after))) {
      if (now === state && open[claim] == null) open[claim] = step.step;
      else if (now !== state && open[claim] != null) { repaired.push({ session_id: step.session_id, claim, detected: open[claim], resolved: step.step, latency: step.step - open[claim], to: now }); delete open[claim]; }
    }
    unresolved.push(...Object.entries(open).map(([claim, detected]) => ({ session_id: segment[0].session_id, claim, detected })));
  }
  return { repaired, latency: stats(repaired.map(entry => entry.latency)), unresolved };
}
export function evidenceMetrics(segments, taxonomy) {
  const steps = segments.flat();
  const transitions = steps.flatMap(step => {
    const before = stateMap(step.evidence_before), after = stateMap(step.evidence_after);
    return Object.keys({ ...before, ...after }).filter(claim => before[claim] !== after[claim]).map(claim => ({ ...ref(step), claim, from: before[claim] ?? null, to: after[claim] ?? null }));
  });
  const kindOf = step => { const kinds = (decisionOf(step).reason_codes || []).map(code => taxonomy.reason_codes?.[code]?.kind); return kinds.includes('remediation') ? 'remediation' : kinds.includes('progression') ? 'progression' : 'other'; };
  const kinds = tally(steps.map(kindOf));
  const seconds = step => step.estimated_learning_seconds || 0;
  const total = sum(steps.map(seconds));
  return {
    concepts_encountered: [...new Set(steps.flatMap(step => [...targetsOf(step), ...claimsIn(step.evidence_after).filter(entry => entry.state !== 'not_yet_observed').map(entry => entry.concept)]))].filter(Boolean),
    claims_tested: [...new Set(steps.flatMap(step => claimsIn(step.evidence_after).filter(entry => entry.state !== 'not_yet_observed').map(entry => entry.claim)))],
    transitions,
    transitions_by_type: tally(transitions.map(entry => `${entry.from} -> ${entry.to}`)),
    misconception_repair: repairLatency(segments, 'misconception'),
    prerequisite_repair: repairLatency(segments, 'prerequisite_gap'),
    already_understood_time_fraction: total ? round(sum(steps.filter(step => targetState(step) === 'understood').map(seconds)) / total) : null,
    progression_steps: kinds.progression || 0, remediation_steps: kinds.remediation || 0,
    progression_remediation_ratio: kinds.remediation ? round((kinds.progression || 0) / kinds.remediation) : null,
    not_yet_observed_at_end: segments.flatMap(segment => claimsIn(segment.at(-1)?.evidence_after).filter(entry => entry.state === 'not_yet_observed').map(entry => ({ session_id: segment[0].session_id, claim: entry.claim }))),
    decisions_unchanged_after_evidence_change: segments.flatMap(segment => segment.filter((step, i) => i && evidenceChanged(segment[i - 1]) && signature(step) === signature(segment[i - 1])).map(ref)),
    by_claim: Object.fromEntries(Object.entries(Object.groupBy(transitions, entry => entry.claim)).map(([claim, list]) => [claim, tally(list.map(entry => entry.to))])),
  };
}

// ---------- Engagement ----------

// active_opportunity_candidates: a passive step after another passive one while an active modality was available.
// A candidate only - the reviewer decides whether it was missed. Modalities never offered are ignored.
export function engagementMetrics(segments, taxonomy) {
  const meaningful = new Set(taxonomy.meaningful_response_kinds || ['answer', 'explanation', 'question', 'activity']);
  const steps = segments.flat();
  const firstActive = segments.map(segment => segment.find(step => isActive(taxonomy, step))?.elapsed_learning_seconds).filter(x => x != null);
  const gaps = segments.flatMap(segment => { const active = segment.filter(step => isActive(taxonomy, step)); return active.slice(1).map((step, i) => step.elapsed_learning_seconds - active[i].elapsed_learning_seconds); });
  return {
    meaningful_learner_actions: steps.filter(step => meaningful.has(step.learner_response?.kind)).length,
    learning_seconds_before_first_active: stats(firstActive),
    segments_without_active: segments.length - firstActive.length,
    learning_seconds_between_active: stats(gaps),
    active_opportunity_candidates: segments.flatMap(segment => segment.filter((step, i) => i && !isActive(taxonomy, step) && !isActive(taxonomy, segment[i - 1])
      && (step.available_modalities || []).some(m => classOf(taxonomy, m)?.mode === 'active')).map(ref)),
  };
}

// ---------- Latency ----------

export const WAIT_BUCKETS = [['lt_2s', 2000], ['2_5s', 5000], ['5_10s', 10000], ['10_30s', 30000], ['30_60s', 60000], ['gt_60s', Infinity]];
export function latencyMetrics(segments, taxonomy) {
  const steps = segments.flat();
  const t = step => step.timing || {};
  const group = keyOf => Object.fromEntries(Object.entries(Object.groupBy(steps, keyOf)).map(([key, list]) => [key, {
    tutor_decision: bySource(list, s => t(s).tutor_decision_ms, s => t(s).sources?.tutor_decision),
    click_to_first_material: bySource(list, s => t(s).click_to_first_material_ms, s => t(s).timing_source),
    click_to_complete_material: bySource(list, s => t(s).click_to_complete_material_ms, s => t(s).timing_source),
  }]));
  const waits = steps.flatMap(step => step.waits || []);
  const waitSeconds = sum(waits.map(wait => wait.ms)) / 1000;
  const learning = sum(steps.map(step => step.estimated_learning_seconds || 0));
  const bySourceSeconds = Object.fromEntries(Object.entries(Object.groupBy(waits, wait => wait.source ?? 'measured')).map(([source, list]) => [source, round(sum(list.map(wait => wait.ms)) / 1000, 1)]));
  // Session start -> the first material that asks the learner to DO something: every earlier wait and learning time,
  // plus that step's own waits. Mixes measured waits with the Tutor's estimated learning time, so both parts are kept.
  const toActive = segments.map(segment => {
    let waited = 0, learned = 0;
    for (const step of segment) {
      waited += sum((step.waits || []).map(wait => wait.ms));
      if (isActive(taxonomy, step)) return { seconds: round(waited / 1000 + learned, 1), wait_seconds: round(waited / 1000, 1), learning_seconds: learned };
      learned += step.estimated_learning_seconds || 0;
    }
    return null;
  }).filter(Boolean);
  return {
    tutor_decision: bySource(steps, s => t(s).tutor_decision_ms, s => t(s).sources?.tutor_decision),
    // Backend generation time and what the learner perceived are different numbers: hooks generated while the
    // learner reads cost backend time, not waiting.
    hooks: bySource(steps, s => t(s).hook_backend_generation_ms, s => t(s).sources?.hooks),
    hook_perceived_wait: bySource(steps, s => t(s).hook_perceived_wait_ms, s => t(s).sources?.hook_wait),
    hook_background_overlap_ms: stats(steps.map(s => t(s).hook_background_overlap_ms).filter(x => x != null)),
    options_blocking: bySource(steps, s => t(s).options_blocking_ms, s => t(s).sources?.hook_wait),
    evaluation: stats(steps.map(s => t(s).evaluation_ms).filter(x => x != null)),
    first_material: bySource(steps, s => t(s).click_to_first_material_ms, s => t(s).timing_source),
    complete_material: bySource(steps, s => t(s).click_to_complete_material_ms, s => t(s).timing_source),
    asset: bySource(steps.filter(s => t(s).sources?.asset), s => t(s).asset_generation_ms, s => t(s).sources.asset),
    by_modality: group(stepModality),
    by_action_type: group(step => decisionOf(step).action_type ?? 'unknown'),
    by_cache_status: Object.fromEntries(Object.entries(Object.groupBy(steps, step => t(step).cache_status ?? 'not_applicable')).map(([key, list]) => [key, bySource(list, s => t(s).material_complete_ms, s => t(s).timing_source)])),
    total_backend_generation_seconds: round(sum(steps.map(s => t(s).backend_generation_ms || 0)) / 1000, 1),
    total_learner_blocking_wait_seconds: round(waitSeconds, 1),
    waiting_time_seconds: round(waitSeconds, 1),
    // The blocking total split by where its numbers came from (estimated = depends on simulated reading time).
    blocking_wait_seconds_by_source: bySourceSeconds,
    lower_bound_waits: waits.filter(wait => wait.lower_bound).length,
    estimated_learning_seconds: learning,
    wait_to_learning_ratio: learning ? round(waitSeconds / learning) : null,
    learner_wait_fraction: waitSeconds + learning ? round(waitSeconds / (waitSeconds + learning)) : null,
    longest_wait_ms: waits.length ? Math.max(...waits.map(wait => wait.ms)) : null,
    wait_buckets: Object.fromEntries(WAIT_BUCKETS.map(([key, top], i) => [key, waits.filter(wait => wait.ms >= (i ? WAIT_BUCKETS[i - 1][1] : 0) && wait.ms < top).length])),
    // One segment: its exact value and parts. Several: the mean, with the distribution beside it.
    time_to_first_active_learning_seconds: stats(toActive.map(entry => entry.seconds)).mean,
    time_to_first_active_learning: toActive.length === 1 ? toActive[0] : { stats: stats(toActive.map(entry => entry.seconds)), segments_without_active: segments.length - toActive.length },
  };
}

// ---------- One group of segments ----------

// A segment's learning graph: the whole session's graph for a session-level segment, else the nodes of its decisions.
const graphs = new WeakMap();
const sessionGraph = meta => { if (!graphs.has(meta)) graphs.set(meta, learningGraph(meta.events)); return graphs.get(meta); };
export function segmentGraph(segments) {
  return mergeGraphs(segments.map(segment => {
    if (segment.meta) return sessionGraph(segment.meta);
    const meta = segment[0]?.session;
    return meta ? subgraph(sessionGraph(meta), new Set(segment.map(step => step.decision_id))) : mergeGraphs([]);
  }));
}

// taxonomy: modality / reason-code / relation / threshold tables; roles: cost categories per model_role (both data).
export function groupMetrics(segments, taxonomy, roles = {}) {
  const steps = segments.flat();
  const records = materialRecords(segments, { roles, taxonomy });
  const sessions = new Set(segments.map(segment => segment.meta?.session_id ?? segment[0]?.session_id).filter(Boolean)).size;
  return {
    segments: segments.length, decisions: steps.length,
    modality: modalityMetrics(segments, taxonomy),
    card_types: tally(steps.map(step => decisionOf(step).card_type ?? 'unknown')),
    reason_codes: tally(steps.flatMap(step => decisionOf(step).reason_codes || [])),
    repetition: repetitionMetrics(segments, taxonomy),
    hooks: hookMetrics(segments, taxonomy),
    reason_consistency: reasonConsistency(segments, taxonomy),
    evidence: evidenceMetrics(segments, taxonomy),
    engagement: engagementMetrics(segments, taxonomy),
    latency: latencyMetrics(segments, taxonomy),
    materials: materialMetrics(records, segments),
    structure: structureMetrics(records, segments, taxonomy),
    cost: costMetrics(segments, roles, records, step => isActive(taxonomy, step)),
    graph: graphMetrics(segmentGraph(segments), { steps, records, taxonomy, sessions }),
  };
}

// Session completion / drop-off: how sessions ended and after how many decisions.
export function completionMetrics(sessions) {
  return {
    end_reasons: tally(sessions.map(({ meta }) => meta.end?.reason ?? 'no_end_event')),
    decisions_at_end: stats(sessions.map(({ meta }) => meta.decisions)),
    learning_seconds_at_end: stats(sessions.map(({ meta }) => meta.learning_seconds)),
  };
}

// event[] -> sessions -> every requested grouping -> global. The same groupMetrics at every level.
export function aggregateEvents(events, taxonomy, { roles = {}, by = ['session', 'canvas', 'board', 'user_canvas', 'user', 'journey', 'section', 'source_resource', 'planner'] } = {}) {
  const sessions = foldSessions(events);
  const groups = {};
  for (const key of by) {
    if (!GROUP_KEYS[key]) throw Error(`unknown grouping ${key}`);
    groups[key] = Object.fromEntries(Object.entries(segmentsBy(sessions, key)).map(([value, segments]) => [value, groupMetrics(segments, taxonomy, roles)]));
  }
  return { sessions: sessions.length, global: groupMetrics(sessions.map(wholeSession), taxonomy, roles), completion: completionMetrics(sessions), groups };
}

// ---------- Variety with purpose ----------

// Diversity only counts as far as it fits. fit = the reviewer's modality_appropriateness on 0..1; repetition the
// reviewer judged justified is not held against a session.
//   score = fit * (diversity + (1 - diversity) * justified_rate)
// A diverse but unfit session scores low; a repetitive session with every repetition justified scores its fit.
// ponytail: one formula, no weights to tune; replace when the owner defines the target.
export function varietyWithPurpose(metrics, review) {
  const diversity = metrics.modality.normalized_entropy;
  const fit = review ? (review.scores.modality_appropriateness - 1) / 4 : null;
  const flagged = metrics.repetition.flagged_sequences.length;
  const justified = review ? (flagged ? review.flagged_sequences.filter(entry => entry.justified).length / flagged : 1) : null;
  return { diversity, fit: round(fit), repetition_justified_rate: round(justified), flagged_sequences: flagged, score: fit == null ? null : round(fit * (diversity + (1 - diversity) * justified)) };
}

// Professor Next Steps on a run, from the product's own next_steps_computed traces and the ledger's cost lines: how often the
// hook planner escalated and why, the first reply's validator rule names, latency and cost per planner role. The rate counts
// the sets that called a planner (a cached set calls none) by their calls, so a set whose escalation failed too (unavailable,
// no trace) still counts as escalated; only its reason and rule names are unknown.
export function nextStepsReport(bundles) {
  const events = bundles.flatMap(bundle => bundle.events);
  const sets = events.filter(e => e.type === 'next_steps_ready'), traced = sets.map(e => e.trace).filter(Boolean);
  const escalated = traced.filter(t => t.runtime.model.escalated), routine = traced.filter(t => !t.runtime.model.escalated);
  const calls = events.filter(e => ['model_call_completed', 'model_call_failed'].includes(e.type) && e.hook_set_id);
  const byRole = Object.fromEntries(Object.entries(Object.groupBy(calls, c => c.model_role)).map(([role, list]) => [role, {
    calls: list.length, failed: list.filter(c => c.type === 'model_call_failed').length, cost_usd: round(sum(list.map(c => c.cost_usd ?? c.held_usd ?? 0)), 6), latency_ms: stats(list.map(c => c.latency_ms)),
  }]));
  const ms = list => stats(list.map(t => t.runtime.timing.total_ms));
  const planned = new Set(calls.map(c => c.hook_set_id)), escalatedSets = new Set(calls.filter(c => c.model_role === 'tutor_next_steps_escalation').map(c => c.hook_set_id));
  const words = sets.flatMap(e => e.options.map(option => option.text.trim().split(/\s+/).filter(Boolean).length));
  return {
    by_session: Object.fromEntries(bundles.map(bundle => [bundle.simulator.profile, {
      decisions: bundle.steps.length, sets_requested: bundle.events.filter(e => e.type === 'next_steps_generation_started').length, sets_shown: bundle.events.filter(e => e.type === 'next_steps_ready' && e.options.length).length,
    }])),
    sets_requested: events.filter(e => e.type === 'next_steps_generation_started').length,
    sets_shown: sets.filter(e => e.options.length).length,
    unavailable: tally(sets.filter(e => e.unavailable).map(e => e.unavailable)),
    escalation_rate: planned.size ? round(escalatedSets.size / planned.size, 4) : null,
    escalations: tally(escalated.map(t => t.runtime.validation.fallback)),
    validator_rules: tally(traced.flatMap(t => t.runtime.validation.repairs)),
    set_ms: { all: ms(traced), routine: ms(routine), escalated: ms(escalated) },
    hook_words: { ...stats(words), by_count: tally(words) },
    by_role: byRole,
    cost_usd: round(sum(Object.values(byRole).map(r => r.cost_usd)), 6),
  };
}

// The evidence path on a run: how the product's evaluation of typed turns came out (status, the rung that answered, the
// escalation policy's reason), the kinds of check it was unsure about (c0_transfer -> transfer, counted once per
// evaluation), the router row each decision took, and per session: runs of consecutive uncertain_unsettled decisions on the
// same claim (the decision's first target claim) with the row and actions that followed, the sections in the order they
// were reached with the claims understood when each was entered, the final claim states and the action mix.
const checkKind = key => key.match(/^c\d+_([a-z]+)/)?.[1] ?? (/^g\d+$/.test(key) ? 'gap' : key);
function unsettledRuns(steps) {
  const runs = [];
  let run = null;
  steps.forEach((step, i) => {
    const d = step.tutor_decision, claim = d?.target_claims?.[0] ?? null;
    if (d?.route_row !== 'uncertain_unsettled') return;
    if (run && run.claim === claim && run.last === i - 1) { run.length++; run.last = i; } else runs.push(run = { claim, from_step: step.step, length: 1, last: i });
  });
  return runs.map(({ last, ...entry }) => {
    const next = steps[last + 1]?.tutor_decision;
    return { ...entry, next_row: next?.route_row ?? null, next_actions: next ? next.actions.map(action => action.action_type) : null };
  });
}
const understood = claims => (claims || []).filter(c => c.state === 'understood').map(c => c.claim);
export function sessionProgress(bundle) {
  const steps = bundle.steps, sections = [];
  for (const step of steps) if (step.section_id && sections.at(-1)?.section_id !== step.section_id) sections.push({ section_id: step.section_id, from_step: step.step, understood_on_entry: understood(step.evidence_before) });
  const runs = unsettledRuns(steps);
  return {
    decisions: steps.length, stop: bundle.simulator.stop_reason, sections,
    final_states: tally((steps.at(-1)?.evidence_after || []).map(c => c.state)),
    actions: tally(steps.flatMap(step => (step.tutor_decision?.actions || []).map(action => action.action_type))),
    unsettled_runs: runs, max_unsettled_run: Math.max(0, ...runs.map(entry => entry.length)),
  };
}
export function evidenceReport(bundles) {
  const evaluations = bundles.flatMap(bundle => bundle.events).filter(e => e.type === 'evidence_updated' && e.evaluation).map(e => e.evaluation);
  const events = evaluations.flatMap(e => e.events);
  return {
    evaluations: evaluations.length,
    status: tally(evaluations.map(e => e.status)),
    evaluator: tally(evaluations.map(e => e.evaluator)),
    escalation: tally(evaluations.map(e => e.escalation?.reason ?? 'none')),
    unsure_checks: tally(evaluations.flatMap(e => [...new Set((e.escalation?.unsure_checks || []).map(checkKind))])),
    events: {
      total: events.length, settled: events.filter(e => e.settled).length,
      by_result: tally(events.map(e => `${e.result}${e.kind ? `:${e.kind}` : ''}`)), settled_by_result: tally(events.filter(e => e.settled).map(e => `${e.result}${e.kind ? `:${e.kind}` : ''}`)),
    },
    route_rows: tally(bundles.flatMap(bundle => bundle.steps.map(step => step.tutor_decision?.route_row ?? 'none'))),
    sessions: Object.fromEntries(bundles.map(bundle => [bundle.simulator.profile, sessionProgress(bundle)])),
  };
}

// ---------- The eval's aggregate.json ----------

// bundles: the simulator's session files ({ simulator: { profile }, events, review? }). Profiles exist only in the
// simulator block; every metric comes from the events through groupMetrics, exactly as for real sessions.
const merge = maps => maps.reduce((acc, map) => { for (const [key, n] of Object.entries(map)) acc[key] = (acc[key] || 0) + n; return acc; }, {});
const omit = (object, ...keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));
export function aggregate(bundles, taxonomy, { cost = null, roles = {} } = {}) {
  const rows = bundles.map(bundle => {
    const [session] = foldSessions(bundle.events);
    return { profile: bundle.simulator.profile, topic: bundle.simulator.topic, session, metrics: groupMetrics([wholeSession(session)], taxonomy, roles), review: bundle.review?.scores ? bundle.review : null };
  });
  const global = groupMetrics(rows.map(row => wholeSession(row.session)), taxonomy, roles);
  const graphSummary = graph => ({
    total_nodes: graph.node_count, main_path_length: graph.main_path_length, branch_count: graph.branch_node_count, max_breadth: graph.max_breadth, max_depth: graph.max_depth,
    shape: graph.shape, rabbit_hole_count: graph.rabbit_holes.count, rabbit_hole_max_depth: graph.rabbit_holes.max_depth,
    edges_by_created_by: graph.edges_by_created_by, branching_by_created_by: graph.branching_by_created_by,
    modality_by_depth: graph.modality_by_depth, evidence_outcome_by_position: graph.evidence_outcome_by_position,
  });
  const by = fn => Object.fromEntries(rows.map(row => [row.profile, fn(row)]));
  const reasonByModality = {};
  for (const { session } of rows) for (const step of session.steps) for (const code of decisionOf(step).reason_codes || []) {
    const modality = stepModality(step);
    reasonByModality[modality] = { ...reasonByModality[modality], [code]: (reasonByModality[modality]?.[code] || 0) + 1 };
  }
  const reviewed = rows.filter(row => row.review);
  return {
    taxonomy: { provisional: !!taxonomy.provisional, source: taxonomy.source ?? null },
    profiles: by(({ topic, session }) => ({ topic, session_id: session.meta.session_id, decisions: session.meta.decisions, learning_seconds: session.meta.learning_seconds, end: session.meta.end })),
    modality_histogram: { ...by(({ metrics }) => metrics.modality.counts), all: merge(rows.map(row => row.metrics.modality.counts)) },
    modality_diversity: by(({ metrics }) => omit(metrics.modality, 'counts', 'percent')),
    card_type_histogram: { ...by(({ metrics }) => metrics.card_types), all: merge(rows.map(row => row.metrics.card_types)) },
    reason_code_histogram: { ...by(({ metrics }) => metrics.reason_codes), all: merge(rows.map(row => row.metrics.reason_codes)) },
    reason_by_modality: reasonByModality,
    reason_consistency: by(({ metrics }) => ({ checked: metrics.reason_consistency.checked, violations: metrics.reason_consistency.violations, unchecked: metrics.reason_consistency.unchecked.length })),
    repetition_metrics: by(({ metrics }) => omit(metrics.repetition, 'flagged_sequences')),
    hook_metrics: by(({ metrics }) => omit(metrics.hooks, 'per_set')),
    evidence_metrics: by(({ metrics }) => metrics.evidence),
    engagement_metrics: by(({ metrics }) => metrics.engagement),
    latency_metrics: by(({ metrics }) => metrics.latency),
    review_scores: {
      ...by(({ review }) => review?.scores ?? null),
      mean: reviewed.length ? Object.fromEntries(Object.keys(reviewed[0].review.scores).map(key => [key, round(sum(reviewed.map(row => row.review.scores[key])) / reviewed.length, 2)])) : null,
    },
    variety_with_purpose: by(({ metrics, review }) => varietyWithPurpose(metrics, review)),
    notable_sequences: rows.flatMap(({ profile, metrics, review }) => metrics.repetition.flagged_sequences.map(entry => ({ profile, ...entry, justified: review?.flagged_sequences.find(judged => judged.id === entry.id)?.justified ?? null }))),
    completion: completionMetrics(rows.map(row => row.session)),
    // Product cost from the events (eval-only calls apart); `ledger` is the run's actual API spend under the ceiling.
    cost_metrics: { ...omit(global.cost, 'decision_costs'), by_profile: by(({ metrics }) => omit(metrics.cost, 'decision_costs', 'by_session', 'by_canvas', 'by_user_canvas')), ledger: cost },
    material_metrics: { all: global.materials, by_profile: by(({ metrics }) => metrics.materials) },
    structure_metrics: { all: omit(global.structure, 'reading_load_before_first_active'), by_profile: by(({ metrics }) => metrics.structure) },
    graph_metrics_by_profile: by(({ metrics }) => metrics.graph),
    graph_comparison: by(({ metrics }) => graphSummary(metrics.graph)),
  };
}

// ---------- Reports ----------

const cell = value => (value == null ? '-' : typeof value === 'object' ? JSON.stringify(value) : String(value));
export function terminalTable(agg) {
  const columns = [
    ['profile', p => p], ['steps', p => agg.profiles[p].decisions], ['learn_min', p => round(agg.profiles[p].learning_seconds / 60, 1)],
    ['modalities', p => agg.modality_diversity[p].distinct], ['entropy', p => agg.modality_diversity[p].normalized_entropy],
    ['max_run', p => agg.modality_diversity[p].max_run?.length], ['active:passive', p => `${agg.modality_diversity[p].active}:${agg.modality_diversity[p].passive}`],
    ['hook_distinct', p => agg.hook_metrics[p].mean_distinctness], ['curiosity', p => agg.hook_metrics[p].curiosity_rate],
    ['reason_viol', p => agg.reason_consistency[p].violations.length], ['decide_p50_ms', p => agg.latency_metrics[p].tutor_decision.measured?.p50],
    ['wait_frac', p => agg.latency_metrics[p].learner_wait_fraction], ['review_fit', p => agg.review_scores[p]?.modality_appropriateness], ['vwp', p => agg.variety_with_purpose[p].score],
  ];
  const profiles = Object.keys(agg.profiles);
  const grid = [columns.map(([name]) => name), ...profiles.map(p => columns.map(([, get]) => cell(get(p))))];
  const widths = columns.map((_, c) => Math.max(...grid.map(row => row[c].length)));
  return grid.map(row => row.map((value, c) => value.padEnd(widths[c])).join('  ')).join('\n');
}

const csvCell = value => { const s = value == null ? '' : Array.isArray(value) ? value.join('|') : String(value); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function stepsCsv(sessions) {
  const header = ['session_id', 'user_id', 'canvas_id', 'step', 'decision_id', 'elapsed_learning_seconds', 'action_type', 'modality', 'card_type', 'reason_codes', 'target_concepts', 'selected_position', 'learner_kind', 'estimated_learning_seconds', 'hooks_ms', 'tutor_decision_ms', 'click_to_first_material_ms', 'click_to_complete_material_ms', 'timing_source', 'cache_status'];
  const rows = sessions.flatMap(({ steps }) => steps.map(step => {
    const d = decisionOf(step), t = step.timing || {};
    return [step.session_id, step.user_id, step.canvas_id, step.step, step.decision_id, step.elapsed_learning_seconds, d.action_type, d.modality, d.card_type, d.reason_codes, d.target_concepts, step.learner_selected_option?.position, step.learner_response?.kind, step.estimated_learning_seconds, t.hooks_ms, t.tutor_decision_ms, t.click_to_first_material_ms, t.click_to_complete_material_ms, t.timing_source, t.cache_status];
  }));
  return `${[header, ...rows].map(row => row.map(csvCell).join(',')).join('\n')}\n`;
}
