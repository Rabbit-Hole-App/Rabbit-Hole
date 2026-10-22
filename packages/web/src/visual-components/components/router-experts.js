// Router and experts (EXP-T09): a token goes through a router that picks
// top-k of N routed experts, optional shared experts that every token
// passes through, and a weighted combination. Layout follows the counts
// and the routing rule, never an architecture name. Experts are anchored
// by their number (expert-17), so a connection to a chosen expert survives
// when unchosen experts are folded into a count.
import { validateLabelContent } from '../../explain-contract.js';
import { labelledBox } from '../label.js';
import { sides, textWidth } from '../text.js';

const EW = 56, EH = 40, GAP = 8, ROW = 64, SKIP_W = 40;

export default {
  name: 'router-experts', version: 1,
  description: 'Mixture of experts: a router sends each token to topK of experts routed experts (routing top-k, or switch with topK 1), plus sharedExperts always-on experts, then a weighted sum. selected names the chosen expert numbers for the example token. Anchors: sides, input, router, output, expert-N for drawn experts.',
  params: {
    experts: { type: 'int', min: 2, max: 256, required: true },
    topK: { type: 'int', min: 1, max: 8, required: true },
    routing: { type: 'enum', values: ['top-k', 'switch'], default: 'top-k' },
    sharedExperts: { type: 'int', min: 0, max: 4, default: 0 },
    selected: { type: 'list', min: 1, max: 8 },
    input: { type: 'label', maxLength: 120, default: 'Token' },
    output: { type: 'label', maxLength: 120, default: 'Weighted sum of the chosen experts' },
  },
  hints: { maxDrawn: { type: 'number', unit: 'count', min: 4, max: 16, default: 8 } },
  repairWritable: ['maxDrawn'],
  anchors: ['top', 'bottom', 'left', 'right', 'input', 'router', 'output'],
  fixtures: ['moe-8-top2'],
  compile({ params, hints }) {
    const { experts: n, topK: k } = params;
    if (k > n) throw new Error(`topK ${k} is more than the ${n} experts there are to choose from`);
    if (params.routing === 'switch' && k !== 1) throw new Error(`switch routing sends each token to exactly one expert, so topK must be 1, not ${k}`);
    if (k === n) throw new Error(`topK ${k} equals the expert count: every token would use every expert, which is not routing`);
    const selected = params.selected ?? Array.from({ length: k }, (_, i) => i + 1);
    if (selected.length !== k) throw new Error(`selected names ${selected.length} experts, but topK is ${k}`);
    for (const value of selected) if (!Number.isInteger(value) || value < 1 || value > n) throw new Error(`selected expert ${JSON.stringify(value)} is not one of experts 1 to ${n}`);
    if (new Set(selected).size !== k) throw new Error('selected names the same expert twice');

    // Which routed experts are drawn: every chosen one, then the lowest
    // numbers, up to maxDrawn; skipped runs show as "+N".
    const drawn = new Set(selected);
    for (let e = 1; e <= n && drawn.size < Math.min(n, hints.maxDrawn); e++) drawn.add(e);
    const order = [...drawn].sort((a, b) => a - b);
    const cells = [];
    let x = 0, previous = 0;
    for (const e of order) {
      if (e - previous > 1) { cells.push({ skip: e - previous - 1, x }); x += SKIP_W + GAP; }
      cells.push({ expert: e, x }); x += EW + GAP; previous = e;
    }
    if (n - previous > 0) { cells.push({ skip: n - previous, x }); x += SKIP_W + GAP; }
    const routedW = x - GAP;
    const shared = Array.from({ length: params.sharedExperts }, (_, i) => i);
    const sharedW = shared.length ? shared.length * (EW + GAP) - GAP : 0;
    const groupGap = shared.length ? 48 : 0;
    const rowW = sharedW + groupGap + routedW;
    const routedX = sharedW + groupGap;

    const objects = [], anchors = {};
    const place = (box, cx, y) => {
      const left = cx - box.w / 2;
      for (const object of box.objects) objects.push({ ...object, initialState: { ...object.initialState, x: object.initialState.x + left, y: object.initialState.y + y } });
      return { x: left, y, w: box.w, h: box.h };
    };
    const center = Math.max(rowW, 240) / 2;
    const input = place(labelledBox({ id: 'input', label: validateLabelContent(params.input), role: 'input', minWidth: 120, maxWidth: 320 }), center, 0);
    const routerY = input.y + input.h + ROW / 2;
    const router = place(labelledBox({ id: 'router', label: `Router: top-${k} of ${n}`, role: 'neutral', minWidth: 160, maxWidth: 320 }), routedX + routedW / 2 + (center - rowW / 2), routerY);
    const expertY = router.y + router.h + ROW;
    const offset = center - rowW / 2;
    objects.push({ id: 'input-to-router', type: 'arrow', initialState: { from: { x: input.x + input.w / 2, y: input.y + input.h }, to: { x: router.x + router.w / 2, y: router.y } } });

    const combineY = expertY + EH + ROW;
    const combine = { y: combineY };
    for (const cell of cells) {
      const cx = offset + routedX + cell.x;
      if (cell.skip) {
        objects.push({ id: `skip${cell.x}`, type: 'text', initialState: { text: `+${cell.skip}`, x: cx + 4, y: expertY + EH / 2 + 5, typography: 'annotation' } });
        continue;
      }
      const chosen = selected.includes(cell.expert);
      objects.push({ id: `expert${cell.expert}`, type: 'box', initialState: { label: `E${cell.expert}`, x: cx, y: expertY, w: EW, h: EH, role: chosen ? 'learner' : 'neutral' } });
      anchors[`expert-${cell.expert}`] = { x: cx + EW / 2, y: expertY };
      if (chosen) {
        objects.push({ id: `route${cell.expert}`, type: 'arrow', initialState: { from: { x: router.x + router.w / 2, y: router.y + router.h }, to: { x: cx + EW / 2, y: expertY }, role: 'learner' } });
        combine[cell.expert] = { x: cx + EW / 2, y: expertY + EH };
      }
    }
    shared.forEach(i => {
      const cx = offset + i * (EW + GAP);
      objects.push({ id: `shared${i}`, type: 'box', initialState: { label: `S${i + 1}`, x: cx, y: expertY, w: EW, h: EH, role: 'input' } });
      // Shared experts take every token directly; the router does not choose them.
      objects.push({ id: `bypass${i}`, type: 'arrow', initialState: { from: { x: input.x, y: input.y + input.h / 2 }, to: { x: cx + EW / 2, y: expertY } } });
      combine[`s${i}`] = { x: cx + EW / 2, y: expertY + EH };
    });
    const output = place(labelledBox({ id: 'output', label: validateLabelContent(params.output), role: 'output', minWidth: 200, maxWidth: 360 }), center, combineY);
    for (const [key, from] of Object.entries(combine)) {
      if (key === 'y') continue;
      objects.push({ id: `into${key}`, type: 'arrow', initialState: { from, to: { x: output.x + output.w / 2, y: output.y } } });
    }
    if (shared.length) {
      objects.push({ id: 'shared-caption', type: 'text', initialState: { text: shared.length === 1 ? 'shared, every token' : `${shared.length} shared, every token`, x: offset, y: expertY - 12, typography: 'annotation' } });
    }
    const caption = params.routing === 'switch' ? `each token goes to 1 of ${n} experts` : `each token goes to ${k} of ${n} experts${shared.length ? ` plus ${shared.length} shared` : ''}`;
    const captionY = output.y + output.h + 32;
    objects.push({ id: 'caption', type: 'text', initialState: { text: caption, x: 0, y: captionY, typography: 'caption' } });
    const w = Math.max(rowW, input.x + input.w, output.x + output.w, router.x + router.w, textWidth(caption, 'caption')), h = captionY + 8;
    return {
      w, h, objects,
      anchors: { ...sides(w, h), ...anchors, input: { x: input.x + input.w / 2, y: input.y }, router: { x: router.x + router.w, y: router.y + router.h / 2 }, output: { x: output.x + output.w / 2, y: output.y + output.h } },
    };
  },
};
