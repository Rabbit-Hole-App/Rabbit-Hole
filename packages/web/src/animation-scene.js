import { z } from 'zod';
import { GEOMETRY, HEAT_MODES, IDENTITY_SLOTS, ROLES, SOUNDS, TIMING, TYPE_ROLES } from './scene-vocab.js';
import { adaptLegacyScene } from './scene-legacy.js';
import { computeValueChainGroups, resolveDerived } from './scene-derive.js';

// The animation source of truth: scene JSON plus a pure evaluator. Neither
// React nor tldraw is imported here, so the live canvas and the video exporter
// read the same state for the same time.

const vector = z.object({ x: z.number(), y: z.number() });

// Every type here has a branch in AnimatedScene.jsx. Adding a member without
// one produces an object that validates and draws nothing, which is how arrow,
// line and image shipped invisible. The renderer's own test reads this list.
export const RENDERED_TYPES = ['box', 'text', 'circle', 'arrow', 'line', 'equation', 'code', 'image', 'grid', 'strip', 'bars', 'tokens'];

const objectSchema = z.object({
  id: z.string().min(1).max(64),
  // Primitives that are the mathematical object itself, not a label for it.
  type: z.enum(RENDERED_TYPES),
  semanticId: z.string().max(64).optional(),
  conceptId: z.string().max(64).optional(),
  initialState: z.object({
    label: z.string().max(200).optional(),
    text: z.string().max(600).optional(),
    x: z.number().default(0),
    y: z.number().default(0),
    w: z.number().positive().max(2000).optional(),
    h: z.number().positive().max(2000).optional(),
    opacity: z.number().min(0).max(1).default(1),
    rotation: z.number().min(-360).max(360).default(0),
    role: z.enum(ROLES).default('neutral'),
    // A short authoring key, not a palette slot - see validateScene's own
    // assignment pass below for why a scene never gets to name a colour here
    // either, the same rule role already follows.
    identity: z.string().min(1).max(40).optional(),
    // What a displayed number IS, not what it means: an authored fact, a
    // mechanically derived result, or an explicit sketch with no claim of
    // being computed. Defaults to literal because most authored numbers are
    // - a drawn vector's own components, for instance. resolveDerived (see
    // scene-derive.js) is the only path that may stamp "derived", and the
    // consistency checker is the only thing that enforces which objects must
    // carry it.
    provenance: z.enum(['literal', 'derived', 'illustrative']).default('literal'),
    // What a grid IS, semantically - never inferred from whether it happens
    // to carry row/column labels or a heat ramp, both of which are
    // presentation choices an author can add, omit or reword without
    // changing what the matrix actually claims. input: authored ground
    // truth, a table of given values. relational: states a relationship
    // between two labelled sets the scene draws (a score, similarity or
    // cost matrix). derived: itself the result of a computation on
    // declared inputs, without necessarily comparing two sets (a
    // projection, an elementwise transform). Only relational and derived
    // are subject to the consistency checker's arithmetic gates - see
    // scene-consistency.js.
    matrixKind: z.enum(['input', 'relational', 'derived']).optional(),
    // Does every row of this object's values claim to be a probability
    // distribution (each entry in [0, 1], summing to ~1)? An explicit claim,
    // not inferred from a label containing the word "softmax" - a caption
    // is prose an author can reword freely without that changing what the
    // numbers themselves assert.
    distribution: z.boolean().optional(),
    typography: z.enum(TYPE_ROLES).default('body'),
    from: vector.optional(),
    to: vector.optional(),
    rows: z.number().int().positive().max(64).optional(),
    cols: z.number().int().positive().max(64).optional(),
    cell: z.number().positive().max(80).optional(),
    // null is a blank cell, not a zero: a masked or not-yet-computed entry
    // must read as absent rather than as a real measurement of nothing.
    values: z.array(z.number().nullable()).max(256).optional(),
    labels: z.array(z.string().max(24)).max(64).optional(),
    // A grid's own axis names - query words down the left, key words across
    // the top - never attention-specific, so a confusion matrix or a
    // covariance table can name its axes exactly the same way.
    rowLabels: z.array(z.string().max(24)).max(64).optional(),
    columnLabels: z.array(z.string().max(24)).max(64).optional(),
    tokens: z.array(z.string().max(24)).max(48).optional(),
    src: z.string().max(300).optional(),
    // Show only this region of the image, as fractions of the object's own
    // displayed box (0..1 each). The renderer maps the fractions through the
    // same centre-slice fit the full image uses, so a crop names exactly the
    // region a grid overlaid on the displayed image would name.
    crop: z.object({
      x: z.number().min(0).max(1), y: z.number().min(0).max(1),
      w: z.number().gt(0).max(1), h: z.number().gt(0).max(1),
    }).optional(),
    // true predates modes and still means the same thing it always did - the
    // gate below normalises both spellings to { mode } so nothing past it
    // reads a bare boolean.
    heat: z.union([z.boolean(), z.object({ mode: z.enum(HEAT_MODES) })], {
      error: () => `not a heat mode: write true or one of ${HEAT_MODES.join(', ')}`,
    }).optional(),
    peak: z.number().positive().max(1e6).optional(),
    // VALUE's own scaling gate, following matrixKind's own rule: required on
    // any heat object (checked below, once heat is normalised), no default -
    // an absent field would silently reinstate the exact per-object
    // normalisation this whole axis exists to replace. local: honest only
    // about the pattern inside this one object, makes no cross-object claim.
    // shared: every object naming the same valueScaleGroup uses one common
    // domain. fixed: a known semantic domain (today: probabilities, [0, 1]).
    // See docs/superpowers/specs/2026-09-18-visual-language-and-motion-design.md.
    valueScale: z.enum(['local', 'shared', 'fixed']).optional(),
    // Names the objects a "shared" valueScale compares honestly against.
    // Meaningless (and refused below) on "local" or "fixed" - fixed's domain
    // is a constant, not a negotiation between group members.
    valueScaleGroup: z.string().min(1).max(60).optional(),
    // Which STATE a cellHighlight/highlight_cell draws as: 'select' (default)
    // is a genuine learner pick and gets the SelectionMark two-tone ring;
    // 'highlight' is a downstream consequence and gets only the existing
    // highlighted-role-ring treatment, so the two never read the same way.
    // See AnimatedScene.jsx's grid/strip path.
    cellHighlightKind: z.enum(['select', 'highlight']).optional(),
    // An authored opening highlight, same shapes highlight_cell events carry
    // (a flat index, several, a row/col band, bars' 'max'). Exists so an
    // interactive scene can bind the lit part to a learning input through the
    // derive pool; a later highlight_cell event still overrides it.
    cellHighlight: z.union([
      z.number().int(), z.array(z.number().int()).max(256),
      z.object({ row: z.number().int().optional(), col: z.number().int().optional() }),
      z.literal('max'),
      // A derived highlight may resolve to "nothing selected" (argmin over a
      // fully gated vector) - an explicit null, distinct from never authored.
      z.null(),
    ]).optional(),
    // Direct manipulation on the visual: clicking this object's Nth item (a
    // token chip, a grid cell) writes N to the named learning input. Names an
    // input declaration, never behaviour - evaluateScene refuses a name that
    // is not a declared index input over a domain of this object's item count.
    pickInput: z.string().min(1).max(40).optional(),
    // How a token sequence is drawn. 'chips' (the default) is the affordance
    // of something operable; 'labels' draws plain text, for a sequence that
    // NAMES things and must not read as a second control row - the card
    // grammar puts the real control in the INTERACT zone below the visual.
    tokenStyle: z.enum(['chips', 'labels']).optional(),
    // How a grid or strip prints its numbers (scene-format.js): two decimals
    // by default at every magnitude; 'integer' for values that are whole by
    // meaning - token IDs, counts - never inferred from a value's size.
    numberFormat: z.enum(['decimal', 'integer']).optional(),
  }).prefault({}),
});

