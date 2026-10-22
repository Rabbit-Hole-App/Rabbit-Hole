// VisualSpec -> CompiledVisual: trusted code turns authored component JSON
// into an ordinary scene that validateScene / evaluateScene accept unchanged.
// No renderer of its own, no React or DOM, no stored coordinates: every
// position comes from the component definitions and the spec's hints.
import { EXPLAIN_CONTRACT_VERSION, canonicalJson, validateCompiledVisual, validateVisualSpec } from '../explain-contract.js';
import { evaluateScene } from '../scene-evaluate.js';
import { checkLayoutLint } from '../scene-layout-lint.js';
import { legibilityIssues } from '../scene-layout.js';
import { budgetIssues, chooseDensity, measureScene } from './budget.js';
import { labelWidth, lineFields, wrapLabel } from './label.js';
import { componentFor, resolveHints, resolveParams } from './registry.js';

const PAD = 32, GAP = 32;
const STATIC_DURATION = 1;
const FATAL = new Set(['objects-per-part', 'objects-total', 'parts', 'timeline-events']);

// shortcut: FNV-1a 64-bit, a determinism and identity hash, not a security one; switch ResultIdentity to SHA-256 if a hash ever guards access.
export function contentHash(value) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(canonicalJson(value))) hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n);
  return `fnv64-${hash.toString(16).padStart(16, '0')}`;
}

const round = n => Math.round(n);
const moved = (object, dx, dy) => {
  const state = { ...object.initialState };
  if (state.x !== undefined) state.x = round(state.x + dx);
  if (state.y !== undefined) state.y = round(state.y + dy);
  if (state.from) state.from = { x: round(state.from.x + dx), y: round(state.from.y + dy) };
  if (state.to) state.to = { x: round(state.to.x + dx), y: round(state.to.y + dy) };
  return { ...object, initialState: state };
};

