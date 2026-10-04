// Motion V1 canonical contracts (spec §5 + owner decisions 2026-10-04). Plain validators
// that return error strings ([] = valid); no schema library, no I/O, no dependencies, so the
// render harness here and the future orchestrator (M2-M7, Node or Worker) import the same file.
import { DURATION, normalizeSeconds } from './duration.js';

export const PROMPT_SPEC_VERSION = 'motion-v1.0';
export const STAGE = Object.freeze({ width: 1920, height: 1080, fps: 30 });
export { DURATION };
export const TEACHING_MODES = ['intuition_first', 'mechanism_first', 'code_walkthrough', 'system_flow'];
export const TARGET_KINDS = ['concept', 'card', 'canvas_object', 'code_span', 'route', 'rabbit_hole'];
export const RESOLUTIONS = ['named', 'deictic', 'context_disambiguated'];
// packages/web/src/agent/slash.js SELECTIONS
export const SELECTION_KINDS = ['project', 'map_node', 'card', 'equation', 'notebook_cell', 'notebook_file', 'canvas_object'];
export const SOURCE_KINDS = ['code', 'card', 'lesson', 'doc'];
export const NARRATION_POLICIES = ['none', 'one_line', 'concise'];
export const PEDAGOGICAL_ROLES = ['hook', 'intuition', 'analogy', 'mechanism', 'bridge_to_formalism', 'notation', 'equation', 'implementation', 'takeaway'];
export const JOB_STATUSES = ['resolving', 'needs_clarification', 'directing', 'storyboarding', 'authoring', 'rendering_preview', 'reviewing', 'repairing', 'rendering_final', 'validating_final', 'ready', 'failed'];

// Calls are configured by role. Model IDs are runtime configuration, never contract:
// they may appear only as MotionJob *_model_config.resolved_model (provenance).
export const MODEL_ROLES = Object.freeze({
  director: 'MOTION_DIRECTOR_MODEL', // brief + storyboard calls
  author: 'MOTION_AUTHOR_MODEL', // author calls, including the repair call
  visual_review: 'MOTION_VISUAL_REVIEW_MODEL',
  pedagogical_review: 'MOTION_PEDAGOGICAL_REVIEW_MODEL',
});
// Structured model stages: each gets at most one schema-only re-ask (format_retries).
export const STRUCTURED_STAGES = ['brief', 'storyboard', 'author', 'visual_review', 'pedagogical_review'];

// §13. The harness classifies by category; reviewers never decide blocking.
export const BLOCKING_CATEGORIES = [
  'unsupported_claim', 'must_not_claim_violation', 'required_claim_contradicted', 'wrong_source_branch',
  'blank_frame', 'clipped_text', 'overlapping_text', 'missing_must_show', 'duration_over_max',
  'corrupt_output', 'renderer_failure', 'narration_contradicts_visuals',
];
export const ADVISORY_CATEGORIES = ['easing_preference', 'aesthetic_preference', 'minor_spacing', 'alternate_color'];

const SHA = /^[0-9a-f]{40}$/;
const ID = { S: /^S\d+$/, K: /^K\d+$/, C: /^C\d+$/, B: /^B\d+$/ };
const MODEL_ID = /\b(?:claude-[a-z0-9.-]+|(?:us|eu|apac|global)\.anthropic\.[a-z0-9.:-]+|anthropic\.claude[a-z0-9.:-]*|gpt-[a-z0-9.-]+|gemini-[a-z0-9.-]+|(?:opus|sonnet|haiku|fable)-\d[a-z0-9.-]*)/i;
const SECRET = /sk-ant-[\w-]{8,}|\bsk-[A-Za-z0-9]{20,}|\bBearer\s+[\w.~+/-]{12,}|\bAKIA[0-9A-Z]{16}\b|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bsmall_session=/;
const SECRET_KEY = /^(?:api_?key|token|secret|password|cookie|authorization|credentials?)$/i;

const str = v => typeof v === 'string' && v.trim().length > 0;
const int = v => Number.isInteger(v);
const arr = v => Array.isArray(v);
const dupes = ids => ids.filter((id, i) => ids.indexOf(id) !== i);