const EASINGS = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'spring'];

const eventSchema = z.object({
  at: z.number().min(0).max(600),
  // Only interpolate when the intermediate values are mathematically
  // meaningful: set_values eases within one quantity, so every step of the
  // way is a real reading of it. replace_values swaps to a different
  // quantity outright, because no value between the two is real - the
  // mid-point of raw scores and the probabilities they become is not a
  // score, not a probability, and not a thing that ever occurred.
  action: z.enum([
    'appear', 'disappear', 'move', 'resize', 'rotate', 'highlight', 'unhighlight',
    'draw_path', 'erase_path', 'change_text', 'type_text', 'change_value',
    'connect', 'disconnect', 'focus_camera', 'pan_camera', 'zoom_camera', 'pause',
    'set_values', 'replace_values', 'highlight_cell', 'sweep', 'emphasize',
  ]),
  target: z.string().max(64).optional(),
  from: z.string().max(64).optional(),
  to: z.string().max(64).optional(),
  duration: z.union([z.number().min(0).max(60), z.enum(Object.keys(TIMING))], {
    error: () => `not a timing: write seconds or one of ${Object.keys(TIMING).join(', ')}`,
  }).default(0),
  easing: z.enum(EASINGS).default('easeInOut'),
  value: z.any().optional(),
  // Named, not authored as pitch or gain: getSceneState never reads this
  // field (see scene-sound.js) - a scene means the same thing whether or not
  // anyone can hear it.
  sound: z.enum(SOUNDS).optional(),
});

