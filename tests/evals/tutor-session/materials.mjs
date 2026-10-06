// Material / card telemetry (docs/features/tutor-decision-eval.md §Materials): one record per logical material
// (a stable material_id; a composite card's subcards are its structure, never extra materials or decisions), built
// from the generic material events - lifecycle (generation_started .. complete / failed), what the learner did
// (visibility, interactions, completed, abandoned) and the producer's descriptors and subcard structure.
// Five durations are kept apart and never interchanged:
//   authored    how long the content itself is (a 15 s video; a card's reading estimate)
//   generation  how long the product took to make it
//   dwell       how long it stayed visible
//   active      how long the learner was actually interacting (client-reported active_ms, never guessed)
//   completion  first visible -> the learning action finished
// No raw text is needed: subcards carry counts (describeText) and content hashes (contentHash).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { evidenceDelta, round, stateMap, stats, sum, tally } from './events.mjs';
import { materialCost } from './cost.mjs';

// ---------- Producer-side helpers (counts instead of text) ----------

// Reading time is an ESTIMATE from a versioned, configurable rate (reading-estimate.json: evaluation default, 230 wpm,
// reading-v1), never learner truth. Measured dwell and engagement supersede it wherever they exist.
// ponytail: one rate for every learner and language; a per-locale or per-learner estimate version when there is one.
export const READING_ESTIMATE = JSON.parse(readFileSync(new URL('reading-estimate.json', import.meta.url), 'utf8'));
export function describeText(text, estimate = READING_ESTIMATE) {
  const value = String(text ?? '');
  const words = value.match(/\S+/g)?.length ?? 0;
  return {
    character_count: value.length, word_count: words,
    sentence_count: value.split(/[.!?]+(?=\s|$)/).filter(part => part.trim()).length,
    paragraph_count: value.split(/\n\s*\n/).filter(part => part.trim()).length,
    estimated_reading_seconds: round((words / estimate.words_per_minute) * 60, 1),
    reading_estimate: { words_per_minute: estimate.words_per_minute, estimate_version: estimate.estimate_version, source: estimate.source },
  };
}
// A normalized hash, so repeated headings or content are detectable without storing the text.
export const contentHash = text => createHash('sha256').update(String(text ?? '').trim().toLowerCase().replace(/\s+/g, ' ')).digest('hex').slice(0, 16);

// ---------- One material record ----------

const ATTEMPTS = new Set(['attempt', 'submit']);
const PLAYBACK = new Set(['play', 'pause', 'seek', 'replay', 'stop', 'ended']);
// State-changing manipulation; a pointer move is never sent as an interaction, and `meaningful: false` marks the rest.
const MANIPULATION = new Set(['slider', 'drag', 'select', 'click', 'param', 'reset', 'zoom', 'pan', 'expand', 'scroll', 'sketch', 'edit', 'flip', 'control']);
const secs = ms => (ms == null ? null : round(ms / 1000, 1));
const since = (from, to) => (from == null || to == null ? null : secs(to - from));
const ratio = (a, b) => (a == null || !b ? null : round(a / b, 3));

function playback(events, duration, firstVisible) {
  const of = kind => events.filter(event => event.interaction === kind);
  if (!events.some(event => PLAYBACK.has(event.interaction))) return null;
  const firstEnded = of('ended')[0]?.t_ms;
  const positions = events.map(event => event.position_seconds).filter(Number.isFinite);
  const furthest = positions.length ? Math.max(...positions) : null;
  const completion = duration && furthest != null ? round(Math.min(100, (furthest / duration) * 100), 1) : null;
  const toEnd = of('ended').length > 0 || (completion != null && completion >= 98);
  return {
    // A video watched twice stays its own length: content duration is authored, playback is what was played.
    total_playback_seconds: round(sum(events.map(event => event.played_seconds || 0)), 1),
    playback_completion_percent: completion,
    play_count: of('play').length, replay_count: of('replay').length + (firstEnded == null ? 0 : of('play').filter(event => event.t_ms > firstEnded).length),
    pause_count: of('pause').length, seek_count: of('seek').length, stop_count: of('stop').length,
    first_play_delay_seconds: since(firstVisible, of('play')[0]?.t_ms),
    watched_to_end: toEnd, stopped_early_at_seconds: !toEnd && positions.length ? positions.at(-1) : null,
  };
}

