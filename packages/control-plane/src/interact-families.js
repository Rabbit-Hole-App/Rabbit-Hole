// The scene families the design can fill (brief 13). The pick (interact-design-pick.js) builds its `family` choice from this list, so a new family is one more entry: its id, what its scene SHOWS (pickCriterion,
// never the subject) and its module (the exports the fill and the expansion use). Codex's curve-sliders adds its own entry here when its module lands.
import { FAMILY, briefSchema, expandBrief, familyDescription, referenceFormulaCheck } from '../../web/src/interact-plan-brief.js';

export const verticalThrow = Object.freeze({
  id: FAMILY.id,
  pickCriterion: 'One object launched straight up under constant gravity, slowing, stopping for an instant at the top and falling back; no air resistance, no angle, no second force.',
  module: Object.freeze({ family: FAMILY, briefSchema, expandBrief, familyDescription, referenceFormulaCheck }),
});

export const INTERACT_FAMILIES = Object.freeze([verticalThrow]);
