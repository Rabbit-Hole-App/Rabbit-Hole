// Tutor and learning metrics for the owner dashboard (docs/features/telemetry.md "Tutor evidence"; brief Task 12; plan
// C:/s/spec/telemetry/task12-tutor-evidence-plan.md section 5, with owner decisions A to F). Reads only the telemetry database:
// the learning_* projections of the Tutor's own records and the tutor.* events. Every metric reports its numerator, its denominator
// and the basis it rests on, so a rate is never shown without what it is a rate of. Unmeasurable things are said to be, not
// estimated: difficulty (no such field, decision A), completion of a hook beyond the turn that selected it, a confirmed premature
// progression, and human-reviewed grading quality (decision E: unavailable, nothing is collected for it).
//
// "Valid" means an observation whose assessment completed, whose validity is valid, that is not in conflict, and whose assessment
// no later completed assessment supersedes. AI assessed is not verified: outcomes are always grouped by how they were produced
// (route: keyed is a deterministic rubric match; jev and larger are AI evaluators) and by evaluator_version.
// Hook outcomes: selected is a recorded choice; superseded only when a LATER set was shown on the same surface (verified); a
// shown set with neither stays unknown. The absence of a selection is never read as rejection.
import { deriveCriterionSummary } from '../../web/src/learn-coaching-contract.js';

const DAY = 86400;
const REPAIR = ['repair_misconception', 'fill_prerequisite_gap', 'deepen_mechanism', 'increase_interactivity', 'reduce_cognitive_load'];
const TUTOR_FEATURES = ['tutor', 'tutor_evaluate', 'next_steps', 'shared_next_steps', 'handoff'];
const EVENT_LIMIT = 20000;
const all = async statement => (await statement.all()).results || [];
const metric = (id, label, definition, numerator, denominator, extra = {}) => ({ id, label, definition, numerator, denominator, rate: denominator ? numerator / denominator : null, ...extra });
const median = list => { if (!list.length) return null; const sorted = [...list].sort((a, b) => a - b), mid = sorted.length >> 1; return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; };

// A valid observation, with the basis of its assessment. CTE shared by the evidence queries.
const VALID = `valid AS (
  SELECT o.*, a.route, a.evaluator_version,
    ROW_NUMBER() OVER (PARTITION BY o.user_ref, o.goal_id, o.criterion_id, o.criterion_version ORDER BY o.observed_s, o.id) AS n
  FROM learning_observations o JOIN learning_assessments a ON a.id = o.assessment_id
  WHERE a.status = 'completed' AND o.validity = 'valid' AND COALESCE(o.conflict, 0) = 0
    AND NOT EXISTS (SELECT 1 FROM learning_assessments s WHERE s.supersedes_assessment_id = o.assessment_id AND s.status = 'completed'))`;

async function evidenceMetrics(db, sinceS) {
  const basis = row => `${row.route ?? 'none'} / ${row.evaluator_version ?? 'unknown'}`;
  const first = await all(db.prepare(`WITH ${VALID} SELECT route, evaluator_version, COUNT(*) AS scored,
      SUM(fit = 'met' AND assistance = 'none') AS independent, SUM(fit = 'met' AND assistance = 'assisted') AS assisted, SUM(fit = 'met' AND assistance = 'unknown') AS unknown_help
    FROM valid WHERE n = 1 AND fit IN ('met', 'partial', 'not_met') AND observed_s >= ? GROUP BY route, evaluator_version`).bind(sinceS));
  const retention = await all(db.prepare(`WITH ${VALID} SELECT CASE WHEN v.observed_s - r.observed_s < ${DAY} THEN 'under_1d' WHEN v.observed_s - r.observed_s < 7 * ${DAY} THEN '1_to_7d' WHEN v.observed_s - r.observed_s < 30 * ${DAY} THEN '7_to_30d' ELSE 'over_30d' END AS bucket,
      v.route, v.evaluator_version, COUNT(*) AS scored, SUM(v.fit = 'met') AS met
    FROM valid v JOIN learning_observations r ON r.id = v.retention_of WHERE v.retention_of IS NOT NULL AND v.fit IN ('met', 'partial', 'not_met') AND v.observed_s >= ? GROUP BY bucket, v.route, v.evaluator_version`).bind(sinceS));
  const transfer = await all(db.prepare(`WITH ${VALID} SELECT v.route, v.evaluator_version, COUNT(*) AS scored, SUM(v.application = 'applied') AS applied, SUM(v.application = 'applied' AND v.fit = 'met') AS applied_met
    FROM valid v JOIN learning_criteria c ON c.goal_id = v.goal_id AND c.criterion_id = v.criterion_id AND c.version = v.criterion_version
    WHERE c.requires_transfer = 1 AND v.fit IN ('met', 'partial', 'not_met') AND v.observed_s >= ? GROUP BY v.route, v.evaluator_version`).bind(sinceS));
  const attempts = await all(db.prepare('SELECT assistance, COUNT(*) AS n FROM learning_attempts WHERE submitted_s >= ? GROUP BY assistance').bind(sinceS));
  return {
    independentSuccess: first.map(row => metric('independent_success', `Independent success, ${basis(row)}`,
      'Valid observations with fit met and no help, over valid observations with fit met, partial or not met; the first scored observation of each criterion version, per account and goal. AI evaluators (jev, larger) are assessments, not verified outcomes.',
      row.independent, row.scored, { basis: basis(row), assistedMet: row.assisted, unknownHelpMet: row.unknown_help })),
    assistedSuccess: first.map(row => metric('assisted_success', `Assisted success, ${basis(row)}`, 'The same population with fit met and recorded help. Help not recorded is its own bucket (unknownHelpMet), never folded in.', row.assisted, row.scored, { basis: basis(row) })),
    retention: retention.map(row => metric('retention', `Retention ${row.bucket}, ${basis(row)}`, 'Valid observations that re-test earlier support (retention_of), fit met, over scored ones, bucketed by the time since the earlier observation.', row.met, row.scored, { bucket: row.bucket, basis: basis(row) })),
    transfer: transfer.map(row => metric('transfer', `Transfer, ${basis(row)}`, 'On criteria that require transfer: valid observations that are applied and met over all scored valid observations of those criteria.', row.applied_met, row.scored, { basis: basis(row), applied: row.applied })),
    assistanceUsed: attempts.map(row => ({ assistance: row.assistance ?? 'unknown', attempts: row.n })),
  };
}