export const animationSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().max(200).optional(),
  width: z.number().positive().max(4096).default(960),
  height: z.number().positive().max(4096).default(540),
  duration: z.number().positive().max(120),
  objects: z.array(objectSchema).max(60),
  timeline: z.array(eventSchema).max(200),
  camera: z.object({ x: z.number().nullable().default(null), y: z.number().nullable().default(null), zoom: z.number().positive().max(8).default(1) }).prefault({}),
});

const ease = (kind, t) => {
  const clamped = Math.max(0, Math.min(1, t));
  if (kind === 'linear') return clamped;
  if (kind === 'easeIn') return clamped * clamped;
  if (kind === 'easeOut') return 1 - (1 - clamped) ** 2;
  // A visual spring that still settles exactly at 1, so a diagram never
  // finishes off its mark.
  if (kind === 'spring') return clamped === 1 ? 1 : 1 - Math.cos(clamped * Math.PI * 1.5) * (1 - clamped) ** 2 - (1 - clamped) ** 2;
  return clamped < 0.5 ? 2 * clamped * clamped : 1 - (-2 * clamped + 2) ** 2 / 2;
};

// How far through an event we are at this time: 0 before it starts, 1 once it
// has finished, eased in between.
const phase = (event, time) => {
  if (time <= event.at) return 0;
  if (!event.duration) return 1;
  return ease(event.easing, (time - event.at) / event.duration);
};

// An image source is a policy, not a length. A third-party origin would make a
// lesson a tracking beacon, and a data: URI would put megabytes into the
// learner's persisted canvas. One leading slash, no scheme, no traversal.
const SAME_ORIGIN = /^\/[A-Za-z0-9._~\-/]*$/;

