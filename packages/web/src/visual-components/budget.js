// One counting policy for /explain scenes (EXP-T05). Every limit is an
// existing one, named once here with where it is enforced; this module adds
// no new ceiling. A change to any of them goes to the schema owner (Lane B)
// with its reason, and the budget tests pin each value to its source.
import { MAX_SCENE_VIEWPORT } from '../scene-layout.js';

export const LIMITS = Object.freeze({
  // explain-contract.js VisualSpec components, the same 40 the scene author
  // targets for objects (control-plane agents/learn-scene-author.js SCENE_AUTHORING).
  authoredComponents: 40,
  // On screen at once, per part (animation-scene.js validateScene; the
  // artifact schema's objects list, control-plane learn-primitives.js).
  objectsPerPart: 60,
  // Objects in one scene, all parts together (animation-scene.js animationSchema).
  objectsTotal: 240,
  // Sub-cards behind one pager (animation-scene.js part 0..3).
  parts: 4,
  // Scene JSON size and control settings the gates check exhaustively
  // (control-plane learn-scene-gates.js MAX_SCENE_CHARS, MAX_SETTINGS).
  sceneChars: 60000,
  settings: 64,
  // The widest and tallest card a scene may need (scene-layout.js).
  width: MAX_SCENE_VIEWPORT.w,
  height: MAX_SCENE_VIEWPORT.h,
  // Timeline events (animation-scene.js) and the author's duration ceiling
  // (learn-primitives.js scene.duration maximum).
  timelineEvents: 200,
  duration: 20,
});

// Image blocks the review call pays per capture (control-plane learn-spend.js,
// Anthropic models) and the themes every required capture covers.
export const REVIEW_IMAGE_TOKENS = 4784;
export const REVIEW_THEMES = 2;

// Render nodes inside one object: a grid draws a cell per entry, a token row a
// chip per token. The authored or compiled object count alone hides this.
function renderNodes(object) {
  const state = object.initialState || {};
  if (object.type === 'grid') return (state.rows || 1) * (state.cols || 1);
  if (object.type === 'strip' || object.type === 'bars') return Math.max(1, state.values?.length || 0);
  if (object.type === 'tokens') return Math.max(1, state.tokens?.length || 0);
  return 1;
}
function glyphs(object) {
  const state = object.initialState || {};
  const strings = [state.label, state.text, ...(state.labels || []), ...(state.rowLabels || []), ...(state.columnLabels || []), ...(state.tokens || []),
    ...(state.runs || []).map(run => run.text ?? run.tex)];
  return strings.reduce((sum, value) => sum + (typeof value === 'string' ? value.length : 0), 0);
}

// Every setting a learner can reach: the product of each visible control's
// values, counted the way learn-scene-gates.js controlValues lists them.
export function settingsCount(scene) {
  return (scene.inputs || []).filter(input => !input?.hidden).reduce((product, input) => {
    const values = input?.type === 'bool' ? 2 : input?.type === 'choice' ? (input.options || []).length
      : input?.type === 'index' ? (scene.exampleData?.[input.of] || []).length : Infinity;
    return product * Math.max(1, values);
  }, 1);
}

// Moments whose still image differs: the end state of a static scene, or
// every event start and end on a timeline. A still at each proves only those
// moments, so a timeline's coverage is never complete.
export function timeCheckpoints(scene) {
  const points = new Set([scene.duration]);
  for (const event of scene.timeline || []) {
    const duration = typeof event.duration === 'number' ? event.duration : 0;
    for (const at of [event.at, event.at + duration]) if (at <= scene.duration) points.add(Number(at.toFixed(3)));
  }
  return [...points].sort((a, b) => a - b);
}

// What a scene costs, measured separately per dimension. Shared objects
// (no part) count in every part they are visible on.
export function measureScene(scene, { authored = null } = {}) {
  const objects = scene.objects || [];
  const parts = [...new Set(objects.map(object => object.part).filter(part => part !== undefined))].sort();
  const visible = part => objects.filter(object => object.part === undefined || object.part === part);
  const perPart = (parts.length ? parts : [undefined]).map(part => {
    const list = visible(part);
    return { part: part ?? null, objects: list.length, renderNodes: list.reduce((sum, object) => sum + renderNodes(object), 0), glyphs: list.reduce((sum, object) => sum + glyphs(object), 0) };
  });
  const settings = settingsCount(scene);
  const checkpoints = timeCheckpoints(scene);
  const captures = (Number.isFinite(settings) ? settings : 0) * checkpoints.length * REVIEW_THEMES;
  return {
    authored,
    parts: perPart.length,
    perPart,
    objectsTotal: objects.length,
    renderNodesTotal: perPart.reduce((sum, part) => sum + part.renderNodes, 0),
    textChars: objects.reduce((sum, object) => sum + glyphs(object), 0),
    settings,
    timeCheckpoints: checkpoints,
    timelineEvents: (scene.timeline || []).length,
    duration: scene.duration,
    pixels: { width: scene.width, height: scene.height, area: scene.width * scene.height },
    sceneChars: JSON.stringify(scene).length,
    review: { captures, imageTokens: captures * REVIEW_IMAGE_TOKENS },
  };
}

// Each exceeded limit, named with its measured value. At the limit passes.
export function budgetIssues(measure) {
  const issues = [];
  const over = (code, value, limit, extra = {}) => { if (value > limit) issues.push({ code, value, limit, ...extra }); };
  if (measure.authored != null) over('authored-components', measure.authored, LIMITS.authoredComponents);
  for (const part of measure.perPart) over('objects-per-part', part.objects, LIMITS.objectsPerPart, part.part == null ? {} : { part: part.part });
  over('objects-total', measure.objectsTotal, LIMITS.objectsTotal);
  over('parts', measure.parts, LIMITS.parts);
  over('settings', measure.settings, LIMITS.settings);
  over('scene-chars', measure.sceneChars, LIMITS.sceneChars);
  over('width', measure.pixels.width, LIMITS.width);
  over('height', measure.pixels.height, LIMITS.height);
  over('timeline-events', measure.timelineEvents, LIMITS.timelineEvents);
  over('duration', measure.duration, LIMITS.duration);
  return issues;
}

// Overview/detail from measured density: one readable figure when it fits;
// otherwise the fewest detail parts that bring every part under the on-screen
// limit, keeping the shared context; otherwise refuse with the reason.
export function chooseDensity(measure) {
  const issues = budgetIssues(measure);
  if (!issues.length) return { layout: 'single', issues };
  const crowded = issues.every(issue => issue.code === 'objects-per-part' || issue.code === 'height');
  const needed = Math.ceil(measure.objectsTotal / LIMITS.objectsPerPart);
  if (measure.parts === 1 && crowded && needed <= LIMITS.parts && measure.objectsTotal <= LIMITS.objectsTotal) return { layout: 'split', parts: Math.max(2, needed), issues };
  return { layout: 'refuse', issues };
}