function structureOf(material, taxonomy) {
  const subcards = material.structure?.subcards;
  if (!Array.isArray(subcards) || !subcards.length) return null;
  const limits = taxonomy.structure_review || {};
  const cls = sub => taxonomy.modalities?.[sub.subcard_type] || null;
  const active = sub => cls(sub)?.mode === 'active';
  const textHeavy = sub => !active(sub) && (sub.word_count ?? 0) >= (limits.text_heavy_min_words ?? 40);
  const runOf = test => subcards.reduce((acc, sub) => { acc.now = test(sub) ? acc.now + 1 : 0; acc.max = Math.max(acc.max, acc.now); return acc; }, { now: 0, max: 0 }).max;
  const chars = subcards.map(sub => sub.character_count).filter(Number.isFinite), words = subcards.map(sub => sub.word_count).filter(Number.isFinite);
  const firstActive = subcards.findIndex(active);
  const before = firstActive < 0 ? subcards : subcards.slice(0, firstActive);
  const types = subcards.map(sub => sub.subcard_type ?? 'unknown');
  const charStats = stats(chars);
  return {
    is_composite: material.structure.is_composite ?? subcards.length > 1, subcard_count: subcards.length,
    subcard_ids: subcards.map((sub, i) => sub.subcard_id ?? `${material.material_id}:s${i + 1}`), subcard_sequence: types,
    split_reason: material.structure.split_reason ?? 'unknown', parent_material_id: material.parent_material_id ?? material.structure.parent_material_id ?? null, material_group_id: material.material_group_id ?? material.structure.material_group_id ?? null,
    total_character_count: sum(chars), total_word_count: sum(words), total_sentence_count: sum(subcards.map(sub => sub.sentence_count || 0)),
    total_estimated_reading_seconds: round(sum(subcards.map(sub => sub.estimated_reading_seconds || 0)), 1),
    // Which reading estimates the totals rest on (estimated, versioned): never mixed silently with measurements.
    reading_estimate_versions: [...new Set(subcards.map(sub => sub.reading_estimate?.estimate_version).filter(Boolean))],
    mean_characters_per_subcard: charStats.mean, median_characters_per_subcard: charStats.p50, max_characters_in_subcard: charStats.max, min_characters_in_subcard: chars.length ? Math.min(...chars) : null,
    mean_words_per_subcard: stats(words).mean, max_words_in_subcard: stats(words).max,
    explanation_subcard_count: subcards.filter(sub => cls(sub)?.family === 'explanation').length,
    max_consecutive_text_heavy: runOf(textHeavy), longest_text_only_run: runOf(sub => !active(sub)),
    modality_transitions: types.filter((type, i) => i && type !== types[i - 1]).length,
    has_active_subcard: firstActive >= 0, subcards_before_first_active: firstActive < 0 ? subcards.length : firstActive,
    characters_before_first_active: sum(before.map(sub => sub.character_count || 0)), words_before_first_active: sum(before.map(sub => sub.word_count || 0)),
    reading_seconds_before_first_active: round(sum(before.map(sub => sub.estimated_reading_seconds || 0)), 1),
    subcards,
  };
}

// The authored length and what it was measured from: media duration, else the card's reading estimate, else the Tutor's.
function authored(material, structure, step) {
  const d = material.descriptors || {};
  for (const [key, basis] of [['content_duration_seconds', 'content_duration'], ['clip_duration_seconds', 'clip_duration'], ['duration_seconds', 'duration']]) if (Number.isFinite(d[key])) return [d[key], basis];
  if (structure?.total_estimated_reading_seconds) return [structure.total_estimated_reading_seconds, 'estimated_reading'];
  const estimate = material.estimated_learning_seconds ?? step.estimated_learning_seconds;
  return Number.isFinite(estimate) ? [estimate, 'tutor_estimate'] : [null, null];
}