export function validateScene(raw) {
  // Computed from the scene AS AUTHORED - raw.derived and every $derive
  // marker - before resolveDerived below flattens them away. See scene-
  // derive.js's own comment: an object here is one whose values are derived
  // from, or feed into, another object's, through the scene's own derived
  // graph, whether or not an author declared a valueScaleGroup to say so.
  const valueChainGroups = computeValueChainGroups(raw);
  // exampleData -> derived -> everything else: any $derive marker or {{name}}
  // interpolation is materialised into a literal number here, before zod
  // ever sees it, and the object it touched is stamped provenance: derived.
  // See scene-derive.js - this is the one place duplicated numbers stop
  // being possible, so it must run before anything else.
  raw = resolveDerived(raw);
  // A legacy scene may still name a hex colour. Translate the closed set we
  // recognise into a role before zod ever sees `color` - unknown keys are
  // dropped silently by zod, and a dropped colour is exactly the failure this
  // gate exists to prevent, so it must be caught before the drop happens.
  raw = adaptLegacyScene(raw);
  const parsed = animationSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`Invalid animation at ${issue.path.join('.') || 'root'}: ${issue.message}`);
  }
  const scene = parsed.data;
  const byId = new Map(scene.objects.map(object => [object.id, object]));
  const ids = new Set(byId.keys());
  if (ids.size !== scene.objects.length) throw new Error('Every animation object needs a unique id');
  // IDENTITY's slot assignment: first-seen wins, in authored object order,
  // computed once here and carried on the object (getSceneState just reads
  // it back) - so replaying or scrubbing the same scene can never re-roll
  // it. This map is scoped to THIS validateScene call alone; it is not a
  // registry, on purpose (see scene-vocab.js's IDENTITY_SLOTS comment).
  const identitySlots = new Map();
  // How many heat objects sit in each derive-chain component (see
  // computeValueChainGroups) - computed once, before the per-object loop
  // below needs to ask "does this object share its chain with another heat
  // object", so a chain of exactly one heat object (nothing to compare
  // against) does not itself refuse "local".
  const heatChainGroupCounts = new Map();
  for (const object of scene.objects) {
    if (!object.initialState.heat) continue;
    const group = valueChainGroups.get(object.id);
    if (group != null) heatChainGroupCounts.set(group, (heatChainGroupCounts.get(group) || 0) + 1);
  }
  for (const object of scene.objects) {
    // Same normalisation event.duration gets further down: one shape leaves
    // the gate, whichever one an author wrote going in.
    const heat = object.initialState.heat;
    object.initialState.heat = heat === true ? { mode: 'magnitude' } : heat || null;
    // VALUE's scaling gate, required on any heat object for the same reason
    // matrixKind is required on any valued grid: no default, or the field
    // reinstates by omission the exact silent per-object normalisation it
    // replaces. A DECLARATION IS NOT AUTOMATICALLY HONEST, so "local" is
    // additionally refused - not merely discouraged - wherever the object
    // provably participates in a comparison: it names a valueScaleGroup (a
    // stated intent to share, contradicted by also opting out of sharing),
    // or its values sit in a multi-member component of the scene's own
    // derive graph (a chain nobody had to declare for it to be real). The
    // third way "local" gets refused - a case-level matrix_operation or
    // live_computation pattern - has no scene-local signal to check against
    // here and lives in scene-consistency.js instead.
    if (object.initialState.heat) {
      const { valueScale, valueScaleGroup } = object.initialState;
      if (!valueScale) {
        throw new Error(`Object "${object.id}": a heat object must declare valueScale: local, shared, or fixed`);
      }
      if (valueScale === 'local') {
        if (valueScaleGroup) {
          throw new Error(`Object "${object.id}": shares valueScaleGroup "${valueScaleGroup}", so valueScale must be shared or fixed, not local - a grouped object cannot self-normalise`);
        }
        const chainGroup = valueChainGroups.get(object.id);
        if (chainGroup != null && (heatChainGroupCounts.get(chainGroup) || 0) > 1) {
          throw new Error(`Object "${object.id}": its values are derived from, or feed into, another heat object in this scene's computation chain, so valueScale must be shared or fixed, not local`);
        }
      }
    }
    const identity = object.initialState.identity;
    if (identity == null) {
      object.identitySlot = null;
    } else {
      if (!identitySlots.has(identity)) identitySlots.set(identity, IDENTITY_SLOTS[identitySlots.size % IDENTITY_SLOTS.length]);
      object.identitySlot = identitySlots.get(identity);
    }
    if (object.type === 'image') {
      const src = object.initialState.src;
      if (!src) throw new Error(`Object "${object.id}": an image needs a src`);
      if (!SAME_ORIGIN.test(src) || src.includes('..') || src.startsWith('//')) {
        throw new Error(`Object "${object.id}": an image src must be a same-origin path beginning with a single /`);
      }
      // An image has no intrinsic size here - sizeOf gives it none - so without
      // a width and height it renders as an element with no dimensions, which is
      // engine-dependent and silently invisible.
      if (!(object.initialState.w && object.initialState.h)) {
        throw new Error(`Object "${object.id}": an image needs a width and height`);
      }
    }
    if (object.type === 'equation' && !(object.initialState.w && object.initialState.h)) {
      throw new Error(`Object "${object.id}": an equation needs a width and height`);
    }
    // One name per row or column, or the renderer would have to guess which
    // label belongs to which line - silently wrong for any grid that is not
    // square.
    if (object.type === 'grid') {
      const { rows, cols, rowLabels, columnLabels, values, matrixKind } = object.initialState;
      const rowCount = rows || 1;
      const colCount = cols || 1;
      if (rowLabels && rowLabels.length !== rowCount) {
        throw new Error(`Object "${object.id}": a grid with ${rowCount} rows needs ${rowCount} rowLabels, got ${rowLabels.length}`);
      }
      if (columnLabels && columnLabels.length !== colCount) {
        throw new Error(`Object "${object.id}": a grid with ${colCount} cols needs ${colCount} columnLabels, got ${columnLabels.length}`);
      }
      // matrixKind decides whether the consistency checker's arithmetic gates
      // apply (see scene-consistency.js) - undeclared must never mean exempt,
      // or omission (the default state of every scene not yet migrated, and
      // every new one an author writes) would be a wider bypass than the
      // label heuristic this replaced. No default: a grid that carries
      // values must say what it is.
      if (Array.isArray(values) && !matrixKind) {
        throw new Error(`grid "${object.id}" carries values and must declare matrixKind: input, relational, or derived`);
      }
    }
    // A stroke with no endpoints falls back to its own x/y for both ends - a
    // finite zero-length line, no NaN, but an invisible object that validated.
    // That is the failure this whole pass exists to stop.
    if (['arrow', 'line'].includes(object.type) && !(object.initialState.from && object.initialState.to)) {
      throw new Error(`Object "${object.id}": ${object.type === 'arrow' ? 'an' : 'a'} ${object.type} needs a from and a to`);
    }
  }
  for (const event of scene.timeline) {
    // A name is an author convenience, not something the evaluator should ever
    // parse: getSceneState both compares durations with `>` and sorts by
    // `a.duration - b.duration`, so every event must carry seconds by the time
    // it leaves this gate.
    if (typeof event.duration === 'string') event.duration = TIMING[event.duration];
    for (const key of ['target', 'from', 'to']) {
      if (event[key] && !ids.has(event[key])) throw new Error(`Timeline event at ${event.at}s refers to unknown object "${event[key]}"`);
    }
    if (event.action === 'set_values' || event.action === 'replace_values') {
      // A discrete switch still needs a real target and a real payload - the
      // domains differ, but the refusals that keep set_values honest apply
      // here for the same reasons, unrelated to whether it tweens.
      if (!event.target) throw new Error(`Timeline event at ${event.at}s: ${event.action} needs a target`);
      if (!Array.isArray(event.value)) throw new Error(`Timeline event at ${event.at}s: ${event.action} needs an array of numbers`);
      if (event.value.some(entry => entry !== null && !Number.isFinite(entry))) {
        throw new Error(`Timeline event at ${event.at}s: ${event.action} takes numbers or null, nothing else`);
      }
      // The object's own size is frozen from its authored values at build time
      // and the region hit-test reads that size, so a payload of a different
      // length would desynchronise the picture from what the learner can click.
      const authored = byId.get(event.target)?.initialState.values;
      if (!authored) throw new Error(`Timeline event at ${event.at}s: "${event.target}" has no values to change`);
      if (event.value.length !== authored.length) {
        throw new Error(`Timeline event at ${event.at}s: ${event.action} sends ${event.value.length} values to "${event.target}", which holds ${authored.length}`);
      }
    }
    // The camera schema bounds the scene's OPENING camera, but the events that
    // move it carry a z.any() value, and since the renderer started reading the
    // camera those events are what draws the frame. An unchecked zoom of 0 or a
    // pan with no x turns the whole viewBox into Infinity or NaN - a blank block
    // with nothing said, which is the failure every other refusal here prevents.
    if (event.action === 'zoom_camera' || event.action === 'focus_camera') {
      const zoom = event.action === 'zoom_camera' ? (event.value?.zoom ?? event.value) : event.value?.zoom;
      if (zoom !== undefined && !(Number.isFinite(zoom) && zoom > 0 && zoom <= 8)) {
        throw new Error(`Timeline event at ${event.at}s: a camera zoom must be a number above 0 and at most 8`);
      }
    }
    if (event.action === 'pan_camera' && !(Number.isFinite(event.value?.x) && Number.isFinite(event.value?.y))) {
      throw new Error(`Timeline event at ${event.at}s: pan_camera needs an x and a y`);
    }
    if (event.at + event.duration > scene.duration + 0.001) throw new Error(`Timeline event at ${event.at}s runs past the ${scene.duration}s scene`);
  }
  // VALUE's domain, resolved once here rather than re-guessed per frame from
  // whatever a single moment's values happen to be (the fix this whole axis
  // exists to make: see the module comment above heatChainGroupCounts). Every
  // number an object could EVER show - its own authored values, plus every
  // set_values/replace_values payload later aimed at it - is the same "true
  // maximum a bar will reach" computation this spec's A.5a section already
  // established as the honest one for a clamp; used here for VALUE's own
  // domain instead.
  const candidateRange = object => {
    const numbers = [...(object.initialState.values || [])];
    for (const event of scene.timeline) {
      if (event.target === object.id && Array.isArray(event.value)) numbers.push(...event.value);
    }
    return numbers.filter(value => value != null);
  };
  // For signed data in a shared group, a symmetric domain [-M, +M] - M the
  // largest absolute value across the group - keeps zero at the neutral
  // midpoint for every member, per the spec. A group with no negative
  // candidate at all (pure magnitude data) keeps its natural [0, max] instead
  // of manufacturing a negative half nothing in the group ever shows.
  const domainFor = numbers => {
    if (!numbers.length) return { min: 0, max: 1 };
    const min = Math.min(...numbers), max = Math.max(...numbers);
    if (min < 0) {
      const bound = Math.max(Math.abs(min), Math.abs(max), 0.0001);
      return { min: -bound, max: bound };
    }
    return { min: 0, max: Math.max(max, 0.0001) };
  };
  const sharedGroups = new Map();
  for (const object of scene.objects) {
    if (!object.initialState.heat || object.initialState.valueScale !== 'shared') continue;
    const group = object.initialState.valueScaleGroup;
    if (!group) throw new Error(`Object "${object.id}": valueScale "shared" needs a valueScaleGroup naming which objects share the domain`);
    if (!sharedGroups.has(group)) sharedGroups.set(group, []);
    sharedGroups.get(group).push(object);
  }
  for (const members of sharedGroups.values()) {
    const domain = domainFor(members.flatMap(candidateRange));
    for (const object of members) object.valueDomain = domain;
  }
  for (const object of scene.objects) {
    // fixed: a known semantic domain - today, probabilities on [0, 1], the
    // one example the spec names. A future second semantic domain is a
    // schema extension for the day a scene actually needs one, not a guess
    // made now.
    if (object.initialState.heat && object.initialState.valueScale === 'fixed') object.valueDomain = { min: 0, max: 1 };
  }
  return scene;
}