// Every string (and key) in a contract object, with its path.
function* walk(value, path = '') {
  if (typeof value === 'string') yield [path, value];
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) { yield [`${path}.${k}`, k]; yield* walk(v, `${path}.${k}`); }
  }
}
// No model ID and no credential anywhere. `allowModel(path)` whitelists provenance fields.
export function leakErrors(obj, name, allowModel = () => false) {
  const errors = [];
  for (const [path, s] of walk(obj)) {
    if (MODEL_ID.test(s) && !allowModel(path)) errors.push(`${name}${path}: model ID "${s.match(MODEL_ID)[0]}" is not part of the contract (configure by role)`);
    if (SECRET.test(s)) errors.push(`${name}${path}: looks like a credential`);
    if (path.endsWith(`.${s}`) && SECRET_KEY.test(s)) errors.push(`${name}${path}: credential-shaped key "${s}"`);
  }
  return errors;
}

const rangeErrors = (r, at) => !r || !str(r.path) || !int(r.start) || !int(r.end) || r.start < 1 || r.end < r.start ? [`${at}: needs {path, start, end} with 1 <= start <= end`] : [];

// §5.1
export function validateBrief(b) {
  if (!b || typeof b !== 'object') return ['brief: not an object'];
  const e = [];
  for (const k of ['id', 'prompt_spec_version', 'raw_user_request', 'title', 'objective', 'visual_direction']) if (!str(b[k])) e.push(`brief.${k}: required string`);

  const t = b.resolved_target;
  if (!t || typeof t !== 'object') e.push('brief.resolved_target: required');
  else {
    if (!TARGET_KINDS.includes(t.kind)) e.push(`brief.resolved_target.kind: one of ${TARGET_KINDS.join(' | ')}`);
    if (!str(t.label)) e.push('brief.resolved_target.label: required string');
    if (!RESOLUTIONS.includes(t.resolution)) e.push(`brief.resolved_target.resolution: one of ${RESOLUTIONS.join(' | ')}`);
    if (!arr(t.candidates_considered)) e.push('brief.resolved_target.candidates_considered: required array');
    else t.candidates_considered.forEach((c, i) => {
      if (!str(c?.label) || !str(c?.reason)) e.push(`brief.resolved_target.candidates_considered[${i}]: needs label and reason`);
      if (c?.range) e.push(...rangeErrors(c.range, `brief.resolved_target.candidates_considered[${i}].range`));
    });
    if (t.selection && (!SELECTION_KINDS.includes(t.selection.kind) || !str(t.selection.id))) e.push(`brief.resolved_target.selection: {kind: one of SELECTIONS, id}`);
    if (t.repository_context) {
      if (!SHA.test(t.repository_context.commit || '')) e.push('brief.resolved_target.repository_context.commit: full 40-hex SHA');
      e.push(...rangeErrors(t.repository_context.range, 'brief.resolved_target.repository_context.range'));
    }
  }

  const refs = arr(b.source_refs) ? b.source_refs : [];
  if (!refs.length) e.push('brief.source_refs: at least one');
  const refIds = refs.map(r => r?.id);
  for (const d of dupes(refIds)) e.push(`brief.source_refs: duplicate id ${d}`);
  refs.forEach((r, i) => {
    const at = `brief.source_refs[${i}]`;
    if (!ID.S.test(r?.id || '')) e.push(`${at}.id: S1, S2, ...`);
    if (!SOURCE_KINDS.includes(r?.kind)) e.push(`${at}.kind: one of ${SOURCE_KINDS.join(' | ')}`);
    if (r?.kind === 'code') {
      if (!SHA.test(r.commit || '')) e.push(`${at}.commit: kind code needs a full 40-hex SHA`);
      if (!str(r.path) || !int(r.start_line) || !int(r.end_line) || r.start_line < 1 || r.end_line < r.start_line) e.push(`${at}: kind code needs path and a line range`);
    }
  });
  const hasRef = id => refIds.includes(id);

  (arr(b.evidence) ? b.evidence : (e.push('brief.evidence: required array'), [])).forEach((ev, i) => {
    if (!hasRef(ev?.source_ref_id)) e.push(`brief.evidence[${i}].source_ref_id: unknown ${ev?.source_ref_id}`);
    if (!str(ev?.excerpt)) e.push(`brief.evidence[${i}].excerpt: verbatim text required`);
  });

  const conds = arr(b.implementation_conditions) ? b.implementation_conditions : (e.push('brief.implementation_conditions: required array (may be empty)'), []);
  const condIds = conds.map(k => k?.id);
  for (const d of dupes(condIds)) e.push(`brief.implementation_conditions: duplicate id ${d}`);
  conds.forEach((k, i) => {
    const at = `brief.implementation_conditions[${i}]`;
    if (!ID.K.test(k?.id || '')) e.push(`${at}.id: K1, K2, ...`);
    if (!str(k?.condition)) e.push(`${at}.condition: required string`);
    if (!arr(k?.branches) || k.branches.length < 2 || k.branches.some(x => !str(x?.when) || !str(x?.runs))) e.push(`${at}.branches: at least two {when, runs}`);
    if (!arr(k?.source_ref_ids) || !k.source_ref_ids.length || k.source_ref_ids.some(id => !hasRef(id))) e.push(`${at}.source_ref_ids: known source refs required`);
  });

  const claims = arr(b.claim_registry) ? b.claim_registry : [];
  if (!claims.length) e.push('brief.claim_registry: at least one claim');
  for (const d of dupes(claims.map(c => c?.id))) e.push(`brief.claim_registry: duplicate id ${d}`);
  claims.forEach((c, i) => {
    const at = `brief.claim_registry[${i}]`;
    if (!ID.C.test(c?.id || '')) e.push(`${at}.id: C1, C2, ...`);
    if (!str(c?.text)) e.push(`${at}.text: required string`);
    if (!arr(c?.source_ref_ids) || !c.source_ref_ids.length) e.push(`${at}.source_ref_ids: at least one`);
    else for (const id of c.source_ref_ids) if (!hasRef(id)) e.push(`${at}.source_ref_ids: unknown ${id}`);
    if (!arr(c?.condition_ids)) e.push(`${at}.condition_ids: required array (empty when unconditional)`);
    else for (const id of c.condition_ids) if (!condIds.includes(id)) e.push(`${at}.condition_ids: unknown ${id}`);
    if (typeof c?.required !== 'boolean') e.push(`${at}.required: boolean`);
  });

  // Duration: whole seconds 5..30, and exactly what the parser decided (never silently changed).
  const d = b.duration;
  if (!d || !int(d.seconds) || d.seconds < DURATION.min || d.seconds > DURATION.max) e.push(`brief.duration.seconds: integer ${DURATION.min}..${DURATION.max}`);
  else if (d.requested_seconds === undefined ? d.seconds !== DURATION.default : d.seconds !== normalizeSeconds(d.requested_seconds)) e.push(`brief.duration.seconds: ${d.seconds} is not the normalized request (the Director never lengthens or silently changes it)`);
  else if (d.requested_seconds !== undefined && d.seconds !== d.requested_seconds && !str(d.normalization)) e.push('brief.duration.normalization: the decision line is required when seconds differ from the request');

  if (b.aspect_ratio !== '16:9') e.push('brief.aspect_ratio: "16:9" in V1');
  if (!TEACHING_MODES.includes(b.teaching_mode)) e.push(`brief.teaching_mode: one of ${TEACHING_MODES.join(' | ')}`);
  if (b.teaching_mode === 'intuition_first' && (!arr(b.analogy_map) || !b.analogy_map.length || b.analogy_map.some(a => !str(a?.analogy_element) || !str(a?.real_concept) || !str(a?.limit)))) e.push('brief.analogy_map: intuition_first needs {analogy_element, real_concept, limit} entries');
  for (const k of ['must_show', 'must_not_claim']) if (!arr(b[k]) || !b[k].length || b[k].some(x => !str(x))) e.push(`brief.${k}: non-empty list of strings`);
  if (!NARRATION_POLICIES.includes(b.narration_policy)) e.push(`brief.narration_policy: one of ${NARRATION_POLICIES.join(' | ')}`);
  const o = b.output_requirements;
  if (!o || o.stage_width !== STAGE.width || o.stage_height !== STAGE.height || o.fps !== STAGE.fps || o.poster !== true || !(o.preview_scale > 0 && o.preview_scale < 1)) e.push('brief.output_requirements: {stage_width: 1920, stage_height: 1080, fps: 30, preview_scale in (0, 1), poster: true}');
  // Remotion needs whole, even output dimensions: 0.45 -> 864x486 (the ~854x480 preview), 0.5 -> 960x540.
  else if ([STAGE.width, STAGE.height].some(n => !Number.isInteger(n * o.preview_scale) || (n * o.preview_scale) % 2)) e.push(`brief.output_requirements.preview_scale: ${o.preview_scale} must give whole, even preview dimensions (e.g. 0.45 -> 864x486)`);
  const q = b.qa_requirements;
  if (!q || !arr(q.blocking_categories) || !q.blocking_categories.length || q.blocking_categories.some(c => !BLOCKING_CATEGORIES.includes(c))) e.push('brief.qa_requirements.blocking_categories: non-empty subset of the §13.1 categories');
  if (q?.keyframe_times && (!arr(q.keyframe_times) || q.keyframe_times.some(t => typeof t !== 'number' || t < 0 || t > (d?.seconds ?? 0)))) e.push('brief.qa_requirements.keyframe_times: seconds inside the video');
  if (!str(b.provenance?.created_at) || Number.isNaN(Date.parse(b.provenance.created_at))) e.push('brief.provenance.created_at: ISO timestamp');
  return [...e, ...leakErrors(b, 'brief')];
}