// Milestones: the first moment a criterion version reaches demonstrated_independently under the product's own derivation
// (deriveCriterionSummary), the time and attempts it took, and the Tutor-feature AI cost the account incurred meanwhile.
async function milestones(db, sinceS) {
  const observations = await all(db.prepare(`SELECT o.*, a.status AS assessment_status, a.supersedes_assessment_id AS supersedes, a.route, a.evaluator_version FROM learning_observations o JOIN learning_assessments a ON a.id = o.assessment_id
    ORDER BY o.user_ref, o.goal_id, o.criterion_id, o.criterion_version, o.observed_s, o.id LIMIT 20000`));
  const criteria = new Map((await all(db.prepare('SELECT goal_id, criterion_id, version, requires_reasoning, requires_transfer, rubric_version FROM learning_criteria'))).map(c => [`${c.goal_id}|${c.criterion_id}|${c.version}`, c]));
  const groups = new Map();
  for (const o of observations) { const key = `${o.user_ref}|${o.goal_id}|${o.criterion_id}|${o.criterion_version}`; (groups.get(key) ?? groups.set(key, []).get(key)).push(o); }
  const found = [];
  for (const [key, list] of groups) {
    const [user, goal, criterionId, version] = key.split('|');
    const c = criteria.get(`${goal}|${criterionId}|${version}`);
    if (!c) continue; // a criterion version the projection has not seen: no milestone is claimed
    const criterion = { criterionId, version: Number(version), label: 'x', requirement: 'x', requiresReasoning: !!c.requires_reasoning, requiresTransfer: !!c.requires_transfer, rubricVersion: c.rubric_version || 'unknown' };
    const shaped = o => ({ observationId: o.id, attemptId: o.attempt_id, assessmentId: o.assessment_id, assessmentStatus: o.assessment_status, criterionId: o.criterion_id, criterionVersion: o.criterion_version,
      fit: o.fit, reasoning: o.reasoning, assistance: o.assistance, validity: o.validity, conflict: !!o.conflict, application: o.application, retentionOf: o.retention_of ?? undefined, supersedesAssessmentId: o.supersedes ?? undefined, observedAt: o.observed_at });
    for (let i = 0; i < list.length; i++) {
      let status;
      try { status = deriveCriterionSummary({ criterion, observations: list.slice(0, i + 1).map(shaped) }).status; } catch { break; }
      if (status === 'demonstrated_independently') { found.push({ user, goal, criterionId, version: Number(version), firstS: list[0].observed_s, milestoneS: list[i].observed_s, observations: i + 1, route: list[i].route, evaluator: list[i].evaluator_version }); break; }
    }
  }
  const inWindow = found.filter(m => m.milestoneS >= sinceS);
  for (const m of inWindow) {
    const rows = await all(db.prepare(`SELECT t.cost_state, SUM(t.cost_micros) AS micros, COUNT(*) AS attempts FROM accounting_attempts t JOIN accounting_actions a ON a.action_id = t.action_id
      WHERE a.user_ref = ? AND a.feature IN (${TUTOR_FEATURES.map(() => '?').join(',')}) AND t.started_at BETWEEN ? AND ? GROUP BY t.cost_state`).bind(m.user, ...TUTOR_FEATURES, m.firstS, m.milestoneS));
    m.cost = Object.fromEntries(rows.map(r => [r.cost_state, { micros: r.micros, attempts: r.attempts }]));
  }
  const sum = state => inWindow.reduce((total, m) => total + (m.cost?.[state]?.micros || 0), 0);
  return { milestones: inWindow.length, medianElapsedSeconds: median(inWindow.map(m => m.milestoneS - m.firstS)), medianObservations: median(inWindow.map(m => m.observations)),
    cost: { measuredMicros: sum('settled'), estimatedMicros: sum('estimated'), unknownAttempts: inWindow.reduce((total, m) => total + (m.cost?.unknown?.attempts || 0), 0),
      definition: 'Tutor-feature AI cost charged to the account between its first observation of the criterion and the milestone (accounting attempts of the tutor, tutor_evaluate, next_steps, shared_next_steps and handoff features). Measured and estimated are separate; a span can include unrelated Tutor use by the account.' },
    sample: inWindow.slice(0, 20).map(({ user, ...m }) => ({ ...m, accountRef: user.slice(0, 8) })) };
}

