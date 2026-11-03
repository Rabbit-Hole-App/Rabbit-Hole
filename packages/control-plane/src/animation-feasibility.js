// /animation feasibility before Generate (FX-AN-031; docs/features/animation/fix.md). Deterministic server checks and server words, no
// model call: the planner's frozen prompt is not touched. Four outcomes: supported as planned; useful with explicit changes (the
// learner accepts each change before anything is built); unsupported by the current runtime (the planner's gap); needs one
// clarification (a request with no subject, asked before a paid plan call).
//
// The size check is an ESTIMATE from the plan's words, calibrated on saved jobs (test/animation-feasibility.test.js). It cannot see the
// scene: a plan under the limit can still fail, and one over it might have fitted. fitProblems (animation-repair.js) stays the
// authoritative check on the real candidate; nothing here accepts or rejects a scene.
import { validateAnimationArtifact, validateAnimationPlan } from '../../web/src/animation3d/contract.js';
import { experimentFixture } from '../../web/src/animation3d/fixtures.js';
import { ANIMATION_DRAFT_BYTES, TRAIL_NODE_BYTES } from './agents/animation-author.js';
import { enabledCapabilities } from './animation-brief.js';
import { draftOf, fitProblems } from './animation-repair.js';

// Draft bytes per thing the plan names, fitted to the saved drafts: pendulum 3.1-3.8 KB, 3 by 3 grid game 6.8 KB, projectile games
// 9.7-10.9 KB, SGD 9.4 KB with 40 markers and 13.3 KB with 82 (aj_9c453b6's repaired draft, which now fits).
const BYTES = { base: 2500, parameter: 300, interaction: 200, rules: 2500, game: 800, label: 90, object: 90, marker: TRAIL_NODE_BYTES };
const DEFAULT_MARKERS = 24; // a trail with no stated length: what the saved projectile drafts declared, about
const CLEARLY_OVER = 1.25; // over the limit by this much: not offered as planned at all; between the limit and this, the learner may keep it
const MIN_MARKERS = 8; // fewer than this no longer reads as a path
const MARGIN = 200; // the changed plan's own new sentences take some of the room

const TRAIL = /\b(trails?|traces?|breadcrumbs?|dotted|(?:leaves?|leaving|draws?|drawing|records?|recording)\s+(?:a |an |its |the )?(?:\w+ )?(?:paths?|lines?|arcs?))\b/i;
const RETAINED = /\b(?:keeps?|kept|keeping|retains?|retained|saves?|saved)\b[^.]{0,60}\b(?:paths?|trails?|arcs?|runs?)\b|\b(?:comparison|previous|old|earlier)\s+(?:paths?|trails?|arcs?)\b|\b(?:paths?|trails?|arcs?)\b[^.]{0,40}\b(?:stays?|remains?)\b/i;
const STEPS = /\b(\d{1,5})(?:[- ]\w+)?[- ](?:steps?|updates?|iterations?)\b/gi;
const POINTS = /\b(\d{1,5})\s+(?:\w+\s)?(?:points?|markers?|dots?)\b/gi;
const OBJECTS = /\b(\d{2,4})\s+(?:\w+\s)?(?:objects?|balls?|particles?|spheres?|cubes?|bars?|beads?|planets?|stars?|bod(?:y|ies)|molecules?|atoms?|masses|blocks?|cells?|bricks?)\b/gi;
const GRID = /\b(\d{1,3})\s*(?:by|x|×)\s*(\d{1,3})\b/gi;
const COUNT_PARAMETER = /^(?:number of |how many |total )?(?:steps|points|iterations|updates)\b|\b(?:steps|iterations)$/i;

const sentencesOf = plan => [plan.title, plan.description, plan.reason, plan.learningGoal, ...(plan.interactions || []), ...(plan.assumptions || []), ...(plan.limitations || [])]
  .filter(text => typeof text === 'string' && !text.startsWith(CHANGED)).flatMap(text => text.split(/(?<=[.!?])\s+/));
