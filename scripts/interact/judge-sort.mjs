// Brief 9 section 1: sort the four template cards' judge findings (evidence/2026-11-13-template/judge/<plan>.json) into four groups, quoting each finding verbatim from the saved JSON.
// The grouping below is the sorter's reading of each finding (the judge's own category is always "spec"); nothing is fixed. Writes judge/findings-sorted.md.
//   node scripts/interact/judge-sort.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs/features/interact/evidence/2026-11-13-template/judge');
const PLANS = ['toss-overview', 'toss-standard', 'toss-deep', 'ledge-toss-moon'];
const GROUPS = {
  physics: 'Wrong physics (what is drawn disagrees with the plan\'s numbers)',
  content: 'Wrong or missing content (the card lacks something the plan or the reader needs)',
  wording: 'Wording or naming (labels and names against the plan\'s words)',
  pixels: 'Cannot be judged without pixels (the judge saw frame traces, not a rendering; headless runs carry a 1 x 1 placeholder image)',
  confirmed: 'Not a defect (the judge checked and found it correct; listed because it is in the findings)',
};
// plan -> finding index (1-based, in the saved order) -> [group, note]
const SORT = {
  'toss-overview': { 1: ['wording', 'v and a against the plan\'s Motion and Gravity names; the colour and dash part is also unjudgeable from frames'], 2: ['content', 'the gravity arrow is drawn on a fixed length while the velocity arrow is proportional, and the card does not say so'], 3: ['pixels', 'callout text is not in the frame objects the judge reads'], 4: ['confirmed', ''] },
  'toss-standard': { 1: ['pixels', 'the scrubber (-0.408 to 0.408 s) is not in the frames, only elapsed capture times'], 2: ['physics', 'the judge\'s own reading is that the traces support the plan (held ball a = 0, then -g after release); it flags the observation wording "acceleration is -g at every instant"'], 3: ['confirmed', ''], 4: ['confirmed', ''] },
  'toss-deep': { 1: ['pixels', 'scrubber and plot are not shown in the capture; the "later and higher" observation has no readout'], 2: ['pixels', 'the after-top sample (0.10 s) is not among the captures; the start readout showing v = 4 at "Ready to toss" is called acceptable but unexplained'], 3: ['pixels', 'callout text lines, the plot marker and the orange slope segment cannot be judged'] },
  'ledge-toss-moon': { 1: ['wording', 'v and a letters against the plan\'s Motion and gravity arrow names; callout text not visible in the objects'], 2: ['content', 'the fixed scale leaves the ball 7 px under the lane top and level with the callout box at launch speed 3 (the top of the input range)'], 3: ['physics', 'the judge\'s arithmetic (a drawn rise of 1.0 m against 0.926 m) was not re-checked by the sorter'] },
};

const out = ['# Judge findings of the four template cards, sorted', '',
  'Quoted verbatim from judge/<plan>.json (Sonnet 5.5 shadow judge, headless frames: no pixels). The judge labels every finding category `spec`; the groups are the sorter\'s reading. Nothing here is fixed.', ''];
for (const [key, title] of Object.entries(GROUPS)) {
  out.push(`## ${title}`, '');
  let n = 0;
  for (const plan of PLANS) {
    const { findings } = JSON.parse(readFileSync(join(DIR, `${plan}.json`), 'utf8'));
    findings.forEach((f, i) => {
      const [group, note] = SORT[plan][i + 1] ?? [];
      if (group !== key) return;
      n++;
      out.push(`- **${plan}** · ${f.severity} · capture \`${f.capture}\`${f.object ? ` · object \`${f.object}\`` : ''}`, `  > ${String(f.message).replace(/\n/g, ' ')}`, ...(note ? [`  Sorter's note: ${note}.`] : []), '');
    });
  }
  if (!n) out.push('(none)', '');
}
const missing = PLANS.flatMap(plan => JSON.parse(readFileSync(join(DIR, `${plan}.json`), 'utf8')).findings.map((_, i) => [plan, i + 1]).filter(([p, i]) => !SORT[p][i]));
if (missing.length) throw new Error(`unsorted findings: ${JSON.stringify(missing)}`);
writeFileSync(join(DIR, 'findings-sorted.md'), out.join('\n'));
console.log(`sorted ${PLANS.length} cards`);
