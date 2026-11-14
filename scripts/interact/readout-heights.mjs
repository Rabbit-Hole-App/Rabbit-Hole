// Brief 14 section 2 (one place per number): for each pinned toss plan, the readouts row before and after the rule (composition.main.calloutReadoutIds, interact-composition.js),
// and an ESTIMATE of the row's wrapped lines at the 676 px card (642 px text column) from the card's own glyph advance tables (interact-description-fit.js textWidthPx, text-sm 14 px, gap-x 16 px).
// An estimate, not pixels: the real heights at 1440 x 900 are measured in the browser (scripts/interact/drive-look.mjs). No network, no model.
//   node scripts/interact/readout-heights.mjs
import { interactFixtures } from '../../packages/web/src/interact-plan-fixtures.js';
import { calloutReadoutIds } from '../../packages/web/src/interact-composition.js';
import { textWidthPx } from '../../packages/web/src/interact-description-fit.js';

const COLUMN = 642, FONT = 14, GAP = 16, LINE_PX = 20; // text-sm line box (leading-normal 20 px); gap-y 2 px between wrapped lines
const { referencePlans } = await interactFixtures();
const label = (plan, id) => {
  const q = plan.scene.quantities.find(x => x.id === id);
  if (q) return `${q.label}: -00.00 ${q.unit ?? ''}`.trim();
  return `${plan.scene.words[id.startsWith('motion') ? 'readout_motion' : 'readout_gravity'] ?? id}: Falling after release`; // a state readout: its label and a long state word
};
const lines = (plan, ids) => { if (!ids.length) return 0; let n = 1, used = 0; for (const id of ids) { const w = textWidthPx(label(plan, id), FONT); if (used && used + GAP + w > COLUMN) { n++; used = w; } else used += (used ? GAP : 0) + w; } return n; };
const px = n => (n ? n * LINE_PX + (n - 1) * 2 + 8 : 0); // the row plus the card's gap-2 above it (8 px) when it exists

console.log('plan        template   readouts before -> after                                    est. lines  est. row px (with its 8 px gap)');
for (const [name, plan] of Object.entries({ Overview: referencePlans.tossOverview, Standard: referencePlans.tossStandard, Deep: referencePlans.tossDeep, 'Moon ledge': referencePlans.ledgeTossMoon })) {
  const before = plan.scene.readoutIds, covered = calloutReadoutIds(plan), after = before.filter(id => !covered.includes(id));
  console.log(`${name.padEnd(11)} ${String(plan.scene.template).padEnd(10)} ${before.length} [${before.join(', ')}] -> ${after.length} [${after.join(', ')}]`.padEnd(98), `${lines(plan, before)} -> ${lines(plan, after)}`.padEnd(11), `${px(lines(plan, before))} -> ${px(lines(plan, after))}`);
}