const most = (text, pattern) => Math.max(0, ...[...text.matchAll(pattern)].map(m => Number(m[1])));

// What the plan's words say will be drawn. -> { markers, stated, retained, objects, labels }
function countsOf(plan) {
  const sentences = sentencesOf(plan), all = sentences.join(' ');
  const trail = TRAIL.test(all), retained = trail && RETAINED.test(all);
  const parameter = Math.max(0, ...(plan.parameters || []).filter(p => p.type === 'number' && COUNT_PARAMETER.test(p.label || '')).map(p => p.max));
  const points = Math.max(0, ...sentences.filter(s => TRAIL.test(s) || /\bpaths?\b/i.test(s)).map(s => most(s, POINTS)));
  // A plan the server already shortened says so (shrunk below): that cap, not the steps it still runs, is what gets drawn.
  const cap = most(all, /\bat most (\d{1,5}) markers\b/gi);
  const stated = !trail ? 0 : cap || Math.max(points, most(all, STEPS), parameter);
  const grid = Math.max(0, ...[...all.matchAll(GRID)].map(m => Number(m[1]) * Number(m[2])));
  const readouts = sentences.filter(s => /^readouts?\b/i.test(s)).map(s => s.split(',').length);
  return { trail, stated, drawn: trail ? (stated || DEFAULT_MARKERS) * (retained ? 2 : 1) : 0, retained, objects: Math.max(most(all, OBJECTS), grid), labels: Math.max(0, ...readouts) };
}

// The estimate of the draft the author would write for this plan, in bytes. Estimate only: see the top of this file.
export function estimateDraftBytes(plan) {
  const c = countsOf(plan);
  return { bytes: BYTES.base + BYTES.parameter * (plan.parameters?.length || 0) + BYTES.interaction * (plan.interactions?.length || 0) + (plan.behavior === 'rules' || plan.experience === 'game' ? BYTES.rules : 0)
    + (plan.experience === 'game' ? BYTES.game : 0) + BYTES.marker * c.drawn + BYTES.object * c.objects + BYTES.label * c.labels, ...c };
}

// The largest draft the size check would pass for this job's plan: fitProblems itself (the authority on a real candidate, at its worst-case
// traces, coverage, findings and correction), run on a valid scene grown with trail markers, and never past the limit the author is told.
// A longer plan leaves less room, so this is per plan. Which scene it is changes the answer a little: an estimate, as everything here.
export function draftLimit(env, job, tasks) {
  const artifact = experimentFixture.artifact, base = draftOf(artifact), { geometry, material } = artifact.scene.nodes.find(n => n.geometry);
  const grown = n => {
    const nodes = [...base.scene.nodes, ...Array.from({ length: n }, (_, i) => ({ id: `t${i}`, geometry, material, visible: false }))];
    return { ...base, scene: { ...base.scene, nodes } };
  };
  const fits = n => {
    const draft = grown(n), checked = validateAnimationArtifact({ ...artifact, scene: draft.scene }, enabledCapabilities(), { draft: true });
    return checked.ok && JSON.stringify(draft).length <= ANIMATION_DRAFT_BYTES && !fitProblems(env, checked.value, job, tasks, draft).length;
  };
  let low = 0, high = enabledCapabilities().limits.nodes - base.scene.nodes.length;
  while (high - low > 1) { const mid = (low + high) >> 1; if (fits(mid)) low = mid; else high = mid; }
  return JSON.stringify(grown(low)).length;
}

// How a server-written change line begins, so the review card keeps it in view with the "you asked for" lines (animation-job.js planScene).
export const CHANGED = 'Changed: ';
const SENTENCE_OF_RETAINED = text => String(text).split(/(?<=[.!?])\s+/).filter(s => !RETAINED.test(s)).join(' ').trim();
const clampPoints = (text, from, to) => String(text).replace(POINTS, (whole, n) => (Number(n) === from ? whole.replace(n, String(to)) : whole));
// The learner's own words asked for the kept path: an alternative may not take it away.
const ASKED_TO_KEEP = /\b(compar\w*|keep\w*|previous|side by side|last (?:run|path|shot))\b/i;