// Data primitives size themselves from their own contents, so an author
// writes rows and columns and never pixels. Both the renderer and region
// hit-testing read the size from here.
// A chip's padding and gap are spacing, so they sit on SPACE; its char width
// is a character-to-pixel measurement, neither spacing nor geometry, so it
// stays a plain constant. Exported individually rather than as one object -
// AnimatedScene.jsx's chip render needs these exact numbers too, to keep the
// drawn chip in sync with the width sizeOf already froze.
export const CHIP_PAD = 16, CHIP_GAP = 8, CHIP_CHAR = 9.5;
const sizeOf = object => {
  const state = object.initialState;
  const cell = state.cell ?? GEOMETRY.cellPitch;
  if (object.type === 'grid') return { w: (state.cols || 1) * cell, h: (state.rows || 1) * cell };
  if (object.type === 'strip') return { w: (state.values?.length || 1) * cell, h: cell };
  // Bars accept the same per-object `cell` pitch grids and strips already
  // have: the default suits single-character labels, but a bar labelled with
  // a word needs the pitch its own label actually occupies.
  if (object.type === 'bars') return { w: (state.values?.length || 1) * (state.cell ?? GEOMETRY.barWidth), h: state.h ?? GEOMETRY.barHeight };
  if (object.type === 'tokens') return { w: (state.tokens || []).reduce((total, token) => total + CHIP_PAD * 2 + token.length * CHIP_CHAR + CHIP_GAP, 0), h: GEOMETRY.chipHeight };
  return { w: state.w ?? (object.type === 'box' ? GEOMETRY.nodeMinWidth : undefined), h: state.h ?? (object.type === 'box' ? GEOMETRY.nodeHeight : undefined) };
};

