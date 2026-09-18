import { z } from 'zod';

// The interactive scene contract: one validated envelope, a registry of
// reviewed behaviours, and pure reducers. A behaviour owns which actions are
// legal, how state changes and how a result is produced; renderers only draw.
// Nothing here executes lesson-supplied code — specs are data.

export const EXECUTION_MODES = ['illustration', 'local_calculation', 'recorded_run', 'live_run'];

const interactionSchema = z.object({
  input: z.enum(['button', 'drag_handle', 'number', 'select', 'toggle', 'drop_target']),
  label: z.string().max(60).optional(),
  target: z.string().max(64).optional(),
  action: z.string().max(64),
});

export const sceneSchema = z.object({
  type: z.literal('interactive_scene'),
  id: z.string().min(1).max(100),
  schemaVersion: z.literal(1),
  behaviorId: z.string().min(1).max(64),
  renderer: z.enum(['svg', 'flow']),
  conceptIds: z.array(z.string().max(80)).max(12).default([]),
  sourceRefs: z.array(z.object({ path: z.string().max(200), line: z.number().int().optional() })).max(8).default([]),
  initialState: z.record(z.any()).default({}),
  interactions: z.array(interactionSchema).max(12).default([]),
  execution: z.object({ mode: z.enum(EXECUTION_MODES) }).default({ mode: 'illustration' }),
  buildGoal: z.string().max(400).optional(),
  checkGoal: z.string().max(400).optional(),
});

const behaviors = new Map();

export function registerBehavior(behavior) {
  behaviors.set(behavior.id, behavior);
  return behavior;
}

export const getBehavior = id => behaviors.get(id) || null;

// A spec is only usable when its envelope validates AND its behaviour accepts
// the initial state; an unknown behaviour fails loudly instead of improvising.
export function prepareScene(raw) {
  const parsed = sceneSchema.safeParse(raw);
  // Zod's raw issue dump is unreadable in a lesson block; name the field.
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`Invalid activity specification at ${issue.path.join('.') || 'root'}: ${issue.message}`);
  }
  const spec = parsed.data;
  const behavior = behaviors.get(spec.behaviorId);
  if (!behavior) throw new Error(`Unsupported activity: no behaviour "${spec.behaviorId}" is registered`);
  if (!behavior.renderers.includes(spec.renderer)) throw new Error(`Behaviour "${spec.behaviorId}" cannot use the ${spec.renderer} renderer`);
  const state = behavior.start(spec);
  for (const interaction of spec.interactions) {
    if (!behavior.actions.includes(interaction.action)) throw new Error(`Behaviour "${spec.behaviorId}" has no action "${interaction.action}"`);
  }
  return { spec, behavior, state };
}

// Every learner input becomes a named action; unknown or invalid actions are
// rejected with a reason rather than silently ignored.
export function applyAction(behavior, spec, state, action) {
  if (!behavior.actions.includes(action.type)) return { state, error: `Unknown action "${action.type}"` };
  try {
    const next = behavior.reduce(state, action, spec);
    return { state: next === undefined ? state : next, error: '' };
  } catch (problem) {
    return { state, error: problem.message };
  }
}

// What the tutor is told about an activity: never React elements or renderer
// instances, only the semantic state.
export function sceneContext(spec, state, behavior, selected) {
  return {
    activityId: spec.id,
    behaviorId: spec.behaviorId,
    conceptIds: spec.conceptIds,
    executionMode: spec.execution.mode,
    buildGoal: spec.buildGoal || null,
    checkGoal: spec.checkGoal || null,
    selectedObject: selected || null,
    state: behavior.describe ? behavior.describe(state, spec) : state,
  };
}