function shrunk(plan, c, markers, dropRetained) {
  const every = Math.max(1, Math.ceil(c.stated / markers)), shown = c.stated ? Math.ceil(c.stated / every) : markers;
  const steps = c.stated ? `The trail draws one marker every ${every} steps, at most ${shown} markers; every step still runs.` : `The trail draws at most ${shown} markers.`;
  const edit = text => clampPoints(dropRetained ? SENTENCE_OF_RETAINED(text) : text, c.stated, shown);
  const list = items => (items || []).map(edit).filter(Boolean);
  const notices = [c.stated ? `${CHANGED}the trail draws ${shown} markers, one every ${every} steps, instead of ${c.stated}; every step still runs.` : `${CHANGED}the trail draws at most ${shown} markers.`];
  if (dropRetained) notices.push(`${CHANGED}the kept comparison path is left out so the scene can be built.`);
  if (c.retained && !dropRetained) notices.push(`${CHANGED}the kept comparison path also draws at most ${shown} markers.`);
  const changed = { ...plan, description: edit(plan.description) || plan.description, interactions: list(plan.interactions), assumptions: [...list(plan.assumptions).slice(0, 7), steps], limitations: [...notices, ...list(plan.limitations)].slice(0, 8) };
  return { changed, notices, shown, every };
}

// One or two supported changes that keep the learning goal, every control and the rule the scene computes, each with the exact words of
// what changes. Each is checked against the contract and estimated again; one that does not fit is not offered.
export function planAlternatives(plan, request, limitOf) {
  const c = estimateDraftBytes(plan);
  if (!c.trail) return [];
  const fixed = c.bytes - BYTES.marker * c.drawn;
  const build = (id, title, dropRetained) => {
    const copies = c.retained && !dropRetained ? 2 : 1;
    const markers = Math.min(c.stated || DEFAULT_MARKERS, Math.floor((limitOf(plan) - MARGIN - fixed) / (BYTES.marker * copies)));
    if (markers < MIN_MARKERS) return null;
    const { changed, notices } = shrunk(plan, c, markers, dropRetained);
    if (!validateAnimationPlan(changed, enabledCapabilities()).ok || estimateDraftBytes(changed).bytes > limitOf(changed)) return null;
    return { id, title, changes: notices, plan: changed };
  };
  const out = [build('fewer_markers', 'Draw a shorter trail', false)];
  if (c.retained && !ASKED_TO_KEEP.test(request || '')) out.push(build('no_kept_path', 'Leave out the kept path', true));
  return out.filter(Boolean).slice(0, 2);
}

// The plan's size verdict and its learner-facing words. -> { over: false } | { over: true, keep, why, alternatives, estimate }
export function sizeCheck(env, job, plan, tasks) {
  const limitOf = changed => draftLimit(env, { ...job, plan: changed }, tasks), estimate = estimateDraftBytes(plan), limit = limitOf(plan);
  if (estimate.bytes <= limit) return { over: false, estimate: { bytes: estimate.bytes, limit } };
  const parts = [estimate.stated ? `a trail of ${estimate.stated} markers` : estimate.trail ? 'a full trail' : '', estimate.retained ? 'a kept comparison path of the same length' : '', estimate.objects ? `${estimate.objects} separate objects` : '', estimate.labels > 6 ? `${estimate.labels} labels and readouts` : ''].filter(Boolean);
  return { over: true, keep: estimate.bytes <= limit * CLEARLY_OVER, estimate: { bytes: estimate.bytes, limit },
    why: `By our estimate this plan is too large to build and check${parts.length ? `: it draws ${and(parts)}` : ''}. An estimate can be wrong. Nothing has been built, and no AI credits have been used on building.`,
    alternatives: planAlternatives(plan, job.prompt, limitOf) };
}
const and = items => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