// §5.2, validated against its brief before the Author call.
export function validateStoryboard(s, brief) {
  if (!s || typeof s !== 'object') return ['storyboard: not an object'];
  const e = [];
  if (!str(s.id)) e.push('storyboard.id: required string');
  if (s.brief_id !== brief?.id) e.push(`storyboard.brief_id: must be ${brief?.id}`);
  if (!int(s.version) || s.version < 1) e.push('storyboard.version: integer >= 1');
  const beats = arr(s.beats) ? s.beats : [];
  if (beats.length < 2 || beats.length > 8) e.push(`storyboard.beats: 2-8 beats (got ${beats.length})`);
  for (const d of dupes(beats.map(x => x?.id))) e.push(`storyboard.beats: duplicate id ${d}`);
  const claims = new Map((brief?.claim_registry || []).map(c => [c.id, c]));
  const condIds = (brief?.implementation_conditions || []).map(k => k.id);
  const covered = { claims: new Set(), show: new Set() };
  const end = brief?.duration?.seconds;
  let cursor = 0;
  beats.forEach((x, i) => {
    const at = `storyboard.beats[${i}]`;
    if (!ID.B.test(x?.id || '')) e.push(`${at}.id: B1, B2, ...`);
    if (typeof x?.start_time !== 'number' || typeof x?.end_time !== 'number' || x.end_time <= x.start_time) e.push(`${at}: start_time < end_time required`);
    else if (Math.abs(x.start_time - cursor) > 1e-9) e.push(`${at}.start_time: ${x.start_time} leaves a gap or overlap (expected ${cursor})`);
    cursor = x?.end_time;
    if (!PEDAGOGICAL_ROLES.includes(x?.pedagogical_role)) e.push(`${at}.pedagogical_role: one of ${PEDAGOGICAL_ROLES.join(' | ')}`);
    if (!arr(x?.visible_objects) || !x.visible_objects.length) e.push(`${at}.visible_objects: non-empty list`);
    if (!arr(x?.claim_ids) || !x.claim_ids.length) e.push(`${at}.claim_ids: at least one claim`);
    for (const id of x?.claim_ids || []) {
      const c = claims.get(id);
      if (!c) { e.push(`${at}.claim_ids: unknown ${id}`); continue; }
      covered.claims.add(id);
      for (const k of c.condition_ids || []) if (!(x.condition_ids || []).includes(k)) e.push(`${at}: teaches conditional claim ${id} but does not name its condition ${k}`);
    }
    for (const k of x?.condition_ids || []) if (!condIds.includes(k)) e.push(`${at}.condition_ids: unknown ${k}`);
    if (!arr(x?.must_show_covered)) e.push(`${at}.must_show_covered: required list`);
    for (const m of x?.must_show_covered || []) (brief?.must_show || []).includes(m) ? covered.show.add(m) : e.push(`${at}.must_show_covered: "${m}" is not a brief must_show item`);
    for (const k of ['transition', 'framing']) if (!str(x?.[k])) e.push(`${at}.${k}: required string`);
    if (typeof x?.on_screen_text !== 'string') e.push(`${at}.on_screen_text: string (may be empty)`);
    if (x?.narration_line !== undefined && brief?.narration_policy === 'none') e.push(`${at}.narration_line: narration_policy is none`);
  });
  if (beats.length && Math.abs(cursor - end) > 1e-9) e.push(`storyboard.beats: must end at exactly ${end}s (ends at ${cursor})`);
  for (const c of claims.values()) if (c.required && !covered.claims.has(c.id)) e.push(`storyboard: required claim ${c.id} is not taught by any beat`);
  for (const m of brief?.must_show || []) if (!covered.show.has(m)) e.push(`storyboard: must_show "${m}" is not covered by any beat`);
  return [...e, ...leakErrors(s, 'storyboard')];
}