export function materialRecord(step, material, { roles, taxonomy }) {
  const events = (material.learner_events || []).toSorted((a, b) => a.t_ms - b.t_ms);
  const interactions = events.filter(event => event.type === 'material_interaction');
  const meaningful = interactions.filter(event => event.meaningful !== false);
  const of = kind => interactions.filter(event => event.interaction === kind);
  const visible = events.filter(event => event.type === 'material_visibility');
  const firstVisible = visible.find(event => event.visible)?.t_ms ?? null;
  const completedAt = events.find(event => event.type === 'material_completed')?.t_ms ?? null;
  const abandonedAt = events.find(event => event.type === 'material_abandoned')?.t_ms ?? null;
  const end = completedAt ?? abandonedAt ?? events.at(-1)?.t_ms ?? null;
  // Dwell: visible intervals; one still open closes at the material's last event.
  let dwell = null, shownAt = null;
  for (const event of visible) {
    if (event.visible && shownAt == null) shownAt = event.t_ms;
    else if (!event.visible && shownAt != null) { dwell = (dwell || 0) + event.t_ms - shownAt; shownAt = null; }
  }
  if (shownAt != null && end != null) dwell = (dwell || 0) + Math.max(0, end - shownAt);
  const activeReported = interactions.filter(event => Number.isFinite(event.active_ms));
  const active = activeReported.length ? secs(sum(activeReported.map(event => event.active_ms))) : null;
  const elapsed = since(firstVisible, end);
  const attempts = interactions.filter(event => ATTEMPTS.has(event.interaction));
  const graded = attempts.filter(event => event.result === 'correct' || event.result === 'incorrect');
  const runs = of('run');
  const structure = structureOf(material, taxonomy);
  const [authoredSeconds, authoredBasis] = authored(material, structure, step);
  const source = material.timing_source ?? 'not_run';
  const generation = source === 'measured' ? since(material.started_at, material.complete_at) : source === 'cached' || source === 'estimated' ? secs(material.durations?.complete_ms) : null;
  const d = material.descriptors || {};
  const claims = material.claim_ids?.length ? material.claim_ids : null;
  const delta = evidenceDelta(step.evidence_before, step.evidence_after, claims);
  const pick = evidence => (claims ? Object.fromEntries(Object.entries(stateMap(evidence)).filter(([id]) => claims.includes(id))) : null);
  const cost = materialCost(step, material, roles);
  const sources = new Set(events.map(event => event.timing_source).filter(Boolean));
  const record = {
    material_id: material.material_id, decision_id: step.decision_id, session_id: step.session_id, user_id: step.user_id, canvas_id: step.canvas_id,
    journey_id: step.journey_id, section_id: step.section_id, dive_id: step.dive_id, planner_version: step.planner_version,
    concept_ids: material.concept_ids ?? step.tutor_decision?.target_concepts ?? [], claim_ids: material.claim_ids ?? [],
    material_type: material.material_type ?? null, modality: material.modality ?? step.tutor_decision?.modality ?? null,
    status: material.status, successful: material.status === 'generated', error_code: material.error_code ?? null,
    cache_status: material.cache_status ?? 'not_applicable', cache_origin: material.cache_origin ?? null,
    created_at: material.complete_at ?? material.failed_at ?? null, first_visible_at: firstVisible,
    first_interaction_at: interactions[0]?.t_ms ?? null, first_meaningful_interaction_at: meaningful[0]?.t_ms ?? null,
    completed_at: completedAt, abandoned_at: abandonedAt,
    // The five durations, never interchanged; engagement_source says whether the learner side was measured or simulated.
    authored_duration_seconds: authoredSeconds, authored_duration_basis: authoredBasis,
    authored_duration_source: authoredBasis === 'estimated_reading' || authoredBasis === 'tutor_estimate' ? 'estimated' : authoredBasis ? 'authored' : null,
    generation_seconds: generation, generation_source: source,
    time_to_first_playable_seconds: source === 'measured' ? since(material.started_at, material.first_ready_at ?? material.complete_at) : null,
    asset_generation_seconds: source === 'measured' ? since(material.started_at, material.asset_at) : null,
    dwell_seconds: secs(dwell), active_engagement_seconds: active, completion_seconds: since(firstVisible, completedAt),
    actual_elapsed_seconds: elapsed, idle_seconds: active != null && elapsed != null ? round(Math.max(0, elapsed - active), 1) : null,
    estimated_learning_seconds: material.estimated_learning_seconds ?? step.estimated_learning_seconds ?? null,
    engagement_source: !events.length ? null : sources.has('estimated') ? 'estimated' : 'measured',
    was_seen: firstVisible != null, was_interacted_with: meaningful.length > 0, was_completed: completedAt != null,
    was_skipped: material.status === 'generated' && (firstVisible == null || (abandonedAt != null && !meaningful.length)),
    was_revisited: visible.filter(event => event.visible).length > 1,
    interaction_count: meaningful.length, raw_interaction_count: interactions.length, interactions_by_kind: tally(interactions.map(event => event.interaction)),
    distinct_controls_used: new Set(meaningful.map(event => event.control_id).filter(Boolean)).size,
    state_changes_count: interactions.filter(event => MANIPULATION.has(event.interaction)).length,
    meaningful_state_changes_count: meaningful.filter(event => MANIPULATION.has(event.interaction)).length,
    ask_about_this_count: of('ask_about_this').length,
    time_to_first_interaction_seconds: since(firstVisible, interactions[0]?.t_ms), time_to_first_meaningful_action_seconds: since(firstVisible, meaningful[0]?.t_ms),
    attempt_count: attempts.length, correct_count: graded.filter(event => event.result === 'correct').length, incorrect_count: graded.filter(event => event.result === 'incorrect').length,
    hint_count: of('hint').length, retry_count: Math.max(0, attempts.length - 1),
    first_attempt_correct: graded.length ? attempts[0].result === 'correct' : null, eventual_correct: graded.length ? graded.some(event => event.result === 'correct') : null,
    time_to_first_attempt_seconds: since(firstVisible, attempts[0]?.t_ms), time_to_correct_attempt_seconds: since(firstVisible, attempts.find(event => event.result === 'correct')?.t_ms),
    run_count: runs.length, successful_run_count: runs.filter(event => event.result === 'success').length, failed_run_count: runs.filter(event => event.result === 'failure').length,
    time_to_first_run_seconds: since(firstVisible, runs[0]?.t_ms), time_to_first_success_seconds: since(firstVisible, runs.find(event => event.result === 'success')?.t_ms),
    time_to_first_edit_seconds: since(firstVisible, of('edit')[0]?.t_ms),
    flip_count: of('flip').length, known_count: interactions.filter(event => event.result === 'known').length, missed_count: interactions.filter(event => event.result === 'missed').length,
    cards_viewed: new Set([...of('flip'), ...of('view')].map(event => event.control_id).filter(Boolean)).size,
    voice_paused_count: of('voice_paused').length, voice_resumed_ok: of('voice_resumed').length ? of('voice_resumed').every(event => event.result !== 'failure') : null,
    ...playback(interactions, d.content_duration_seconds ?? d.clip_duration_seconds ?? d.duration_seconds ?? null, firstVisible),
    descriptors: d, structure,
    evidence_before: pick(step.evidence_before), expected_evidence: material.expected_evidence ?? step.tutor_decision?.expected_evidence ?? null, evidence_after: pick(step.evidence_after),
    evidence_changed: delta.changed, misconception_repaired: delta.misconception_repaired.length > 0, prerequisite_gap_repaired: delta.prerequisite_gap_repaired.length > 0,
    claims_improved: delta.improved.length, claims_regressed: delta.regressed.length,
    cost,
  };
  record.was_replayed = (record.replay_count || 0) > 0;
  // Descriptive proxies, never causal: value = claims the evidence improved on.
  Object.assign(record, {
    engagement_ratio: ratio(active, elapsed),
    completion_ratio: record.playback_completion_percent != null ? round(record.playback_completion_percent / 100, 3) : record.was_completed ? 1 : abandonedAt != null ? 0 : null,
    cost_per_engaged_minute: active ? round(cost.material_attributed_total_cost_usd / (active / 60), 6) : null,
    generation_time_to_content_time_ratio: ratio(generation, authoredSeconds),
    learning_value_per_second: ratio(record.claims_improved, elapsed),
    learning_value_per_dollar: cost.material_attributed_total_cost_usd ? round(record.claims_improved / cost.material_attributed_total_cost_usd, 3) : null,
  });
  return record;
}

