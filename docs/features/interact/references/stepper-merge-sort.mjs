// Documentation-only, hand-authored algorithm composition; not a family module.
import { pathToFileURL } from 'node:url';
import { writeSubject } from './stepper-reference-kit.mjs';

export function buildScene(depth) {
  const brief = depth === 'brief', deep = depth === 'detailed';
  const inputs = brief ? [[4, 1, 3, 2]] : [[4, 1, 3, 2], [1, 2, 3, 4]];
  function merge(a, b) {
    let i = 0, j = 0, comparisons = 0;
    const result = [], decisions = [];
    while (i < a.length && j < b.length) {
      comparisons++;
      const left = a[i], right = b[j], takeLeft = left <= right;
      result.push(takeLeft ? a[i++] : b[j++]);
      decisions.push({ left, right, chosen: result.at(-1), result: [...result] });
    }
    return { result: [...result, ...a.slice(i), ...b.slice(j)], comparisons, decisions };
  }
  const variants = inputs.map(input => {
    const cut = Math.floor(input.length / 2), left = input.slice(0, cut), right = input.slice(cut);
    const a = merge([left[0]], [left[1]]), b = merge([right[0]], [right[1]]), final = merge(a.result, b.result);
    const regions = [
      { id: 'input', label: 'Input', values: input },
      { id: 'left', label: 'Left half', values: left },
      { id: 'right', label: 'Right half', values: right },
      { id: 'singles', label: 'Singles', values: input },
      { id: 'mergeLeft', label: 'Merge left', values: a.result },
      { id: 'mergeRight', label: 'Merge right', values: b.result },
      { id: 'output', label: 'Sorted output', values: final.result },
    ];
    const links = [['input','left'],['input','right'],['left','singles'],['right','singles'],['singles','mergeLeft'],['singles','mergeRight'],['mergeLeft','output'],['mergeRight','output']].map(([from,to])=>({from,to}));
    const total = a.comparisons + b.comparisons + final.comparisons;
    const state = (id, label, short, sentence, why, active, comparisons = 0, placed = 0) => ({
      id, label, short, sentence, why, active, calloutRegion: active[0],
      readouts: brief ? [] : [
        { id: 'comparisons', label: 'Comparisons so far', value: comparisons },
        { id: 'placed', label: 'Placed in final output', value: `${placed} / ${input.length}` },
      ],
    });
    const start = state('input', 'Read input', 'Input', 'Input holds the values that need ordering.', 'Each value must survive the split and merge unchanged.', ['input']);
    const split = state('split', 'Split in half', 'Split', brief ? 'Left half is a smaller sorting problem; Right half follows the same steps.' : 'Left half and Right half hold smaller sorting problems.', 'Splitting preserves the values; it does not order them.', brief ? ['left'] : ['left', 'right']);
    const singles = state('singles', 'Reach singles', 'Singles', 'Singles need no sorting: each little run is already ordered.', 'A run with only one value cannot be out of order.', ['singles']);
    const ml = state('mergeLeft', 'Merge the left', 'Left merge', 'Merge left takes the smaller front value until its run is ordered.', 'The smallest remaining head must come next in the merged run.', ['mergeLeft'], a.comparisons);
    const mr = state('mergeRight', 'Merge the right', 'Right merge', 'Merge right does the same on the other half.', 'Both resulting runs must be ordered before the final merge.', ['mergeRight'], a.comparisons + b.comparisons);
    const first = final.decisions[0];
    const compare = state('compare', 'Compare fronts', 'Compare', 'Merge left and Merge right offer their fronts. Take the smaller.', 'The smallest waiting value must be at one of the fronts.', ['mergeLeft', 'mergeRight'], a.comparisons + b.comparisons + 1, 1);
    compare.comparison = first;
    const finish = state('finish', 'Finish merging', 'Finish', 'Sorted output takes the smaller front repeatedly, then any remaining tail.', 'Once a run is empty, the other tail is already in order.', ['output'], total, input.length);
    const done = state('done', 'All in order', 'Done', 'Sorted output contains every Input value once, in ascending order.', 'Each merge preserved the values while putting its runs in order.', ['output'], total, input.length);
    const states = brief ? [split, singles, state('halves', 'Merge small runs', 'Merge', 'Merge left puts its small run in order; Merge right repeats the same operation.', 'Choose the smaller front value next.', ['mergeLeft']), finish]
      : deep ? [start, split, singles, ml, mr, compare, finish, done] : [start, split, singles, ml, mr, finish];
    return { label: input.join(', '), regions, links, states, calculations: { left: a, right: b, final, total } };
  });
  return {
    depth, prompt: 'how does merge sort work?', canonical: 'algorithm-over-collection',
    title: brief ? 'Split first. Merge in order.' : deep ? 'The next value is at the front.' : 'Small sorted runs make a sorted whole.',
    concept: brief ? 'Input splits into Left half and Right half, then Singles. Merge left and Merge right put those small runs in order; Sorted output joins them by taking the smaller front value.'
      : deep ? 'Input splits into Left half and Right half, then Singles. Merge left and Merge right rebuild ordered runs for Sorted output. The front values decide what comes next; the count records that work.'
        : 'Input becomes Left half, Right half, then Singles. Merge left and Merge right create ordered runs for Sorted output. Compare a mixed and an already sorted input: splitting alone does not sort.',
    instructions: brief ? 'Use Next or the step slider. Pause at Merge small runs to see where ordering begins.' : 'Advance one step at a time. Change Starting array and compare the merges at the same step.',
    heading: 'Split and merge', parameter: brief ? null : { label: 'Starting array', options: ['Mixed', 'Already sorted'], default: 0 },
    aha: { stateId: deep ? 'compare' : brief ? 'halves' : 'finish', observation: 'The merge creates order by taking the smaller head from two already ordered runs; splitting alone does not sort.' }, variants,
  };
}

