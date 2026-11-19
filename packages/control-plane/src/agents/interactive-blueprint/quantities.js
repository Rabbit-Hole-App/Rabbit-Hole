// Brief 38 spec section 7.8: the short form the seeded arm's first call uses: the first two fields of the blueprint only.
import { LIMITS as L } from '../../../../web/src/interact-blueprint.js';

export const QUANTITIES = `## The first part of the blueprint

Return one JSON object with only the first two fields of the interactive-blueprint: the relationship and the quantities. The rest is written in a later step.

relationship: what answers the question.
- statement: the rule, law or procedure, in one or two sentences (at most ${L.statement} characters)
- formula: its central equation as one line of TeX of at most ${L.formula} characters; null when there is none
- assumptions: ${L.assumptions[0]} to ${L.assumptions[1]} short sentences naming what is idealised or held fixed (at most ${L.assumption} characters each)

quantities: every quantity that plays a part in the question, ${L.quantities[0]} to ${L.quantities[1]}, each { id, label, unit, role, meaning }. role is "control" for every quantity a learner could usefully change in a scene, "fixed" for one that stays constant, or "result" for one that is computed from the others. label is at most ${L.quantityLabel} characters, meaning at most ${L.meaning}. A later step keeps at most three of the controls.

Ids are letters, digits and underscores, start with a letter, and are unique among the quantities.

Return the JSON object only.`;
