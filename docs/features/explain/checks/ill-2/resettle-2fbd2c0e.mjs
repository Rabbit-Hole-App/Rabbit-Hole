// ILL-2 offline proof: the archived delivered body of card 2fbd2c0e (plan null, a generated picture and a diagram) settled with the OLD no-plan rule (mix null) and with the NEW one
// (cap = implied pictures = 0, so mix { diagram: 3, illustration: 0 }). Counts fences only; the card's prose is not printed.
import fs from 'node:fs';
import { settleExplanationBody, markdownIllustrations, markdownVisuals } from './src/learn-primitives.js';
import { deriveVisualRequirements, requirementText, requiredMix } from './src/explanation-visuals.js';
const rec = JSON.parse(fs.readFileSync('C:/s/gen1-prep/card-2fbd2c0e.json', 'utf8'));
const body = rec.returned.body;
const wanted = deriveVisualRequirements(requirementText({ args: rec.request.args }));
const noPlan = rec.plan === null; // the archived plan: null
const implied = (wanted.items ?? []).filter(i => i.kind === 'illustration' && i.implied).length;
const counts = md => ({ pictures: markdownIllustrations(md).length, diagrams: markdownVisuals(md).diagrams.length, chars: md.length });
const oldMix = requiredMix(wanted); // the shipped rule with no plan and nothing learner-named: null (nothing capped)
const newMix = requiredMix(wanted) ?? (noPlan ? { diagram: Math.max(0, 3 - implied), illustration: implied } : null);
console.log(JSON.stringify({ archivedPlan: rec.plan, requestArgsLength: rec.request.args.length, visualRequirementsItems: wanted.items?.length ?? null, impliedPictures: implied, oldMix, newMix }));
console.log('archived body ', JSON.stringify(counts(body)));
console.log('OLD  re-settled', JSON.stringify(counts(settleExplanationBody(body, oldMix))));
console.log('NEW  re-settled', JSON.stringify(counts(settleExplanationBody(body, newMix))));