// The whole point: same time in, same state out, with no renderer involved.
export function getSceneState(scene, time) {
  // Time arrives from persisted learner state, so it can be anything. A scene
  // that cannot be evaluated at a moment is worse than one evaluated at zero:
  // NaN makes every `event.at > at` false, so the whole timeline applies at once.
  const requested = Number(time);
  const at = Number.isNaN(requested) ? 0 : Math.max(0, Math.min(scene.duration, requested));
  const objects = new Map(scene.objects.map(object => [object.id, {
    id: object.id,
    type: object.type,
    semanticId: object.semanticId || object.id,
    conceptId: object.conceptId || null,
    visible: object.initialState.opacity > 0,
    opacity: object.initialState.opacity,
    x: object.initialState.x,
    y: object.initialState.y,
    w: object.initialState.w ?? sizeOf(object).w,
    h: object.initialState.h ?? sizeOf(object).h,
    rotation: object.initialState.rotation,
    role: object.initialState.role,
    // The raw authoring key and the slot validateScene resolved it to - see
    // its own comment above for why the slot is carried rather than
    // recomputed here: recomputing per call would let two evaluations of the
    // same scene disagree the moment an object order ever changed mid-flight.
    identity: object.initialState.identity ?? null,
    identitySlot: object.identitySlot ?? null,
    // Travels with the value so the critic and the tutor can both tell what a
    // number is, without re-deriving it themselves - see scene-derive.js.
    provenance: object.initialState.provenance,
    typography: object.initialState.typography,
    from: object.initialState.from ?? null,
    to: object.initialState.to ?? null,
    src: object.initialState.src ?? null,
    label: object.initialState.label ?? object.initialState.text ?? '',
    textProgress: 1,
    highlighted: false,
    rows: object.initialState.rows ?? null,
    cols: object.initialState.cols ?? null,
    cell: object.initialState.cell ?? GEOMETRY.cellPitch,
    values: object.initialState.values ? [...object.initialState.values] : null,
    // Read by AnimatedScene.jsx to decide whether a row's DISPLAYED cells
    // need distributeRounding (see scene-derive.js) - without this, "was this
    // authored as a normalised row" is invisible past validateScene, and every
    // reader of getSceneState's output (the renderer, the critic, the tutor)
    // would have to re-derive it from the raw scene instead of being told.
    distribution: object.initialState.distribution ?? false,
    labels: object.initialState.labels ?? null,
    rowLabels: object.initialState.rowLabels ?? null,
    columnLabels: object.initialState.columnLabels ?? null,
    tokens: object.initialState.tokens ?? null,
    // 'labels' draws a token sequence as plain display-only text instead of
    // chips - the renderer's cue that this is a labeled sequence, not a
    // control row (the control lives in the INTERACT zone below).
    tokenStyle: object.initialState.tokenStyle ?? null,
    numberFormat: object.initialState.numberFormat ?? null,
    heat: object.initialState.heat ?? null,
    peak: object.initialState.peak ?? null,
    // Both static for the object's whole life (validateScene resolves them
    // once, the same way identitySlot already is) - carried through rather
    // than recomputed per frame, or a "shared"/"fixed" domain would drift
    // with whatever a single moment's values happen to be, defeating the
    // point of not self-normalising.
    valueScale: object.initialState.valueScale ?? null,
    valueDomain: object.valueDomain ?? null,
    cellHighlight: object.initialState.cellHighlight ?? null,
    cellHighlightKind: object.initialState.cellHighlightKind ?? null,
    pickInput: object.initialState.pickInput ?? null,
    crop: object.initialState.crop ?? null,
    sweep: null,
    emphasis: 0,
  }]));
  const connections = [];
  // The camera names the point the frame is centred on. Unset means the middle
  // of the scene, so a scene that never mentions a camera is framed exactly as
  // it was before the camera did anything at all.
  let camera = { x: scene.camera.x ?? scene.width / 2, y: scene.camera.y ?? scene.height / 2, zoom: scene.camera.zoom };
  const events = [...scene.timeline].sort((a, b) => a.at - b.at || a.duration - b.duration);
  for (const event of events) {
    if (event.at > at) break;
    const progress = phase(event, at);
    const object = event.target ? objects.get(event.target) : null;
    switch (event.action) {
      case 'appear': if (object) { object.visible = true; object.opacity = progress; } break;
      case 'disappear': if (object) { object.opacity = 1 - progress; object.visible = object.opacity > 0.01; } break;
      case 'move': if (object && event.value) {
        object.x = object.x + (event.value.x - object.x) * progress;
        object.y = object.y + (event.value.y - object.y) * progress;
      } break;
      case 'resize': if (object && event.value) {
        object.w = (object.w ?? 0) + ((event.value.w ?? object.w ?? 0) - (object.w ?? 0)) * progress;
        object.h = (object.h ?? 0) + ((event.value.h ?? object.h ?? 0) - (object.h ?? 0)) * progress;
      } break;
      case 'rotate': if (object) object.rotation = object.rotation + ((event.value ?? 0) - object.rotation) * progress; break;
      case 'highlight': if (object) object.highlighted = progress > 0; break;
      case 'unhighlight': if (object) object.highlighted = progress < 1; break;
      case 'change_text': if (object && progress >= 1) { object.label = String(event.value ?? ''); object.textProgress = 1; } break;
      case 'type_text': if (object) { object.label = String(event.value ?? object.label); object.textProgress = progress; } break;
      case 'change_value': if (object) object.label = String(event.value ?? object.label); break;
      case 'draw_path':
      case 'connect': {
        const key = event.action === 'connect' ? `${event.from}->${event.to}` : event.target;
        const existing = connections.find(connection => connection.key === key);
        const drawn = {
          key,
          from: event.from || null,
          to: event.to || null,
          target: event.target || null,
          progress,
          semanticId: key,
        };
        if (existing) Object.assign(existing, drawn); else connections.push(drawn);
        break;
      }
      case 'erase_path':
      case 'disconnect': {
        const key = event.action === 'disconnect' ? `${event.from}->${event.to}` : event.target;
        const existing = connections.find(connection => connection.key === key);
        if (existing) existing.progress = 1 - progress;
        break;
      }
      // Numbers change into other numbers, so the learner watches the values
      // move rather than reading two static states.
      case 'set_values': if (object && Array.isArray(event.value)) {
        const target = event.value;
        object.values = (object.values || target.map(() => 0)).map((current, index) => {
          // Nothing has happened until the event is under way, in either
          // direction: a blank does not fill in and a value does not blank.
          if (progress === 0) return current;
          const goal = target[index];
          if (goal === null) return null;             // blanked; there is nothing to tween towards
          if (goal === undefined) return current;     // untouched
          const from = current == null ? 0 : current; // a blank cell grows back from zero
          return from + (goal - from) * progress;
        });
      } break;
      // A change of quantity, not a tween within one: the loop above already
      // withholds this event until event.at has passed, so landing here means
      // the switch is due. duration and easing are accepted on every event
      // schema alike, but there is no honest mid-point to ease through, so
      // they are read for every other action and never for this one.
      case 'replace_values': if (object && Array.isArray(event.value)) object.values = [...event.value]; break;
      case 'highlight_cell': if (object) object.cellHighlight = progress > 0 ? event.value : null; break;
      case 'sweep': if (object) object.sweep = progress >= 1 ? null : progress; break;
      case 'emphasize': if (object) object.emphasis = progress; break;
      case 'focus_camera': if (object) camera = { ...camera, x: object.x + (object.w ?? 0) / 2, y: object.y + (object.h ?? 0) / 2, zoom: event.value?.zoom ?? camera.zoom }; break;
      case 'pan_camera': if (event.value) camera = { ...camera, x: camera.x + (event.value.x - camera.x) * progress, y: camera.y + (event.value.y - camera.y) * progress }; break;
      case 'zoom_camera': if (event.value) camera = { ...camera, zoom: camera.zoom + ((event.value.zoom ?? event.value) - camera.zoom) * progress }; break;
      default: break; // pause is a timeline marker, not a state change
    }
  }
  return {
    time: at,
    objects: [...objects.values()],
    connections: connections.filter(connection => connection.progress > 0),
    camera,
  };
}