// Sequences of Tutor decisions and hook sets, from the tutor.* events (bounded; truncated is reported).
async function sequences(db, environment, sinceMs, sinceS) {
  const events = (await all(db.prepare(`SELECT event_name, user_ref, occurred_at, body FROM telemetry_events WHERE environment = ? AND event_name IN ('tutor.decision', 'tutor.hooks_computed', 'tutor.hooks_shown') AND occurred_at >= ?
    AND user_ref IS NOT NULL ORDER BY user_ref, occurred_at, rowid LIMIT ?`).bind(environment, sinceMs, EVENT_LIMIT))).map(r => ({ name: r.event_name, user: r.user_ref, at: r.occurred_at, p: JSON.parse(r.body).payload }));
  const decisions = events.filter(e => e.name === 'tutor.decision'), computed = events.filter(e => e.name === 'tutor.hooks_computed'), shown = events.filter(e => e.name === 'tutor.hooks_shown');
  const surface = e => `${e.user}|${e.p.session_id ?? ''}|${e.p.canvas_ref ?? e.p.share_key ?? ''}`;

  // Hook funnel. selected: a decision named a hook of that set. superseded: a LATER set was shown on the same surface (verified).
  const selectedIds = new Set(decisions.map(d => d.p.selected_hook).filter(Boolean));
  const bySurface = new Map();
  for (const s of shown) (bySurface.get(surface(s)) ?? bySurface.set(surface(s), []).get(surface(s))).push(s);
  const funnel = { shown: shown.length, selected: 0, superseded: 0, unknown: 0 }, position = [0, 0, 0], shownAt = [0, 0, 0];
  for (const list of bySurface.values()) list.forEach((s, i) => {
    const ids = s.p.suggestion_ids || [];
    ids.forEach((_, k) => { shownAt[k]++; });
    const picked = ids.findIndex(id => selectedIds.has(id));
    if (picked >= 0) { funnel.selected++; position[picked]++; } else if (list[i + 1] && list[i + 1].p.set_id !== s.p.set_id) funnel.superseded++; else funnel.unknown++;
  });
  const cached = computed.filter(c => c.p.cached).length;

  // Per account sequences.
  const byUser = new Map();
  for (const d of decisions) (byUser.get(d.user) ?? byUser.set(d.user, []).get(d.user)).push(d);
  const attemptsByUser = new Map();
  for (const a of await all(db.prepare('SELECT user_ref, submitted_s FROM learning_attempts WHERE submitted_s >= ? ORDER BY submitted_s').bind(sinceS))) (attemptsByUser.get(a.user_ref) ?? attemptsByUser.set(a.user_ref, []).get(a.user_ref)).push(a.submitted_s * 1000);
  const observations = await all(db.prepare(`WITH ${VALID} SELECT user_ref, goal_id, observed_s FROM valid WHERE fit = 'not_met' AND observed_s >= ? ORDER BY observed_s`).bind(sinceS));
  const claimsKey = d => (d.p.target_claims || []).join(',');
  let stalls = 0, loops = 0, advance = 0, premature = 0, nextAfterFailure = 0, adapted = 0, afterMisconception = 0, repaired = 0;
  const misconceptionClaims = new Map();
  for (const [user, list] of byUser) {
    let run = 1, loop = 1;
    list.forEach((d, i) => {
      const prev = list[i - 1], sameSession = prev && prev.p.session_id === d.p.session_id;
      const sameClaims = sameSession && claimsKey(d) && claimsKey(d) === claimsKey(prev);
      run = sameClaims && !d.p.transitions && !prev.p.transitions ? run + 1 : 1; if (run === 3) stalls++;
      const attemptBetween = sameClaims && (attemptsByUser.get(user) || []).some(t => t > prev.at && t < d.at);
      loop = sameClaims && d.p.action_type === 'respond_text' && prev.p.action_type === 'respond_text' && !attemptBetween ? loop + 1 : 1; if (loop === 2) loops++;
      if ((d.p.reason_codes || []).includes('advance_goal')) { advance++; if ((d.p.evidence_misconception || 0) + (d.p.evidence_prerequisite_gap || 0) > 0) premature++; }
      if (prev && sameSession && prev.p.to_misconception > 0) { afterMisconception++; if ((d.p.reason_codes || []).some(code => REPAIR.includes(code))) repaired++; }
      if (d.p.to_misconception > 0 && (d.p.target_claims || []).length === 1) { const key = `${user}|${d.p.target_claims[0]}`; misconceptionClaims.set(key, (misconceptionClaims.get(key) || 0) + 1); }
    });
  }
  for (const failure of observations) {
    const next = (byUser.get(failure.user_ref) || []).find(d => d.at > failure.observed_s * 1000 && (!d.p.goal_id || d.p.goal_id === failure.goal_id));
    if (next) { nextAfterFailure++; if ((next.p.reason_codes || []).some(code => REPAIR.includes(code))) adapted++; }
  }
  const claimsSeen = misconceptionClaims.size, repeated = [...misconceptionClaims.values()].filter(n => n >= 2).length;
  const offered = {}; for (const d of decisions) offered[d.p.assistance_offered ?? 'unknown'] = (offered[d.p.assistance_offered ?? 'unknown'] || 0) + 1;
  return {
    truncated: events.length >= EVENT_LIMIT, decisions: decisions.length,
    hookFunnel: { generated: computed.length, cached, discarded: computed.filter(c => c.p.discarded).length, ...funnel, selectedByPosition: position, shownByPosition: shownAt,
      definition: 'Sets shown, by what is known of each: selected (a turn named one of its hooks), superseded (a later set was shown on the same surface), unknown (neither: not read as rejection). Completion beyond the selecting turn is not measured.' },
    assistanceOffered: offered,
    stalls: metric('stalls', 'Stalls', 'Runs of 3 consecutive decisions in one session on the same target claims with no evidence change, over all accounts in the window (a count of runs, not a rate).', stalls, decisions.length),
    explanationLoops: metric('explanation_loops', 'Explanation loops', 'Two consecutive text replies on the same target claims with no attempt submitted between them (a count of loops).', loops, decisions.length),
    repeatedMisconceptions: metric('repeated_misconceptions', 'Repeated misconceptions', 'Claims with 2 or more decisions that moved them into misconception, over claims with any, counting decisions with exactly one target claim (the event does not say which of several claims moved).', repeated, claimsSeen),
    prematureProgression: metric('premature_progression_candidates', 'Premature progression candidates', 'Advance-goal decisions made while the selected claims held a misconception or prerequisite gap, over all advance-goal decisions. A candidate, not a confirmed error: confirmation against later evidence is not measured.', premature, advance),
    adaptationAfterFailure: metric('adaptation_after_failure', 'Adaptation after a not-met answer', 'The next decision by the account after a valid not-met observation (same goal) that carries a repair, prerequisite, mechanism, interactivity or simplify reason, over all such next decisions.', adapted, nextAfterFailure),
    adaptationAfterMisconception: metric('adaptation_after_misconception', 'Adaptation after a misconception turn', 'The next decision in the session after a turn that moved a claim into misconception carries a repair reason, over all such next decisions.', repaired, afterMisconception),
  };
}

// The whole Tutor and learning view. environment scopes the events; the projections hold only this deployment's learners.
export async function learningMetrics(db, { environment, days = 30, now = Date.now() } = {}) {
  const sinceMs = now - days * DAY * 1000, sinceS = Math.floor(sinceMs / 1000);
  return {
    days, environment, basis: 'fixture or live data as projected; AI-assessed outcomes are not verified outcomes',
    unavailable: [
      { id: 'difficulty', reason: 'The product has no difficulty field; nothing is classified (owner decision A).' },
      { id: 'human_reviewed_grading_quality', reason: 'Reviewer, sampling rule and permitted evidence are undefined; nothing is collected, and learner conversations are never collected for review (owner decision E).' },
      { id: 'hook_completion', reason: 'Completion beyond the turn that selected a hook is not measured; a hook set that was neither selected nor superseded is unknown, not rejected (owner decision C).' },
      { id: 'displayed_assistance', reason: 'The Tutor does not record that an offered action was displayed. Offered help is on each decision; used help is the assessed attempt.' },
    ],
    ...(await evidenceMetrics(db, sinceS)), milestone: await milestones(db, sinceS), ...(await sequences(db, environment, sinceMs, sinceS)),
  };
}