export const materialRecords = (segments, context) => segments.flat().flatMap(step => (step.materials || []).map(material => materialRecord(step, material, context)));

// ---------- Aggregates ----------

// Every numeric field gets stats, every boolean a rate - one generic summary for every material type, so a new type
// needs no code. Timestamps (*_at) are positions on a session timeline, not durations, and are left out.
export function summarize(records) {
  const numbers = {}, booleans = {};
  for (const record of records) {
    const flat = { ...record, direct_cost_usd: record.cost?.direct_material_cost_usd, attributed_cost_usd: record.cost?.material_attributed_total_cost_usd, ...Object.fromEntries(Object.entries(record.descriptors || {}).map(([key, value]) => [`descriptor.${key}`, value])) };
    for (const [key, value] of Object.entries(flat)) {
      if (key.endsWith('_at')) continue;
      if (typeof value === 'number' && Number.isFinite(value)) (numbers[key] ||= []).push(value);
      else if (typeof value === 'boolean') (booleans[key] ||= []).push(value);
    }
  }
  return {
    ...Object.fromEntries(Object.entries(numbers).map(([key, values]) => [key, stats(values)])),
    ...Object.fromEntries(Object.entries(booleans).map(([key, values]) => [key, { rate: round(values.filter(Boolean).length / values.length, 3), n: values.length }])),
  };
}

