// VisualSpec -> CompiledVisual: trusted code turns authored component JSON
// into an ordinary scene that validateScene / evaluateScene accept unchanged.
// No renderer of its own, no React or DOM, no stored coordinates: every
// position comes from the component definitions and the spec's hints.
import { EXPLAIN_CONTRACT_VERSION, canonicalJson, validateCompiledVisual, validateVisualSpec } from '../explain-contract.js';
import { evaluateScene } from '../scene-evaluate.js';
import { checkLayoutLint } from '../scene-layout-lint.js';
import { legibilityIssues } from '../scene-layout.js';
import { LIMITS, budgetIssues, chooseDensity, measureScene } from './budget.js';
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
  // A child without a part is on its parent's part, so an author marks only
  // the top of each sub-card; a child naming a different part is refused.
  const inherit = item => {
    if (item.parent === undefined) return item.part;
    const parentPart = inherit(items.get(item.parent));
    if (item.part !== undefined && item.part !== parentPart) resolved.get(item.id).where(`it is on a different part from its parent "${item.parent}"`);
    return parentPart;
  };
  for (const item of spec.components) item.part = inherit(item);
  const { presentation } = spec;
  const controls = readControls(spec, resolved);
  const combos = cartesian(controls.map(control => control.values.length));
  if (combos.length * Math.max(1, spec.parts.length) > LIMITS.settings) throw new Error(`The experiments admit ${combos.length * Math.max(1, spec.parts.length)} states (parts included), over the ${LIMITS.settings} that are checked one by one: admit fewer values`);

  // One complete layout per admitted control state: a control sets its parameter, every placement is shared code.
  const draw = combo => {
    const overrides = new Map(), ranges = new Map();
    controls.forEach((control, index) => {
      overrides.set(control.instance, { ...overrides.get(control.instance), [control.param]: control.values[combo[index]] });
      ranges.set(control.instance, { ...ranges.get(control.instance), [control.param]: control.values });
    });
    const componentNotes = [];
    const childrenOf = id => spec.components.filter(item => item.parent === id).map(item => item.id);

    // One block per instance, in its own coordinates; containers place their
    // children. Ids are namespaced instance.local, anchors instance.anchor.
    const block = id => {
      const { item, definition, params, hints, where } = resolved.get(id);
      const children = childrenOf(id).map(block);
      let out;
      const own = overrides.get(id);
      try { out = definition.compile({ params: own ? { ...params, ...own } : params, hints, label: item.label, evidence: item.evidence, children, ...(own ? { controlValues: ranges.get(id) } : {}) }); } catch (error) { where(error.message); }
      for (const note of out.diagnostics || []) componentNotes.push({ code: note.code, message: note.message.slice(0, 300), component: id });
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
    return { objects, objectMap, width, height, componentNotes };
  };
  const drawn = combos.map(draw);
  const defaultCombo = controls.map(control => control.defaultIndex);
  const base = drawn[combos.findIndex(combo => combo.every((value, index) => value === defaultCombo[index]))];
  const { objectMap, width, height, componentNotes } = base;
  const { objects, exampleData, derived } = mergeStates(drawn, combos, controls);
  // Steps (Lane B2's saved-scene presentation, EXP-T26 M2): step i is moment i of the timeline; what first appears on it
  // fades in just before, so earlier context stays drawn. A child appears no earlier than its parent, a connection with
  // its later end.
  const steps = presentation.mode === 'steps' ? presentation.steps : [];
  const timeline = [];
  if (steps.length) {
    if (steps.some(step => step.caption !== undefined)) throw new Error('Step captions are not drawn yet: put the words in a component that appears on that step');
    const index = new Map(steps.map((step, i) => [step.id, i]));
    const stepOf = item => Math.max(index.get(item.step) ?? 0, item.parent === undefined ? 0 : stepOf(items.get(item.parent)));
    const componentStep = new Map(spec.components.map(item => [item.id, stepOf(item)]));
    // Connection objects are link<i> and link<i>-label (above).
    const linkStep = id => { const link = spec.connections[parseInt(id.slice(4), 10)]; return Math.max(...[link.from, link.to].map(ref => componentStep.get(ref.split('.')[0]))); };
    objects.forEach((object, i) => {
      const at = object.conceptId ? componentStep.get(object.conceptId) : linkStep(object.id);
      if (!at) return;
      // shortcut: appear fades to full opacity, so a translucent object (pattern-stack copies) cannot appear on a later step; upgrade when appear restores the authored opacity.
      if ((object.initialState.opacity ?? 1) < 1) throw new Error(`"${object.id}" is translucent and cannot appear on a later step yet: put its component on the first step`);
      objects[i] = { ...object, initialState: { ...object.initialState, opacity: 0 } };
      timeline.push({ at: at - 0.5, action: 'appear', target: object.id, duration: 0.4 });
    });
  }
  const scene = {
    id: spec.id, title: spec.title, width: round(width), height: round(height),
    duration: presentation.mode === 'time' ? presentation.duration : steps.length ? steps.length - 1 : STATIC_DURATION,
    objects, timeline,
    // The card and the scene gates read the same declaration (animation-scene.js presentationMode, learn-scene-gates.js).
    presentation: steps.length ? { mode: 'steps', steps: steps.map((step, i) => ({ id: step.id, title: step.title, at: i })) } : { mode: presentation.mode },
  };
  if (spec.parts.length) {
    scene.inputs = [{ name: 'part', type: 'index', label: 'Part', of: 'partTitles', default: 0, presentation: 'pager' }];
    scene.exampleData = { partTitles: spec.parts.map(part => part.title) };
  }
  if (controls.length) {
    // B2's saved-scene experiment shape (animation-scene.js presentationSchema), read unchanged by the card and the gates.
    scene.inputs = [...(scene.inputs || []), ...controls.map(control => ({ name: control.name, type: 'index', label: control.label, of: `${control.name}_values`, default: control.defaultIndex, presentation: 'picker' }))];
    scene.exampleData = { ...scene.exampleData, ...Object.fromEntries(controls.map(control => [`${control.name}_values`, control.labels])), ...exampleData };
    scene.derived = derived;
    scene.presentation.experiments = experimentsFor(spec, controls, scene, objectMap);
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
  const perPart = [], diagnostics = [...componentNotes];
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
    coverage: { states: measure.settings, timeCheckpoints: measure.timeCheckpoints, complete: scene.timeline.length === 0, stateInputs: stateInputs(scene) },
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

// Every admitted state as scene inputs, default first (r2-contract.md section 3): the product of each visible control's
// values, the same list the gates walk (budget.js settingsCount). The capture manifest and the reviewer read it.
export function stateInputs(scene) {
  const visible = (scene.inputs || []).filter(input => !input.hidden && input.type === 'index');
  const sizes = visible.map(input => (scene.exampleData?.[input.of] || []).length);
  const all = cartesian(sizes).map(combo => Object.fromEntries(visible.map((input, index) => [input.name, combo[index]])));
  const isDefault = state => visible.every(input => state[input.name] === input.default);
  return [...all.filter(isDefault), ...all.filter(state => !isDefault(state))];
}

// Row-major index tuples over the given sizes: [[0,0],[0,1],...]; no sizes -> one empty tuple.
function cartesian(sizes) {
  return sizes.reduce((combos, size) => combos.flatMap(combo => [...Array(size).keys()].map(value => [...combo, value])), [[]]);
}

const sceneName = ref => ref.replace(/[^A-Za-z0-9_]/g, '_');
const sameValue = (a, b) => canonicalJson(a ?? null) === canonicalJson(b ?? null);

// Each experiment's control (r2-contract.md section 2): instance.control, its admitted values inside the parameter's own
// allowed values, its default the instance's own value. -> [{ experiment, instance, param, values, labels, name, ... }]
function readControls(spec, resolved) {
  return spec.presentation.experiments.map(experiment => {
    const fail = message => { throw new Error(`Experiment "${experiment.id}": ${message}`); };
    const [instance, controlId] = experiment.input.split('.');
    if (!controlId) fail(`input "${experiment.input}" must name a component's control as instance.control`);
    const entry = resolved.get(instance);
    if (!entry) fail(`input names unknown component "${instance}"`);
    const { item, definition, params } = entry;
    const control = definition.controls[controlId];
    const known = Object.keys(definition.controls);
    if (!control) fail(`${item.component} has no control "${controlId}" (${known.length ? `its controls: ${known.join(', ')}` : 'it declares none'})`);
    if (definition.container) fail('a container cannot take a control');
    const domain = experiment.domain;
    const values = domain.values ?? [...Array(Math.round((domain.max - domain.min) / domain.step) + 1).keys()].map(index => Number((domain.min + index * domain.step).toFixed(6)));
    if (new Set(values.map(value => canonicalJson(value))).size !== values.length) fail('its domain lists a value twice');
    const options = control.optionsFrom ? params[control.optionsFrom] || [] : null;
    for (const value of values) {
      try { resolveParams(definition, { ...item.params, [control.param]: value }); } catch (error) { fail(`value ${JSON.stringify(value)} is not allowed: ${error.message}`); }
      if (options && !options.some(option => option?.id === value)) fail(`value ${JSON.stringify(value)} is not one of ${control.optionsFrom}`);
    }
    const current = params[control.param] ?? options?.[0]?.id;
    const defaultIndex = values.findIndex(value => sameValue(value, current));
    if (defaultIndex < 0) fail(`the component's own ${control.param} ${JSON.stringify(current)} must be one of the admitted values (it is the default)`);
    const name = sceneName(experiment.input);
    if (name.length > 32) fail(`"${experiment.input}" is too long for a control name: use a shorter component id`);
    if (spec.presentation.experiments.filter(other => other.input === experiment.input).length > 1) fail(`another experiment already uses ${experiment.input}`);
    const labels = values.map(value => (options ? options.find(option => option.id === value).label : `${value}${control.unit ? ` ${control.unit}` : ''}`).slice(0, 60));
    return { experiment, instance, param: control.param, label: control.label, values, labels, name, defaultIndex };
  });
}

// The per-state layouts as one scene: a field that is the same in every state stays literal; one that differs becomes
// a $derive over a pick chain into a per-state table (one pick per control, in experiment order).
function mergeStates(drawn, combos, controls) {
  const [first] = drawn;
  const shape = layout => canonicalJson([layout.width, layout.height, layout.objects.map(object => [object.id, object.type, object.part ?? null])]);
  for (const [index, layout] of drawn.entries()) {
    if (shape(layout) !== shape(first)) {
      const setting = controls.map((control, at) => `${control.experiment.input} = ${JSON.stringify(control.values[combos[index][at]])}`).join(', ');
      throw new Error(`At ${setting} the card changes size or which objects exist: a control may change what objects show, not the frame or the object list (size for every admitted value, hide with opacity 0)`);
    }
  }
  if (!controls.length) return { objects: first.objects, exampleData: {}, derived: {} };
  const exampleData = {}, derived = {};
  const sizes = controls.map(control => control.values.length);
  const nest = (flat, depth = 0, offset = 0) => {
    if (depth === sizes.length) return flat[offset];
    const stride = sizes.slice(depth + 1).reduce((product, size) => product * size, 1);
    return [...Array(sizes[depth]).keys()].map(value => nest(flat, depth + 1, offset + value * stride));
  };
  let tables = 0;
  const objects = first.objects.map((object, index) => {
    const state = {};
    const keys = new Set(drawn.flatMap(layout => Object.keys(layout.objects[index].initialState)));
    for (const key of keys) {
      const values = drawn.map(layout => layout.objects[index].initialState[key]);
      if (values.every(value => sameValue(value, values[0]))) { if (values[0] !== undefined) state[key] = values[0]; continue; }
      if (key === 'values' || values.some(value => value === undefined)) throw new Error(`"${object.id}" ${key} changes with a control in a way the scene cannot bind (a data series, or a field only some states set): keep it in every state`);
      const table = `cv${tables++}`;
      exampleData[table] = nest(values);
      let from = table;
      controls.forEach((control, at) => { const next = `${table}_${at}`; derived[next] = { op: 'pick', args: [from, control.name] }; from = next; });
      state[key] = { $derive: from };
    }
    return { ...object, initialState: state };
  });
  return { objects, exampleData, derived };
}

// What an object shows, without attention marks: a copy of learn-scene-gates.js substance (the gate is the authority;
// this runs first so the author gets the objects that actually changed).
const substance = object => JSON.stringify([object.visible && object.opacity > 0.01, Math.round(object.opacity * 100), object.x, object.y, object.w, object.h,
  object.from, object.to, object.rotation, object.label, object.runs, object.values, object.labels, object.tokens]);

// The scene experiments, checked on every admitted state with B2's rule (learn-scene-gates.js presentationProblem):
// a listed object changes between each consecutive pair of values; an invariant one stays the same while something
// else (the setting in effect) changes. A bare component id lists that component's objects that change at every pair.
function experimentsFor(spec, controls, scene, objectMap) {
  const evaluate = inputs => new Map(evaluateScene(structuredClone(scene), scene.duration, inputs).state.objects.map(object => [object.id, substance(object)]));
  return controls.map(control => {
    const { experiment } = control;
    const fail = message => { throw new Error(`Experiment "${experiment.id}": ${message}`); };
    const others = experiment.dependsOn.map(ref => controls.find(entry => entry.experiment.input === ref && entry !== control) || fail(`dependsOn "${ref}" is not another experiment's input`));
    let contexts = [{}];
    for (const other of others) contexts = contexts.flatMap(context => other.values.map((_, value) => ({ ...context, [other.name]: value })));
    const drawn = contexts.map(context => control.values.map((_, value) => evaluate({ ...context, [control.name]: value })));
    const ids = [...drawn[0][0].keys()];
    const pairs = control.values.slice(1).map((_, at) => at + 1);
    const changesAtEveryPair = id => pairs.every(at => drawn.some(series => series[at].get(id) !== series[at - 1].get(id)));
    const stillAtEveryPair = id => pairs.every(at => drawn.every(series => series[at].get(id) === series[at - 1].get(id)));
    const changed = ids.filter(changesAtEveryPair);
    const affects = experiment.affects.flatMap(ref => {
      if (ref.includes('.')) {
        const owner = ref.split('.')[0];
        if (!drawn[0][0].has(ref)) fail(`affects names no object "${ref}" (objects of ${owner}: ${ids.filter(id => id.startsWith(`${owner}.`)).join(', ') || 'none'})`);
        return [ref];
      }
      if (!spec.components.some(item => item.id === ref)) fail(`affects names unknown component "${ref}"`);
      if (experiment.invariant) fail(`an invariant lists the objects that stay the same as instance.object, not the whole component "${ref}"`);
      const own = changed.filter(id => objectMap[id]?.component === ref);
      if (!own.length) fail(`"${ref}" draws the same between some neighbouring values of ${experiment.input}`);
      return own;
    });
    if (experiment.invariant) {
      const moved = affects.find(id => !stillAtEveryPair(id));
      if (moved) fail(`declares "${moved}" invariant, but it changes with ${experiment.input}`);
      if (!ids.some(id => !affects.includes(id) && changesAtEveryPair(id))) fail(`is invariant, but nothing else on the card shows which ${experiment.input} is in effect`);
    } else {
      const still = affects.find(id => !changesAtEveryPair(id));
      if (still) fail(`says ${experiment.input} changes "${still}", but it draws the same between some neighbouring values (objects that change at every value: ${changed.join(', ') || 'none'})`);
    }
    return {
      id: experiment.id, input: control.name, purpose: experiment.purpose, affects: [...new Set(affects)], contrasts: experiment.contrasts,
      ...(others.length ? { dependsOn: others.map(other => other.name) } : {}), ...(experiment.invariant ? { invariant: true } : {}),
    };
  });
}