// §5.3: exactly one of the two shapes. The source itself is checked by static-check.js (§8.2).
export function validateAuthorOutput(o) {
  if (o?.status === 'composition') {
    const e = [];
    if (!str(o.source)) e.push('author.source: required');
    if (!/^[A-Za-z0-9-]+$/.test(o.composition_id || '')) e.push('author.composition_id: letters, digits and dashes');
    if (o.notes !== undefined && typeof o.notes !== 'string') e.push('author.notes: string');
    for (const k of ['reason', 'stage', 'refs']) if (k in o) e.push(`author.${k}: not part of a composition result`);
    return e;
  }
  if (o?.status === 'needs_revision') {
    const e = [];
    if (!str(o.reason)) e.push('author.reason: required');
    if (!['brief', 'storyboard'].includes(o.stage)) e.push('author.stage: brief | storyboard');
    if (!arr(o.refs) || !o.refs.length || o.refs.some(r => !/^[BCK]\d+$/.test(r))) e.push('author.refs: beat / claim / condition IDs');
    if ('source' in o) e.push('author.source: not part of a needs_revision result');
    return e;
  }
  return ['author.status: composition | needs_revision'];
}

// §5.4
export function validateFinding(f) {
  const e = [];
  if (!['visual', 'pedagogical'].includes(f?.reviewer)) e.push('finding.reviewer: visual | pedagogical');
  if (![...BLOCKING_CATEGORIES, ...ADVISORY_CATEGORIES].includes(f?.category)) e.push(`finding.category: unknown "${f?.category}"`);
  if (f?.beat_id !== undefined && !ID.B.test(f.beat_id)) e.push('finding.beat_id: B1, B2, ...');
  if (f?.claim_id !== undefined && !ID.C.test(f.claim_id)) e.push('finding.claim_id: C1, C2, ...');
  if (f?.timestamp !== undefined && !(typeof f.timestamp === 'number' && f.timestamp >= 0)) e.push('finding.timestamp: seconds >= 0');
  if (!str(f?.description)) e.push('finding.description: required');
  return e;
}