// Templates place objects so the agent supplies A -> B -> C, never pixels.
// GAP and PAD are spacing between and around nodes, so they sit on SPACE; a
// node's own width and height are GEOMETRY - the same values sizeOf gives a
// box with no authored size.
const GAP = 64, PAD = 48;

export function fromTemplate({ template = 'flow', id, title, duration = 8, direction = 'vertical', nodes = [] }) {
  if (!nodes.length) throw new Error('A template needs at least one node');
  const vertical = direction !== 'horizontal';
  const objects = nodes.map((node, index) => ({
    id: node.id || `node-${index}`,
    type: 'box',
    semanticId: node.semanticId || node.id || `node-${index}`,
    conceptId: node.conceptId,
    initialState: {
      label: node.label,
      x: PAD + (vertical ? 0 : index * (GEOMETRY.nodeMinWidth + GAP)),
      y: PAD + (vertical ? index * (GEOMETRY.nodeHeight + GAP) : 0),
      w: GEOMETRY.nodeMinWidth,
      h: GEOMETRY.nodeHeight,
      opacity: 0,
    },
  }));
  const step = duration / (nodes.length * 2);
  const timeline = [];
  objects.forEach((object, index) => {
    timeline.push({ at: Number((index * step * 2).toFixed(2)), action: 'appear', target: object.id, duration: 0.4 });
    if (index > 0) timeline.push({ at: Number((index * step * 2 - step * 0.6).toFixed(2)), action: 'connect', from: objects[index - 1].id, to: object.id, duration: Math.min(0.7, step) });
    if (template === 'highlight_explanation' || template === 'step_sequence') {
      timeline.push({ at: Number((index * step * 2 + step).toFixed(2)), action: 'highlight', target: object.id });
      if (index > 0) timeline.push({ at: Number((index * step * 2 + step).toFixed(2)), action: 'unhighlight', target: objects[index - 1].id });
    }
  });
  return validateScene({
    id, title, duration,
    width: vertical ? 2 * PAD + GEOMETRY.nodeMinWidth : 2 * PAD + nodes.length * GEOMETRY.nodeMinWidth + (nodes.length - 1) * GAP,
    height: vertical ? 2 * PAD + nodes.length * GEOMETRY.nodeHeight + (nodes.length - 1) * GAP : 2 * PAD + GEOMETRY.nodeHeight,
    objects, timeline,
  });
}