export function compileVisual(raw) {
  const spec = validateVisualSpec(raw);
  const items = new Map(spec.components.map(item => [item.id, item]));
  const resolved = new Map();
  for (const item of spec.components) {
    const where = message => { throw new Error(`Component "${item.id}" (${item.component}@${item.version}): ${message}`); };
    let definition;
    try { definition = componentFor(item.component, item.version); } catch (error) { where(error.message); }
    let params, hints;
    try { params = resolveParams(definition, item.params); hints = resolveHints(definition, item.hints); } catch (error) { where(error.message); }
    if (item.parent !== undefined) {
      const parent = items.get(item.parent);
      if (!componentFor(parent.component, parent.version).container) where(`its parent "${item.parent}" is not a container`);
      if (parent.part !== item.part) where(`it is on a different part from its parent "${item.parent}"`);
    }
    resolved.set(item.id, { item, definition, params, hints, where });
  }
  for (const item of spec.components) {
    const seen = new Set([item.id]);
    for (let at = item.parent; at !== undefined; at = items.get(at).parent) {
      if (seen.has(at)) throw new Error(`Component "${item.id}": its parents form a cycle`);
      seen.add(at);
    }
  }
  const childrenOf = id => spec.components.filter(item => item.parent === id).map(item => item.id);

  // One block per instance, in its own coordinates; containers place their
  // children. Ids are namespaced instance.local, anchors instance.anchor.
  const block = id => {
    const { item, definition, params, hints, where } = resolved.get(id);
    const children = childrenOf(id).map(block);
    let out;
    try { out = definition.compile({ params, hints, label: item.label, children }); } catch (error) { where(error.message); }
    const objects = out.objects.map(object => {
      const full = `${id}.${object.id}`;
      if (full.length > 64) where(`object id "${full}" is over 64 characters: use a shorter component id`);
      return { ...object, id: full, semanticId: full, conceptId: id, ...(item.part === undefined ? {} : { part: item.part }) };
    });
    const map = Object.fromEntries(objects.map(object => [object.id, { component: id, evidence: item.evidence }]));
    const anchors = Object.fromEntries(Object.entries(out.anchors).map(([name, point]) => [`${id}.${name}`, point]));
    children.forEach((child, index) => {
      const at = out.places[index];
      objects.push(...child.objects.map(object => moved(object, at.x, at.y)));
      Object.assign(map, child.map);
      for (const [name, point] of Object.entries(child.anchors)) anchors[name] = { x: point.x + at.x, y: point.y + at.y };
    });
    return { w: out.w, h: out.h, objects, anchors, map, part: item.part };
  };

  // Shared roots (no part) sit on top, on every part; each part's own roots
  // stack below them from the same line, since parts share one frame.
  const roots = spec.components.filter(item => item.parent === undefined).map(item => block(item.id));
  const objects = [], anchors = {}, objectMap = {};
  const place = (list, top) => {
    let y = top;
    for (const root of list) {
      objects.push(...root.objects.map(object => moved(object, PAD, y)));
      for (const [name, point] of Object.entries(root.anchors)) anchors[name] = { x: point.x + PAD, y: point.y + y };
      Object.assign(objectMap, root.map);
      y += root.h + GAP;
    }
    return y;
  };
  const sharedBottom = place(roots.filter(root => root.part === undefined), PAD);
  let bottom = sharedBottom;
  for (let part = 0; part < spec.parts.length; part++) bottom = Math.max(bottom, place(roots.filter(root => root.part === part), sharedBottom));
  const width = Math.max(0, ...roots.map(root => root.w)) + 2 * PAD;
  const height = bottom - GAP + PAD;

  const partOf = new Map(spec.components.map(item => [item.id, item.part]));
  spec.connections.forEach((connection, index) => {
    const ends = [connection.from, connection.to].map(ref => {
      if (!anchors[ref]) throw new Error(`Connection ${index + 1}: "${ref}" is not an anchor of that component`);
      return anchors[ref];
    });
    const parts = [connection.from, connection.to].map(ref => partOf.get(ref.split('.')[0])).filter(part => part !== undefined);
    if (new Set(parts).size > 1) throw new Error(`Connection ${index + 1} joins two different parts`);
    const id = `link${index}`;
    const onPart = parts.length ? { part: parts[0] } : {};
    objects.push({ id, type: connection.kind === 'flow' ? 'arrow' : 'line', semanticId: id, ...onPart, initialState: { from: ends[0], to: ends[1], role: 'neutral' } });
    objectMap[id] = { component: connection.from.split('.')[0], anchor: connection.from.split('.')[1], evidence: [] };
    // The label sits at the middle of the connection, beside it, as its own
    // text: a stroke's own label is drawn at its start, which lands on the
    // frame or box the connection leaves (render review 2026-10-22).
    if (connection.label !== undefined) {
      const line = wrapLabel(connection.label, Infinity, 'annotation')[0];
      const mid = { x: (ends[0].x + ends[1].x) / 2, y: (ends[0].y + ends[1].y) / 2 };
      const flat = Math.abs(ends[1].x - ends[0].x) >= Math.abs(ends[1].y - ends[0].y);
      const at = flat ? { x: round(mid.x - labelWidth(connection.label, 'annotation') / 2), y: round(mid.y - 8) } : { x: round(mid.x + 8), y: round(mid.y + 5) };
      objects.push({ id: `${id}-label`, type: 'text', semanticId: `${id}-label`, ...onPart, initialState: { ...lineFields(line, 'text'), ...at, typography: 'annotation' } });
      objectMap[`${id}-label`] = objectMap[id];
    }
  });

  const { presentation } = spec;
  if (presentation.mode === 'steps') throw new Error('Steps presentation is not supported by this compiler yet');
  if (presentation.experiments.length) throw new Error('Experiments are not supported by this compiler yet');
  const scene = {
    id: spec.id, title: spec.title, width: round(width), height: round(height),
    duration: presentation.mode === 'time' ? presentation.duration : STATIC_DURATION,
    objects, timeline: [],
  };
  if (spec.parts.length) {
    scene.inputs = [{ name: 'part', type: 'index', label: 'Part', of: 'partTitles', default: 0, presentation: 'pager' }];
    scene.exampleData = { partTitles: spec.parts.map(part => part.title) };
  }

  // The compiled scene must pass the existing validators for every part, and
  // the layout lint the generation gates run; lint findings are diagnostics.
  // Over a limit the scene schema enforces: refuse here, naming the measured
  // count and the density decision, before validateScene's bare error.
  const measure = measureScene(scene, { authored: spec.components.length });
  const budget = budgetIssues(measure);
  const fatal = budget.filter(issue => FATAL.has(issue.code));
  if (fatal.length) {
    const density = chooseDensity(measure);
    const advice = density.layout === 'split' ? `: split it into ${density.parts} detail parts` : ': draw less';
    throw new Error(`Over budget (${fatal.map(issue => `${issue.code} ${issue.value} > ${issue.limit}`).join(', ')})${advice}`);
  }
  const partIndexes = spec.parts.length ? spec.parts.map((_, index) => index) : [undefined];
  const perPart = [], diagnostics = [];
  for (const part of partIndexes) {
    const result = evaluateScene(structuredClone(scene), scene.duration, part === undefined ? {} : { part });
    const onScreen = { ...result.scene, objects: result.scene.objects.filter(object => object.part === undefined || object.part === part) };
    perPart.push(onScreen.objects.length);
    for (const issue of checkLayoutLint(onScreen).issues) {
      diagnostics.push({ code: issue.check, message: issue.message.slice(0, 300), ...(objectMap[issue.objectId] ? { component: objectMap[issue.objectId].component } : {}) });
    }
  }
  for (const issue of legibilityIssues(scene)) diagnostics.push({ code: 'legibility', message: `${issue.textClass} text would draw at ${issue.effectivePx}px, below its ${issue.floor}px floor`.slice(0, 300) });
  for (const issue of budget) diagnostics.push({ code: issue.code, message: `${issue.value} is over the limit of ${issue.limit}${issue.part === undefined ? '' : ` on part ${issue.part + 1}`}` });

  return validateCompiledVisual({
    version: EXPLAIN_CONTRACT_VERSION,
    specHash: contentHash(spec),
    scene,
    counts: { authored: spec.components.length, compiled: objects.length, perPart, renderWork: measure.renderNodesTotal },
    componentVersions: Object.fromEntries(spec.components.map(item => [item.component, item.version])),
    objectMap,
    // Stills prove only their own moments: a timeline is never complete coverage.
    coverage: { states: measure.settings, timeCheckpoints: measure.timeCheckpoints, complete: scene.timeline.length === 0 },
    diagnostics,
  });
}

// Layout repair: change declared repairWritable hints and nothing else, so
// text, facts, topology and evidence stay exactly as authored.
export function applyHintRepair(raw, repairs) {
  const spec = structuredClone(raw);
  for (const { component, hint, value } of repairs) {
    const item = spec.components?.find(entry => entry.id === component);
    if (!item) throw new Error(`repair names unknown component "${component}"`);
    const definition = componentFor(item.component, item.version);
    if (!definition.repairWritable.includes(hint)) throw new Error(`"${hint}" is not a repairable hint of ${item.component}`);
    item.hints = { ...(item.hints || {}), [hint]: value };
    resolveHints(definition, item.hints);
  }
  const semantic = value => canonicalJson({ ...value, components: value.components.map(({ hints, ...rest }) => rest) });
  if (semantic(spec) !== semantic(raw)) throw new Error('a hint repair changed more than hints');
  return spec;
}