export function drawPicture(frame, variant, scene, previous) {
  const positions = {
    input: [135, 30, 156, 40], left: [32, 83, 160, 40], right: [236, 83, 160, 40],
    singles: [32, 136, 364, 40], mergeLeft: [32, 189, 160, 40], mergeRight: [236, 189, 160, 40], output: [135, 242, 156, 40],
  };
  let svg = '';
  for (const link of variant.links) {
    const a = positions[link.from], b = positions[link.to];
    const from = [a[0] + a[2] / 2, a[1] + a[3]], to = [b[0] + b[2] / 2, b[1]], mid = (from[1] + to[1]) / 2;
    svg += R.line(`link.${link.from}.${link.to}`, [from, [from[0], mid], [to[0], mid], to], frame.active.includes(link.to));
  }
  for (const region of variant.regions) {
    const [x, y, w, h] = positions[region.id], active = frame.active.includes(region.id);
    let body = R.box(`part.${region.id}`, x, y, w, h, active, region.id === 'output' ? 'outcome' : 'process');
    body += R.text(`part.${region.id}.label`, x + w / 2, y + 16, region.label, { anchor: 'middle', size: 13, weight: 600 });
    const spacing = 28, left = x + w / 2 - spacing * (region.values.length - 1) / 2;
    region.values.forEach((value, i) => { body += R.text(`part.${region.id}.cell.${i}`, left + i * spacing, y + 34, value, { anchor: 'middle', size: 16, weight: 600 }); });
    if (frame.comparison && ['mergeLeft', 'mergeRight'].includes(region.id)) {
      // The compared heads are bound to the same computed merge decision as the
      // count, rather than an ornamental mark on an arbitrary cell.
      body += R.line(`head.${region.id}`, [[left - 9, y + 37], [left + 9, y + 37]], true, false);
    }
    if (region.id === 'singles') region.values.forEach((unused, i) => { if (i) body += R.line(`single.divider.${i}`, [[left + (i - 0.5) * spacing, y + 22], [left + (i - 0.5) * spacing, y + 36]], false, false); });
    if (!active && previous.includes(region.id)) body += `<rect id="ghost.${region.id}" x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="none" stroke="${R.C.wire}" stroke-dasharray="4 3"/>`;
    svg += R.region(region.id, frame, body, previous);
  }
  const [x,y,w,h] = positions[frame.calloutRegion];
  return { svg, anchor: [x+w, y+h/2] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) writeSubject('merge-sort', buildScene, drawPicture);
