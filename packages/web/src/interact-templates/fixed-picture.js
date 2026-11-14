export const id = 'fixed-picture';
export const bindingTypes = Object.freeze({ regions: 'Region[]', links: 'Link[]', active: 'RegionId[]' });

// Geometry is the approved algorithm-over-collection preset in
// references/stepper-merge-sort.mjs. It never comes from model-writable pixels.
// Roles/opacity are an explicit legal Frame projection: SDK-8 cannot carry the
// reference SVG's per-mark font, radius, fill or active-stroke attributes.
export function draw(ctx, sdk) {
  const fail = (path, message) => { const e = new Error(`fixed-picture: ${message}`); e.code = 'part_binding'; e.path = path; throw e; };
  const { composition, variant, state, previous } = ctx;
  if (composition?.canonical !== 'algorithm-over-collection') fail('composition.canonical', 'this preset is not implemented');
  const positions = { input: [135, 30, 156, 40], left: [32, 83, 160, 40], right: [236, 83, 160, 40], singles: [32, 136, 364, 40], mergeLeft: [32, 189, 160, 40], mergeRight: [236, 189, 160, 40], output: [135, 242, 156, 40] };
  if (!Array.isArray(variant?.regions) || !Array.isArray(variant.links)) fail('variant', 'regions and links must be arrays');
  const ids = new Set();
  for (const region of variant.regions) {
    if (!region || !Object.hasOwn(positions, region.id) || ids.has(region.id)) fail('variant.regions', 'region must have a unique preset anchor');
    if (typeof region.label !== 'string' || !region.label || !Array.isArray(region.values) || !region.values.length || region.values.some(v => typeof v !== 'string' && !(typeof v === 'number' && Number.isFinite(v)))) fail(`variant.regions.${region.id}`, 'region needs a label and exact text/number values');
    ids.add(region.id);
  }
  if (!Array.isArray(state?.active) || state.active.some(key => !ids.has(key))) fail('state.active', 'active regions must exist in the picture');
  if (previous && (!Array.isArray(previous.active) || previous.active.some(key => !ids.has(key)))) fail('previous.active', 'previous regions must exist in this picture');
  const shafts = [], arrows = [], arrowKeys = new Set(), duplicateArrows = new Set(), linkIds = new Set();
  for (const link of variant.links) {
    if (!ids.has(link?.from) || !ids.has(link?.to)) fail('variant.links', 'both link anchors must be declared regions');
    const key = `link.${link.from}.${link.to}`;
    if (linkIds.has(key)) fail('variant.links', 'semantic links must be unique');
    linkIds.add(key);
    const a = positions[link.from], b = positions[link.to], from = [a[0] + a[2] / 2, a[1] + a[3]], to = [b[0] + b[2] / 2, b[1]], mid = (from[1] + to[1]) / 2;
    const role = state.active.includes(link.to) ? 'input' : 'neutral';
    shafts.push({ ids: [key], points: [from, [from[0], mid], [to[0], mid]], role });
    const arrowKey = `${role}:${to[0]},${mid}:${to[0]},${to[1]}`;
    if (arrowKeys.has(arrowKey)) duplicateArrows.add(key);
    else { arrowKeys.add(arrowKey); arrows.push(sdk.arrow(key, to[0], mid, to[0], to[1], { role, opacity: 1 })); }
  }
  // Join only equally styled paths at an existing endpoint. Retracing the
  // existing fork stem changes no painted union and adds no connecting edge.
  const equal = (a, b) => a[0] === b[0] && a[1] === b[1];
  for (let i = 0; i < shafts.length; i++) {
    for (let j = i + 1; j < shafts.length; j++) {
      const a = shafts[i], b = shafts[j];
      if (a.role !== b.role) continue;
      let p = a.points, q = b.points;
      if (equal(p[0], q[0])) p = p.slice().reverse();
      else if (equal(p.at(-1), q.at(-1))) q = q.slice().reverse();
      else if (equal(p[0], q.at(-1))) { const swap = p; p = q; q = swap; }
      else if (!equal(p.at(-1), q[0])) continue;
      a.points = p.concat(q.slice(1)); a.ids.push(...b.ids); shafts.splice(j, 1); j--;
    }
  }
  const out = shafts.map(shaft => {
    const aliases = shaft.ids.filter(key => duplicateArrows.has(key));
    if (aliases.length > 1) fail('variant.links', 'packed shaft cannot preserve every semantic link id');
    return sdk.polyline(aliases[0] ?? `${shaft.ids[0]}.shaft`, shaft.points, { role: shaft.role, opacity: 1 });
  });
  out.push(...arrows);
  for (const region of variant.regions) {
    const [x, y, w, h] = positions[region.id], active = state.active.includes(region.id), opacity = active ? 1 : previous?.active.includes(region.id) ? 0.72 : 0.4, style = { role: 'neutral', opacity };
    // Empty .l0 boxes are the existing layout check's owned-container marker;
    // they are not sdk.callout lines and do not trigger card style rewriting.
    out.push(sdk.box(`part.${region.id}.l0`, x, y, w, h, { role: region.id === 'output' ? 'output' : 'input', opacity }));
    out.push(sdk.text(`part.${region.id}.label`, x + w / 2, y + 16, region.label, { ...style, align: 'middle' }));
    const left = x + w / 2 - 28 * (region.values.length - 1) / 2;
    region.values.forEach((value, i) => out.push(sdk.text(`part.${region.id}.cell.${i}`, left + i * 28, y + 34, String(value), { ...style, align: 'middle' })));
    if (state.comparison && ['mergeLeft', 'mergeRight'].includes(region.id)) out.push(sdk.line(`head.${region.id}`, left - 9, y + 37, left + 9, y + 37, { role: 'input', opacity }));
    if (region.id === 'singles') region.values.forEach((unused, i) => { if (i) out.push(sdk.line(`single.divider.${i}`, left + (i - 0.5) * 28, y + 22, left + (i - 0.5) * 28, y + 36, style)); });
  }
  return out;
}

export const fixedPicture = Object.freeze({ id, bindingTypes, draw });
export default fixedPicture;