export function materialMetrics(records, segments) {
  const group = keyOf => Object.fromEntries(Object.entries(Object.groupBy(records, keyOf)).map(([key, list]) => [key, { count: list.length, ...summarize(list) }]));
  const steps = segments.flat();
  return {
    count: records.length, by_status: tally(records.map(record => record.status)),
    successful_count: records.filter(record => record.successful).length, completed_count: records.filter(record => record.was_completed).length,
    // A decision whose material was never generated (not_run Motion/Avatar, or none) is counted, not given a record.
    decisions_without_material: tally(steps.filter(step => !(step.materials || []).length).map(step => step.tutor_decision?.modality ?? 'unknown')),
    by_modality: group(record => record.modality ?? 'unknown'),
    by_material_type: group(record => record.material_type ?? 'unknown'),
  };
}

const CHARACTER_BINS = [100, 250, 500, 1000, 2000, Infinity];
const binOf = n => { const top = CHARACTER_BINS.find(edge => n < edge); const low = CHARACTER_BINS[CHARACTER_BINS.indexOf(top) - 1] ?? 0; return top === Infinity ? `${low}+` : `${low}-${top}`; };

// Content shape: how the Tutor packages what it teaches. Flags are for review only (justified: null).
export function structureMetrics(records, segments, taxonomy) {
  const limits = taxonomy.structure_review || {};
  const shaped = records.filter(record => record.structure);
  const subcards = shaped.flatMap(record => record.structure.subcards.map(sub => ({ ...sub, material_id: record.material_id })));
  const decisions = segments.flat().length;
  const cardSize = Object.fromEntries(Object.entries(Object.groupBy(subcards, sub => sub.subcard_type ?? 'unknown')).map(([type, list]) => {
    const numeric = {};
    for (const sub of list) for (const [key, value] of Object.entries(sub)) {
      if (typeof value === 'number' && Number.isFinite(value)) (numeric[key] ||= []).push(value);
      else if (Array.isArray(value) && value.every(Number.isFinite)) (numeric[key] ||= []).push(...value);
    }
    return [type, { count: list.length, ...Object.fromEntries(Object.entries(numeric).filter(([key]) => key !== 'index').map(([key, values]) => [key, stats(values)])), character_histogram: tally(list.filter(sub => Number.isFinite(sub.character_count)).map(sub => binOf(sub.character_count))) }];
  }));
  const active = sub => taxonomy.modalities?.[sub.subcard_type]?.mode === 'active';
  const explanation = sub => taxonomy.modalities?.[sub.subcard_type]?.family === 'explanation';
  // Reading load before the first active element, per segment, in teaching order (materials, then their subcards). A
  // material without structure that is active ends the count; a passive one without structure makes it incomplete.
  const loads = segments.map(segment => {
    const load = { session_id: segment[0]?.session_id ?? null, characters: 0, words: 0, reading_seconds: 0, subcards: 0, reached_active: false, incomplete: false };
    outer: for (const step of segment) for (const record of records.filter(entry => entry.decision_id === step.decision_id)) {
      if (!record.structure) {
        if (taxonomy.modalities?.[record.modality]?.mode === 'active') { load.reached_active = true; break outer; }
        load.incomplete = true; continue;
      }
      for (const sub of record.structure.subcards) {
        if (active(sub)) { load.reached_active = true; break outer; }
        Object.assign(load, { characters: load.characters + (sub.character_count || 0), words: load.words + (sub.word_count || 0), reading_seconds: round(load.reading_seconds + (sub.estimated_reading_seconds || 0), 1), subcards: load.subcards + 1 });
      }
    }
    return load;
  });
  const flags = [];
  const flag = (kind, record, value, threshold, extra = {}) => flags.push({ id: `shape-${flags.length + 1}`, kind, material_id: record?.material_id ?? null, decision_id: record?.decision_id ?? null, value, threshold, justified: null, ...extra });
  for (const record of shaped) {
    for (const sub of record.structure.subcards) if (explanation(sub) && (sub.character_count ?? 0) >= (limits.long_card_characters ?? 1200)) flag('very_long_explanation_card', record, sub.character_count, limits.long_card_characters ?? 1200, { subcard_index: sub.index });
    if (record.structure.subcard_count >= (limits.fragment_min_subcards ?? 5) && (record.structure.median_characters_per_subcard ?? Infinity) < (limits.fragment_max_median_characters ?? 120)) flag('excessive_fragmentation', record, record.structure.subcard_count, limits.fragment_min_subcards ?? 5);
  }
  // Explanation runs and repeated content are read across materials, in order, within a segment.
  for (const segment of segments) {
    const ordered = segment.flatMap(step => records.filter(entry => entry.decision_id === step.decision_id && entry.structure).flatMap(record => record.structure.subcards.map(sub => ({ sub, record }))));
    let run = [];
    for (const item of [...ordered, null]) {
      if (item && explanation(item.sub)) { run.push(item); continue; }
      if (run.length >= (limits.explanation_run_length ?? 3)) flag('explanation_subcard_run', run[0].record, run.length, limits.explanation_run_length ?? 3, { material_ids: [...new Set(run.map(entry => entry.record.material_id))] });
      run = [];
    }
    const seen = {};
    for (const { sub, record } of ordered) for (const hash of [sub.content_hash, sub.heading_hash].filter(Boolean)) {
      if (seen[hash]) flag('repeated_content', record, hash, null, { first_material_id: seen[hash] }); else seen[hash] = record.material_id;
    }
  }
  for (const load of loads) if (load.reading_seconds >= (limits.reading_before_active_seconds ?? 180)) flags.push({ id: `shape-${flags.length + 1}`, kind: 'high_reading_load_before_active', session_id: load.session_id, value: load.reading_seconds, threshold: limits.reading_before_active_seconds ?? 180, justified: null });
  const learning = sum(segments.flat().map(step => step.estimated_learning_seconds || 0));
  const engaged = sum(records.map(record => record.active_engagement_seconds || 0));
  const meaningful = sum(records.map(record => record.interaction_count));
  const characters = sum(subcards.map(sub => sub.character_count || 0)), words = sum(subcards.map(sub => sub.word_count || 0));
  return {
    materials_with_structure: shaped.length, materials_without_structure: records.length - shaped.length, subcards: subcards.length,
    average_subcards_per_tutor_decision: decisions ? round(subcards.length / decisions, 2) : null,
    average_explanation_subcards_per_decision: decisions ? round(subcards.filter(explanation).length / decisions, 2) : null,
    composite_materials: shaped.filter(record => record.structure.is_composite).length,
    split_reasons: tally(shaped.filter(record => record.structure.is_composite).map(record => record.structure.split_reason)),
    subcard_sequences: tally(shaped.map(record => record.structure.subcard_sequence.join(' > '))),
    card_size_by_type: cardSize,
    reading_load_before_first_active: { segments: loads, characters: stats(loads.map(load => load.characters)), words: stats(loads.map(load => load.words)), reading_seconds: stats(loads.map(load => load.reading_seconds)) },
    characters_per_learning_minute: learning ? round(characters / (learning / 60), 1) : null,
    characters_per_engaged_minute: engaged ? round(characters / (engaged / 60), 1) : null,
    reading_seconds_per_active_interaction: meaningful ? round(sum(subcards.map(sub => sub.estimated_reading_seconds || 0)) / meaningful, 1) : null,
    text_to_interaction_ratio: meaningful ? round(words / meaningful, 1) : null,
    review_flags: flags,
  };
}