export function classifyFindings(findings) {
  return {
    blocking: findings.filter(f => BLOCKING_CATEGORIES.includes(f.category)),
    advisory: findings.filter(f => ADVISORY_CATEGORIES.includes(f.category)),
  };
}

// The single semantic repair round (§4.8): `repair_count` is 0 or 1 for the whole job.
// After a review pass: clean -> final render; blocking with the round unused -> repair; else fail.
export function afterReview(job, findings) {
  if (!classifyFindings(findings).blocking.length) return 'render_final';
  return job.repair_count < 1 ? 'repair' : 'fail';
}
// An Author needs_revision consumes the round; one from the repair call itself fails the job.
export function afterNeedsRevision(job) {
  return job.repair_count < 1 ? 'repair' : 'fail';
}
export function startRepair(job) {
  if (job.repair_count >= 1) throw Error('the repair round is already used');
  job.repair_count = 1;
  job.status = 'repairing';
}
// Malformed or unparseable stage output: one "same result, required schema" re-ask per
// structured stage, recorded on the job and never counted as repair. A second one fails the job.
export function afterMalformed(job, stage, errors) {
  if (!STRUCTURED_STAGES.includes(stage)) throw Error(`unknown structured stage ${stage}`);
  if (job.format_retries.some(r => r.stage === stage)) {
    job.status = 'failed';
    job.failure_reason = `${stage}: output was malformed again after its one format re-ask: ${errors.join('; ')}`;
    return 'fail';
  }
  job.format_retries.push({ stage, errors });
  return 'reask';
}

