// Creator analytics, validated offline (docs/features/tutor-decision-eval.md §17; docs/features/professor-next-steps.md §5).
// The product persists and aggregates nothing yet (§5: a later, owner-approved change). This is the eval's aggregator over
// its own event stream, so the privacy rules can be proven before any store exists:
// - a protected metric is shown only when at least MIN_COHORT unique learners stand behind it, at EVERY level it is cut by
//   (publication, creator, global, and each concept, hook and position filter, and any time range): below that it is
//   SUPPRESSED, never 0;
// - always visible, as plain counts: total opens, the public fork count, raw Rabbit Hole starts, published canvas count, and
//   unique learners (a bare count below the cohort, with no percentage built on it);
// - a session belongs to one publication and is counted once at every level; learners are counted once per level;
// - the output carries no learner id, email or handle, no evidence row, no individual misconception, no Rabbit Hole path
//   and no hook history.
// Publication identity is the canonical Explore key (canvas_publications on main: org + canvas, and the canvas owner's
// internal id), never a share key and never the publication's read token (it changes on every publish).
// EVAL-ONLY shapes: publication_opened and canvas_forked (the product has no such events yet - a gap); the Next Steps
// impressions and selections, the decisions and the evidence are the product's own (next_steps_shown, tutor_decision,
// deriveClaimStates).
import { createHash } from 'node:crypto';
import { claimsIn, round } from './events.mjs';

export const MIN_COHORT = 10;
export const ACCESS_MODES = ['owned', 'shared_unlisted', 'public_explore'];
export const SUPPRESSED = Object.freeze({ value: null, suppressed: true, suppression_reason: 'insufficient_cohort', minimum_unique_learners: MIN_COHORT });
const gate = (learners, value) => (learners >= MIN_COHORT ? { value, suppressed: false } : { ...SUPPRESSED });
const rate = (part, whole) => (whole ? round(part / whole) : null);
const FRICTION_STATES = ['misconception', 'prerequisite_gap'];
const REPAIR_CODES = ['repair_misconception', 'fill_prerequisite_gap'];
export const publicationKey = publication => `${publication.org}/${publication.canvas}`;

// One record per learning session on a publication: who (kept inside this module only), what they did. Never exported.
function sessionsOf(events) {
  const bySession = Object.groupBy(events, event => event.session_id);
  return Object.values(bySession).map(list => {
    const opened = list.filter(event => event.type === 'publication_opened');
    if (opened.length !== 1) throw Error(`a session must open exactly one publication, not ${opened.length}`);
    const [open] = opened;
    if (!ACCESS_MODES.includes(open.source_access_mode)) throw Error(`unknown source_access_mode ${open.source_access_mode}`);
    const concepts = new Set(), friction = new Set();
    for (const event of list) {
      const trace = event.type === 'tutor_action_ready' ? event.trace : null;
      for (const id of trace?.decision.target_concept_ids ?? event.decision?.target_concepts ?? []) concepts.add(id);
      // Friction, never dwell: an evidence state of misconception or a prerequisite gap, a repair the Tutor chose, or a
      // clarification it had to ask (contract §5.3).
      if (event.type === 'evidence_updated') for (const claim of claimsIn(event.claims)) if (FRICTION_STATES.includes(claim.state) && claim.concept) friction.add(claim.concept);
      if (trace && (trace.decision.reason_codes.some(code => REPAIR_CODES.includes(code)) || trace.decision.clarification_requested === true)) for (const id of trace.decision.target_concept_ids) friction.add(id);
    }
    const ready = Object.fromEntries(list.filter(event => event.type === 'next_steps_ready').map(event => [event.hook_set_id, event.options]));
    const shown = list.filter(event => event.type === 'next_steps_shown').flatMap(event => (ready[event.hook_set_id] || []).map(option => ({ set: event.hook_set_id, option })));
    const picked = new Set(list.filter(event => event.type === 'next_step_selected').map(event => `${event.hook_set_id}|${event.option_id}`));
    return {
      session_id: open.session_id, learner: open.user_id, publication: open.publication, key: publicationKey(open.publication), creator: open.publication.creator_id, opened_at: open.opened_at ?? null,
      concepts, friction,
      impressions: shown.map(({ set, option }) => ({ position: option.position, hook: hookIdentity(option), text: option.text, selected: picked.has(`${set}|${option.id}`) })),
      deeper: list.some(event => event.type === 'next_step_selected' || event.type === 'rabbit_hole_opened'),
      rabbit_holes: list.filter(event => event.type === 'rabbit_hole_opened').length,
      forks: list.filter(event => event.type === 'canvas_forked').length,
      // Active time only from client-measured active_ms; a simulated session has none (unknown, never 0).
      active_ms: list.filter(event => event.type === 'material_interaction' && Number.isFinite(event.active_ms)).reduce((sum, event) => sum + event.active_ms, 0) || null,
    };
  });
}
// A hook's analytics identity (§5.2): its structured goal and ids, so equivalent hooks aggregate across wording. Keyed by a
// one-way hash: the goal is generated per learner, so it is shown only once the cohort stands behind it.
const hookIdentity = option => JSON.stringify([option.learning_goal ?? null, [...(option.concept_ids || [])].sort(), [...(option.claim_ids || [])].sort()]);
const hookKey = identity => `hook_${createHash('sha256').update(identity).digest('hex').slice(0, 12)}`;

