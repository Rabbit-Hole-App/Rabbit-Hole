// The scene families the design can fill (brief 13). The pick (interact-design-pick.js) builds its `family` choice from this list, so a new family is one more entry: its id, what its scene SHOWS (pickCriterion,
// never the subject) and its module. Codex's curve-sliders adds its own entry here when its module lands.
//
// A family module (family contract, owner 2026-11-14 00:50; the shape is documented where the vertical-throw one is built, packages/web/src/interact-family-vertical-throw.js) exports:
//   id, FAMILY ({ id, depths: { depth: { template, roles, inputs: [[inputId, 'range' | 'fixed']] } } }), INPUTS, ROLES, LIMITS, scalars,
//   referenceCheck(brief, depth), expandBrief, extractBrief, familyDescription(depth), formulaGrammar, formulaRules(depth) -> lines (the rules after the grammar), templates, context(...), and optionally independent: { id, domain }.
// Everything reads the module: briefSchema(depth, module), fillSystem(depth, info, module), module.referenceCheck, generateProgram (by the family whose `templates` name the plan's template).
import { briefSchema } from '../../web/src/interact-plan-brief.js';
import { verticalThrow as verticalThrowModule } from '../../web/src/interact-family-vertical-throw.js';
import { curveSliders as curveSlidersModule } from '../../web/src/interact-family-curve-sliders.js';

export const verticalThrow = Object.freeze({
  id: verticalThrowModule.id,
  pickCriterion: 'One object launched straight up under constant gravity, slowing, stopping for an instant at the top and falling back; no air resistance, no angle, no second force.',
  module: Object.freeze({ ...verticalThrowModule, family: verticalThrowModule.FAMILY, briefSchema: depth => briefSchema(depth, verticalThrowModule) }),
});

export const curveSliders = Object.freeze({
  id: curveSlidersModule.id,
  pickCriterion: curveSlidersModule.pickCriterion,
  module: Object.freeze({ ...curveSlidersModule, family: curveSlidersModule.FAMILY, briefSchema: depth => briefSchema(depth, curveSlidersModule) }),
});
export const INTERACT_FAMILIES = Object.freeze([verticalThrow, curveSliders]);