// The planner's gap reason as a sentence for the learner, or null when it cannot be shown as one: it is model text, so markup, URLs, code,
// ids and anything about the system stay private (the unedited reply stays in the job's diagnostics).
const NOT_FOR_LEARNERS = /[{}<>[\]`\\$|]|\.\.\.|…|https?:|www\.|\b\w+_\w+\b|\b(?:json|schema|tool|prompt|system|model|token|capabilit(?:y|ies)|requested|requiredCapabilities|phase|enum)\b/i;
export function learnerReason(raw) {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (text.length < 8 || text.length > 300 || NOT_FOR_LEARNERS.test(text)) return null;
  const capital = text[0].toUpperCase() + text.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
}
export const GAP_FALLBACK = 'This request needs something the current 3D scenes cannot do.';

// What the planner can be asked for instead of a request it called a gap: server words, each a new plan the learner then reviews.
export const GAP_ALTERNATIVES = Object.freeze([
  Object.freeze({ id: 'watch', title: 'A scene to watch', changes: ['A looping illustration of the idea, built from simple shapes, that you can look around.', 'It shows the idea rather than running the real thing.'],
    note: 'The learner accepted this alternative: a looping scene to watch that illustrates the idea with simple shapes and formula-driven motion. Plan it, and say in limitations exactly what it cannot do of what was asked.' }),
  Object.freeze({ id: 'experiment', title: 'A small experiment', changes: ['A simplified model with a few settings you can change and numbers that respond.', 'It uses a simplified rule, stated on the plan, not the full system you asked for.'],
    note: 'The learner accepted this alternative: a small experiment with a simplified model, a few parameters and computed readouts that illustrate the idea. Plan it, state the simplification in the first assumption, and say in limitations exactly what it cannot do of what was asked.' }),
]);
// A failed build's plan made smaller by the planner, for an oversized plan with no change the server can make itself.
export const SIMPLER_ALTERNATIVE = Object.freeze({ id: 'simpler', title: 'A simpler plan', changes: ['The planner rewrites the plan with fewer drawn objects and shorter labels.', 'The learning goal and your controls stay; anything it must leave out is listed on the new plan.'],
  note: 'The previous plan looked too large to build and check. Revise it so the scene is smaller: fewer objects and markers, shorter labels and simpler rules. Keep the learning goal and every parameter of the previous plan.' });

// One clarification, before any paid plan call: a request naming nothing to show. shortcut: only a request with no subject word at all is
// caught; a clear subject with an unclear goal goes to the planner, which has no way to ask (a schema and prompt decision, in the report).
const GENERIC = new Set('a an the this that these those it some something anything any thing stuff me my i we us you please can could would will should let lets make create build generate show draw give want need like to of for and or with in on about how what is are be do does cool nice good simple short quick small fun new interactive 3d three dimensional d animation animate animated animations scene scenes experiment experiments game games mini minigame simulation simulate demo visual visualization visualisation model example one card'.split(' '));
export function clarificationFor(job) {
  if (job.refinement || job.plan || job.context?.refText || job.context?.refs?.length || job.context?.text || job.evidence?.length) return null;
  const words = String(job.prompt || '').toLowerCase().replace(/^\/[a-z0-9-]+\s*/, '').match(/[\p{L}\p{N}]+/gu) || [];
  if (words.some(word => !GENERIC.has(word))) return null;
  const kind = words.some(word => /^(game|games|minigame)$/.test(word)) ? 'game' : words.some(word => /^(experiment|experiments)$/.test(word)) ? 'experiment' : 'animation';
  return { question: `What should this ${kind} show or teach? Send the request again with the subject, for example: ${kind === 'game' ? 'a game where I launch a ball to hit a target' : kind === 'experiment' ? 'an experiment where I change a pendulum\'s length and see its period' : 'how a pendulum\'s length changes its period'}.` };
}