// Every metric of one level, from that level's sessions. Learners are distinct ids at this level; a learner's flags are any
// of their sessions'.
function level(sessions, published) {
  const learners = Object.values(Object.groupBy(sessions, session => session.learner)).map(list => ({
    concepts: new Set(list.flatMap(s => [...s.concepts])), friction: new Set(list.flatMap(s => [...s.friction])),
    deeper: list.some(s => s.deeper), holes: list.some(s => s.rabbit_holes > 0), forked: list.some(s => s.forks > 0),
    active_ms: list.some(s => s.active_ms != null) ? list.reduce((sum, s) => sum + (s.active_ms || 0), 0) : null,
    impressions: list.flatMap(s => s.impressions),
  }));
  const n = learners.length;
  const timed = learners.filter(l => l.active_ms != null);
  // Per concept: only learners who met it; difficulty is the share of them with friction there.
  const conceptIds = [...new Set(learners.flatMap(l => [...l.concepts, ...l.friction]))].sort();
  const byConcept = Object.fromEntries(conceptIds.map(id => {
    const met = learners.filter(l => l.concepts.has(id) || l.friction.has(id));
    return [id, { unique_learners: met.length, friction_rate: gate(met.length, rate(met.filter(l => l.friction.has(id)).length, met.length)) }];
  }));
  const ranked = Object.entries(byConcept).filter(([, c]) => !c.friction_rate.suppressed).sort((a, b) => b[1].friction_rate.value - a[1].friction_rate.value || a[0].localeCompare(b[0]));
  // Next Steps: impressions and selections, by position and by hook identity; each cut has its own cohort.
  const saw = predicate => learners.filter(l => l.impressions.some(predicate));
  const selection = predicate => {
    const all = learners.flatMap(l => l.impressions.filter(predicate));
    return gate(saw(predicate).length, rate(all.filter(i => i.selected).length, all.length));
  };
  const hooks = [...new Set(learners.flatMap(l => l.impressions.map(i => i.hook)))].sort();
  const byHook = Object.fromEntries(hooks.map(hook => {
    const viewers = saw(i => i.hook === hook).length;
    const wordings = Object.entries(Object.groupBy(learners.flatMap(l => l.impressions.filter(i => i.hook === hook)), i => i.text)).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    const [goal, concept_ids, claim_ids] = JSON.parse(hook), met = viewers >= MIN_COHORT;
    // The goal and a representative wording only once the cohort is met (§5.2): personalised copy never leaks below it.
    return [hookKey(hook), { learning_goal: met ? goal : null, concept_ids, claim_ids, unique_learners: viewers, selection_rate: selection(i => i.hook === hook), representative_hook: met ? wordings[0]?.[0] ?? null : null }];
  }));
  return {
    // Always visible: plain counts.
    counts: {
      total_opens: sessions.length,
      unique_learners: n,
      rabbit_hole_starts: sessions.reduce((sum, s) => sum + s.rabbit_holes, 0),
      public_fork_count: sessions.reduce((sum, s) => sum + s.forks, 0),
      published_canvas_count: published,
    },
    // Protected: suppressed below the cohort.
    metrics: {
      avg_active_learning_seconds: timed.length ? gate(timed.length, round(timed.reduce((sum, l) => sum + l.active_ms, 0) / timed.length / 1000, 1)) : gate(n, null),
      concept_exploration_rate: gate(n, rate(learners.filter(l => l.concepts.size >= 2).length, n)),
      deeper_branch_rate: gate(n, rate(learners.filter(l => l.deeper).length, n)),
      rabbit_hole_conversion_rate: gate(n, rate(learners.filter(l => l.holes).length, n)),
      fork_conversion_rate: gate(n, rate(learners.filter(l => l.forked).length, n)),
      highest_friction_concept: n >= MIN_COHORT && ranked.length ? { value: { concept_id: ranked[0][0], friction_rate: ranked[0][1].friction_rate.value }, suppressed: false } : { ...SUPPRESSED },
      next_steps: {
        selection_rate: selection(() => true),
        by_position: Object.fromEntries([1, 2, 3].map(p => [p, selection(i => i.position === p)])),
      },
    },
    by_concept: byConcept,
    by_hook: byHook,
  };
}

// events: any number of sessions' events (eval stream). publications: the listed publications [{ org, canvas, creator_id,
// listed }] (an unlisted, removed or trashed one counts toward nothing public). filter: { from, to } (ISO opened_at bounds).
// Returns { global, creators: { [creator_id]: { ...level, publications: { [org/canvas]: level } } } } - learner-free.
export function creatorAnalytics(events, { publications = [], filter = {} } = {}) {
  const listed = new Set(publications.filter(p => p.listed !== false).map(publicationKey));
  const all = sessionsOf(events).filter(s => listed.has(s.key) && (!filter.from || (s.opened_at && s.opened_at >= filter.from)) && (!filter.to || (s.opened_at && s.opened_at < filter.to)));
  const creators = Object.fromEntries(Object.entries(Object.groupBy(all, s => s.creator)).map(([creator, sessions]) => {
    const keys = [...listed].filter(key => publications.find(p => publicationKey(p) === key)?.creator_id === creator);
    return [creator, { ...level(sessions, keys.length), publications: Object.fromEntries(keys.map(key => [key, level(sessions.filter(s => s.key === key), 1)])) }];
  }));
  return { minimum_unique_learners: MIN_COHORT, filter: { from: filter.from ?? null, to: filter.to ?? null }, global: level(all, listed.size), creators };
}

// The public creator profile (/@handle) reads plain counts only: listed explainers, unique learners and forks across them.
export const publicProfile = creator => ({ public_explainer_count: creator.counts.published_canvas_count, aggregate_unique_learners: creator.counts.unique_learners, aggregate_fork_count: creator.counts.public_fork_count });