// §5.5
export function validateJob(j) {
  if (!j || typeof j !== 'object') return ['job: not an object'];
  const e = [];
  for (const k of ['id', 'prompt_spec_version', 'created_at', 'updated_at']) if (!str(j[k])) e.push(`job.${k}: required string`);
  if (!JOB_STATUSES.includes(j.status)) e.push(`job.status: one of ${JOB_STATUSES.join(' | ')}`);
  if (!str(j.owner?.org) || !str(j.owner?.app) || !str(j.owner?.learner)) e.push('job.owner: {org, app, learner}');
  if (j.renderer?.name !== 'remotion' || !str(j.renderer?.version)) e.push('job.renderer: {name: "remotion", version}');
  if (j.repair_count !== 0 && j.repair_count !== 1) e.push('job.repair_count: 0 or 1 (exactly one semantic repair round per job)');
  if (!arr(j.format_retries)) e.push('job.format_retries: required array');
  else {
    j.format_retries.forEach((r, i) => { if (!STRUCTURED_STAGES.includes(r?.stage) || !arr(r?.errors)) e.push(`job.format_retries[${i}]: {stage, errors[]}`); });
    for (const d of dupes(j.format_retries.map(r => r?.stage))) e.push(`job.format_retries: more than one re-ask for stage ${d}`);
  }
  const role = (cfg, want, at) => { if (cfg?.role !== want) e.push(`${at}.role: ${want}`); if (cfg?.resolved_model !== undefined && !str(cfg.resolved_model)) e.push(`${at}.resolved_model: string`); };
  role(j.director_model_config, MODEL_ROLES.director, 'job.director_model_config');
  role(j.author_model_config, MODEL_ROLES.author, 'job.author_model_config');
  role(j.review_model_config?.visual, MODEL_ROLES.visual_review, 'job.review_model_config.visual');
  role(j.review_model_config?.pedagogical, MODEL_ROLES.pedagogical_review, 'job.review_model_config.pedagogical');
  if (j.brief) e.push(...validateBrief(j.brief));
  if (j.storyboard) e.push(...validateStoryboard(j.storyboard, j.brief));
  if (!arr(j.findings)) e.push('job.findings: required array');
  else j.findings.forEach((f, i) => e.push(...validateFinding(f).map(x => `job.findings[${i}] ${x}`)));
  if (!arr(j.source_refs)) e.push('job.source_refs: required array');
  else if (j.brief && JSON.stringify(j.source_refs) !== JSON.stringify(j.brief.source_refs)) e.push('job.source_refs: must be copied from the brief');
  if (j.status === 'ready' && (!str(j.final_ref) || !j.final_validation?.ok)) e.push('job: ready needs final_ref and a passing final_validation');
  if (j.status === 'failed' && !str(j.failure_reason)) e.push('job: failed needs failure_reason');
  e.push(...leakErrors(j, 'job', path => /^\.(director|author)_model_config\.resolved_model$|^\.review_model_config\.(visual|pedagogical)\.resolved_model$/.test(path)));
  return e;
}

// §18: provenance carried in the existing video job/block metadata. Answers "what source,
// card, code and claims generated this explainer?" with no model or credential fields.
export function blockProvenance(job) {
  return {
    motion_job_id: job.id,
    prompt_spec_version: job.prompt_spec_version,
    source_refs: job.source_refs.map(({ id, kind, repository, commit, path, start_line, end_line, card_id, url }) =>
      Object.fromEntries(Object.entries({ id, kind, repository, commit, path, start_line, end_line, card_id, url }).filter(([, v]) => v !== undefined))),
    claim_ids: (job.brief?.claim_registry || []).map(c => c.id),
  };
}
