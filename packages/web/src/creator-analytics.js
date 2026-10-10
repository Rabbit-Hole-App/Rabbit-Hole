// Creator analytics, the read contract's typed states (docs/features/creator-analytics-contract.md "Read API"). #62
// storage is not approved, so no analytics route exists: the views render `not_collected` from these constants and never
// derive a number from anything else (owner: no analytics from page views, no insight without telemetry evidence). The
// only numbers are public counters that already exist canonically - the fork count (FORK_COUNT) and the public explainer
// count - shown at any count. Pure, so the states are tested (creator-profile.test.mjs).
export const RANGES = [{ id: '7d', label: '7 days' }, { id: '30d', label: '30 days' }, { id: 'all', label: 'All time' }];
export const THRESHOLD = 10;
export const NOT_COLLECTED = Object.freeze({ value: null, suppressed: true, reason: 'not_collected' });
// What a suppressed behavior metric looks like below the cohort threshold (contract "Identity and privacy"): no value.
export const INSUFFICIENT = Object.freeze({ value: null, suppressed: true, reason: 'insufficient_cohort' });
export const counter = value => (typeof value === 'number' ? { value, suppressed: false } : NOT_COLLECTED);

export function metricText(metric) {
  if (!metric || metric.reason === 'not_collected') return 'Not collected yet';
  if (metric.suppressed) return `Not enough learners yet (fewer than ${THRESHOLD})`;
  return metric.value.toLocaleString('en-US');
}

// Per explainer (owner analytics UI brief): the metric sections in the contract's words. `all` marks a public counter
// that is all-time only, whatever the range, so its label says so.
export const EXPLAINER_SECTIONS = [
  { title: 'Audience', rows: [['unique_visitors', 'Unique visitors'], ['signed_in_learners', 'Signed-in learners'], ['total_opens', 'Total opens'], ['avg_active_seconds', 'Average active learning time'], ['engaged_learners_2m', 'Engaged learners (more than 2 min)']] },
  { title: 'Concepts', rows: [['concept_exploration', 'Concept exploration rates'], ['deeper_branch_rate', 'Deeper-branch rate'], ['highest_friction_concept', 'Highest-friction concept']] },
  { title: 'Rabbit Holes and forks', rows: [['rabbit_holes_started', 'Start Rabbit Hole count'], ['rabbit_hole_start_rate', 'Start Rabbit Hole conversion'], ['fork_count', 'Canonical forks', 'all'], ['fork_rate', 'Fork conversion']] },
  { title: 'Professor Next Steps', rows: [['next_step_impressions', 'Impressions'], ['next_step_selections', 'Selections'], ['most_selected_next_step', 'Most-selected Next Step'], ['next_step_position_bias', 'Option-position statistics']] },
  { title: 'Outbound resources', rows: [['resource_opens', 'Paper, GitHub and source opens']] },
];
export const TRAFFIC_SOURCES = [['linkedin', 'LinkedIn'], ['explore', 'Explore'], ['creator_profile', 'Creator profile'], ['direct', 'Direct'], ['other_referrer', 'Other referrer']];
export const CREATOR_TOTALS = [['unique_learners', 'Unique learners'], ['avg_active_seconds', 'Average active learning time'], ['rabbit_holes_started', 'Rabbit Holes started'], ['fork_count', 'Canonical forks', 'all'], ['explainer_count', 'Public learning boards', 'all']];

const notCollected = rows => Object.fromEntries(rows.map(([key]) => [key, NOT_COLLECTED]));

// One publication: everything not collected except its canonical fork count. No insight: none has evidence.
export function explainerAnalytics({ forkCount }) {
  const metrics = { ...notCollected(EXPLAINER_SECTIONS.flatMap(s => s.rows)), fork_count: counter(forkCount) };
  return { state: 'not_collected', metrics, traffic: notCollected(TRAFFIC_SOURCES), revisions: NOT_COLLECTED, insights: [] };
}

// All of a creator's publications: the public counters from the profile, every other total, row and list not collected.
export function creatorAnalytics({ explainerCount, forkCount, explainers }) {
  return {
    state: 'not_collected',
    totals: { ...notCollected(CREATOR_TOTALS), fork_count: counter(forkCount), explainer_count: counter(explainerCount) },
    explainers: explainers.map(e => ({ title: e.title, url: e.url, learners: NOT_COLLECTED, avg_active_seconds: NOT_COLLECTED, rabbit_hole_start_rate: NOT_COLLECTED, fork_count: counter(e.fork_count) })),
    wants_next: NOT_COLLECTED, friction: NOT_COLLECTED, traffic: notCollected(TRAFFIC_SOURCES), trend: NOT_COLLECTED,
  };
}
