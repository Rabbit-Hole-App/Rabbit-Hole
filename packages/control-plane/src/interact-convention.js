// The frame-object ids a scene plan names, and the one deterministic check that the program drew them with the SDK helper that carries them (owner 2026-11-13, the google-low brief section 3).
// The renderer keys the Codex look on these ids and helpers (web explain-program/frame-look.js), so a program that names a body "ball" or draws an arrow with sdk.arrow gets no look; the author is told
// the ids (build input `frameIds`, interact-build.js) and this check names the exact id and helper that is missing, as one precise repair line. A plan that names no such id is never checked.
import { BODY_MIN } from '../../web/src/explain-program/contract.js';

// ball.toss, lane.drop, vec.v, vec.v.toss, callout.toss, plot.vt, plot.vt.note: a family word, a dot and one or more dotted name parts, anywhere in the plan's own words.
const NAMED = /\b(?:ball|lane|vec|callout|plot)\.[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*/g;
export const frameIdsOf = plan => [...new Set(JSON.stringify(plan ?? {}).match(NAMED) ?? [])];

const HELPERS = {
  ball: id => ({ is: o => o.kind === 'circle' && o.w >= BODY_MIN, fix: `draw it with sdk.circle('${id}', x, y, 24) or larger (a ball or object that moves is a circle of ${BODY_MIN} px or more)` }),
  lane: id => ({ is: (o, all) => o.kind === 'box' && all.has(`${id}.title`) && all.has(`${id}.state`), fix: `draw it with sdk.panel({ id: '${id}', x, y, w, h, title, state })` }),
  vec: id => ({ is: o => o.kind === 'arrow' || o.kind === 'line', fix: `draw it with sdk.vector('${id}', from, { value, direction }, { label })` }),
  callout: id => ({ is: o => o.kind === 'box', suffix: '.l0', fix: `draw it with sdk.callout(x, y, lines, { id: '${id}' })` }),
  plot: id => ({ is: o => o.kind === 'plot', fix: `draw it with sdk.plot('${id}', { x, y, w, h, axes, series })` }),
};

// -> [{ id, message }]: one per plan-named id that no capture drew with its helper. objects: the frame objects of every capture ([{ id, kind, w? }]); none at all (a capture seam that carries no objects)
// means nothing can be said and nothing is reported. A name another named id extends ("vec.v" beside "vec.v.toss") is a family: any drawn id under it counts.
export function conventionProblems(plan, objects) {
  const names = frameIdsOf(plan);
  if (!names.length || !objects.length) return [];
  const all = new Set(objects.map(o => o.id)), family = name => names.some(other => other.startsWith(`${name}.`));
  const out = [];
  for (const id of names) {
    const note = id.endsWith('.note') && names.includes(id.slice(0, -5)); // plot.vt.note: the plot's note is a text object of that id
    const rule = note ? { is: o => o.kind === 'text', fix: `draw it with sdk.text('${id}', x, y, text)` } : HELPERS[id.split('.')[0]]?.(id);
    if (!rule) continue;
    const suffix = rule.suffix ?? '';
    const ok = objects.some(o => (o.id === `${id}${suffix}` || (family(id) && o.id.startsWith(`${id}.`))) && rule.is(o, all));
    if (!ok) out.push({ id, message: `"${id}" is a frame object the plan names, and no capture draws it as it must be: ${rule.fix}` });
  }
  return out;
}
