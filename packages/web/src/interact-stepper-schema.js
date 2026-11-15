import { z } from 'zod';

// Family-owned, closed data schemas. The registered template's sceneDataSchema
// admits scene.data through the shared ScenePlan contract (brief 24).
export const canonicalIds = Object.freeze(['algorithm-over-collection', 'protocol-between-parties', 'cycle-of-phases']);
export const DEPTH_LIMITS = Object.freeze({
  brief: Object.freeze({ variants: 1, states: 4, regions: 7, links: 8, parts: 3, readouts: 0 }),
  balanced: Object.freeze({ variants: 2, states: 6, regions: 8, links: 9, parts: 5, readouts: 4 }),
  detailed: Object.freeze({ variants: 2, states: 8, regions: 10, links: 9, parts: 6, readouts: 4 }),
});
export const WORDS = Object.freeze([
  Object.freeze(['heading', 40, 'heading for the fixed teaching picture']),
  Object.freeze(['current', 16, 'label for the selected state']),
  Object.freeze(['previous', 16, 'label for the previous-state ghost']),
  Object.freeze(['completed', 16, 'label for the completed-state trace']),
]);

export const plainText = max => z.string().min(1).max(max).regex(/\S/, 'must not be blank')
  .regex(/^[^\u0000-\u0008\u000b\u000c\u000e-\u001f<>]*$/, 'plain text only');
const object = fields => z.object(fields).strict();
const id = z.string().min(1).max(32).regex(/^[A-Za-z][A-Za-z0-9_.-]*$/);
const ids = (max, min = 0) => z.array(id).min(min).max(max);
const array = (item, max, min = 0) => z.array(item).min(min).max(max);
const integer = (min, max) => z.number().int().min(min).max(max);
const pole = z.enum(['left', 'right']);
const label = plainText(24);
const collectionValue = integer(-999, 999);
const collection = (max = 4) => array(collectionValue, max, 1);
const regionBase = { id, label };
const link = object({ from: id, to: id });
const status = object({ id, text: plainText(96), source: id });
const stateBase = {
  id, label, short: plainText(12), sentence: plainText(96), why: plainText(96),
  active: ids(2, 1), calloutRegion: id,
  // TCP's existing renderer status is promoted to explicit selected-state data;
  // approved reference companions without that normalization remain unchanged.
  status: status.optional(),
};

const numberText = (min, max) => z.union([
  integer(min, max), z.string().min(1).max(1).regex(new RegExp(`^[${min}-${max}]$`)),
]);
const readout = (name, value) => object({ id: z.literal(name), label, value });
const mergeReadout = z.discriminatedUnion('id', [
  readout('comparisons', integer(0, 6)),
  readout('placed', z.string().min(5).max(5).regex(/^[0-4] \/ 4$/)),
]);
const sequence = integer(0, 4294967295);
// Legacy reference readouts use strings. New sequence values use the bounded
// numeric branch rather than pretending a decimal string has a numeric domain.
const sequenceDisplay = z.union([sequence, z.enum(['100', '101', '500', '501', '—'])]);
const protocolReadout = z.discriminatedUnion('id', [
  ...['seq', 'ack', 'clientNext', 'serverNext'].map(name => readout(name, sequenceDisplay)),
  readout('ready', z.string().min(6).max(6).regex(/^[0-2] of 2$/)),
]);
const cycleReadout = z.discriminatedUnion('id', [
  readout('chromosomes', numberText(0, 4, 1)), readout('dna', numberText(0, 4, 1)),
  readout('cells', numberText(1, 2, 1)),
  readout('per-nucleus', z.union([numberText(0, 4, 1), z.literal('—')])),
  readout('per-pole', z.union([numberText(0, 4, 1), z.literal('—')])),
]);

const comparison = object({ left: collectionValue, right: collectionValue, chosen: collectionValue, result: collection() });
const calculation = object({ result: collection(), comparisons: integer(0, 3), decisions: array(comparison, 3) });
const calculations = object({ left: calculation, right: calculation, final: calculation, total: integer(0, 6) });
const endpoint = states => object({ state: z.enum(states), nextSeq: sequence });

const phase = z.enum(['before', 'prophase', 'prometaphase', 'metaphase', 'anaphase', 'telophase', 'cytokinesis', 'daughters']);
const chromatid = object({ id, source: id });
const chromosome = object({ id, pole: pole.nullable(), chromatids: array(chromatid, 2, 1) });
const cellBody = object({ id, chromosomeIds: ids(4), nucleusIds: ids(2) });
const nucleus = object({ id, chromosomeIds: ids(2), envelope: z.enum(['breaking', 'intact', 'reformed']), pole: pole.nullable() });
const spindle = object({
  status: z.enum(['not-assembled', 'assembling', 'attaching', 'aligned', 'separating', 'disassembled']),
  centrosomes: array(object({ id, pole }), 2),
  attachments: array(object({ chromatidId: id, pole }), 4),
});
export const mitosisPayloadSchema = object({
  kind: z.literal('animal-cell-mitosis'), phase, context: z.boolean(),
  dnaReplication: z.literal('completed-in-S-phase-before-mitosis'), condensed: z.boolean(), separated: z.boolean(),
  chromosomes: array(chromosome, 4, 1), cellBodies: array(cellBody, 2, 1), nuclei: array(nucleus, 2), spindle,
  cytokinesis: z.enum(['not-started', 'starting', 'constricting', 'complete']),
});
const cycleRegion = z.discriminatedUnion('kind', [
  object({ ...regionBase, kind: z.literal('mitosis-cell'), payload: mitosisPayloadSchema }),
  object({ ...regionBase, kind: z.literal('cell-structure'), payload: object({ structure: z.enum(['chromosomes', 'spindle']), within: array(phase, 8, 1) }) }),
]);
const protocolRegion = z.discriminatedUnion('kind', [
  object({ ...regionBase, kind: z.literal('party'), initialSeq: sequence }),
  object({ ...regionBase, kind: z.literal('guide') }),
  object({ ...regionBase, kind: z.literal('outcome') }),
  object({
    ...regionBase, kind: z.literal('message'), from: id, to: id, flags: array(z.enum(['SYN', 'ACK']), 2, 1),
    seq: sequence, ack: sequence.nullable(), sequenceLength: integer(0, 1), newSequenceSpace: integer(0, 1), outcome: z.enum(['delivered', 'lost', 'unused']),
  }),
]);
const cycleLink = object({ from: id, to: id, context: z.boolean(), label: plainText(64).optional() });

// The older approved sketch names are normalized by stepper-scene, explicitly;
// they are never accepted as additional renderer implementations.
// The fill's closed binding vocabulary. A bind path is one of these whole strings: state.* (the selected state), variant.* (the current
// variant's tables), previous.* (the state before it), or the one input "inputs.step" (the rail's cursor and the trace's cutoff). The step
// control lists the CONSTANT "variant.states". A path never indexes a table with an input: variant.states[inputs.stepIndex].why is refused.
const bound = value => z.literal(value, { error: issue => `must be exactly "${value}"${typeof issue.input === 'string' ? ` (got "${issue.input.slice(0, 60)}")` : ''}: ${
  value === 'variant.states' ? 'the step control lists the whole ordered table variant.states, never an index into it; the selected position is the input "step", which is never written inside a path'
    : 'bind paths are only state.*, variant.* and previous.* (plus inputs.step for the rail and the trace); copy the path exactly, and never index a table with an input such as variant.states[inputs.step]'}` });
const part = z.discriminatedUnion('kind', [
  object({ id: z.literal('rail'), kind: z.literal('step-rail'), bind: object({ items: bound('variant.states'), active: bound('inputs.step') }) }),
  object({ id: z.literal('picture'), kind: z.literal('fixed-picture'), bind: object({ regions: bound('variant.regions'), links: bound('variant.links'), active: bound('state.active') }) }),
  object({ id: z.literal('callout'), kind: z.literal('active-callout'), bind: object({ target: bound('state.calloutRegion'), text: bound('state.sentence'), reason: bound('state.why').optional() }) }),
  object({ id: z.literal('ghost'), kind: z.literal('previous-state-ghost'), bind: object({ regions: bound('previous.active') }) }),
  object({ id: z.literal('values'), kind: z.literal('value-readout'), bind: object({ values: bound('state.readouts') }) }),
  object({ id: z.literal('trace'), kind: z.literal('progress'), presentation: z.literal('completed-trace'), bind: object({ items: bound('variant.states'), completedBefore: bound('inputs.step') }) }),
]);
const control = z.discriminatedUnion('kind', [
  object({ id: z.literal('step'), kind: z.literal('index'), presentation: z.literal('slider'), items: bound('variant.states'), default: integer(0, 7) }),
  object({ id: z.literal('option'), kind: z.literal('select'), label, options: array(plainText(24), 2, 2), default: integer(0, 1) }),
  object({ id: z.literal('reset'), kind: z.literal('reset') }),
]);

function makeSchemas(depth) {
  const limits = DEPTH_LIMITS[depth];
  if (!limits) throw new RangeError(`stepper-states has no depth "${depth}"`);
  const state = extra => object({ ...stateBase, ...extra });
  const mergeState = state({ readouts: array(mergeReadout, limits.readouts), comparison: comparison.optional() });
  const protocolState = state({
    readouts: array(protocolReadout, limits.readouts),
    endpoints: object({ client: endpoint(['CLOSED', 'SYN-SENT', 'ESTABLISHED']), server: endpoint(['LISTEN', 'SYN-RECEIVED', 'ESTABLISHED']) }),
    segment: id.nullable(), sent: ids(4), replyReceived: z.boolean(), ackSent: z.boolean(), ackReceived: z.boolean(),
  });
  const cycleState = state({ focus: z.enum(['chromosomes', 'spindle']).nullable(), readouts: array(cycleReadout, limits.readouts) });
  const base = canonical => ({
    schemaVersion: z.literal(1), status: z.literal('reference-proposal'), id, family: z.literal('stepper-states'), depth: z.literal(depth),
    canonical: z.literal(canonical), story: plainText(600), aha: object({ stateId: id, observation: plainText(240) }),
    layout: object({ preset: z.literal(canonical), width: z.literal(640) }),
    parts: array(part, limits.parts, 3), controls: array(control, depth === 'brief' ? 2 : 3, 2),
  });
  const variants = item => object({ variants: array(item, limits.variants, 1) });
  const merge = object({ ...base(canonicalIds[0]), data: variants(object({
    label, regions: array(object({ ...regionBase, values: collection() }), 7, 7), links: array(link, 8, 1),
    states: array(mergeState, limits.states, 2), calculations,
  })) });
  const protocol = object({ ...base(canonicalIds[1]), data: variants(object({
    lostReply: z.boolean(),
    assumptions: object({ loss: z.enum(['None', 'First SYN-ACK only']), payloadBytes: z.literal(0), retryOrder: plainText(64), timeModel: z.literal('Event order only; no timers') }),
    regions: array(protocolRegion, limits.regions, 2), links: array(link, limits.links, 1), states: array(protocolState, limits.states, 2),
  })) });
  const cycle = object({ ...base(canonicalIds[2]), data: variants(object({
    regions: array(cycleRegion, limits.regions, 4), links: array(cycleLink, limits.links, 1), states: array(cycleState, limits.states, 2),
  })) });
  return z.discriminatedUnion('canonical', [merge, protocol, cycle]);
}

const schemas = Object.freeze(Object.fromEntries(Object.keys(DEPTH_LIMITS).map(depth => [depth, makeSchemas(depth)])));
export function compositionSchemaFor(depth) {
  const schema = schemas[depth];
  if (!schema) throw new RangeError(`stepper-states has no depth "${depth}"`);
  return schema;
}
export const compositionSchema = z.union(Object.values(schemas));
export const compositionJsonSchema = depth => z.toJSONSchema(compositionSchemaFor(depth));
export const wordsSchema = object(Object.fromEntries(WORDS.map(([key, max]) => [key, plainText(max)])));

// Unrecognized keys point at the actual rejected field, including nested payloads;
// no parser strips them. Keep bounded diagnostics independent of the provider.
export function schemaFailures(error, prefix = '') {
  const out = [];
  const visit = issue => {
    const at = issue.path ?? [];
    const push = (path, message) => {
      if (out.length < 12) out.push({ code: 'schema', path: [prefix, ...path].filter(x => x !== '').join('.') || 'brief', message });
    };
    if (issue.code === 'unrecognized_keys') issue.keys.forEach(key => push([...at, key], `Unknown field "${key}".`));
    else if (issue.code === 'invalid_union' && issue.errors?.length) {
      // A union's type discriminator failures are less useful than the branch
      // whose known keys matched. Zod's shortest issue branch is deterministic.
      const branches = issue.errors.slice().sort((a, b) => a.length - b.length);
      branches[0].forEach(visit);
    } else push(at, issue.message);
  };
  error.issues.forEach(visit);
  return out;
}
export function parseComposition(raw, depth = raw?.depth) {
  if (!Object.hasOwn(schemas, depth)) {
    const failures = [{ code: 'schema', path: 'depth', message: 'Unknown stepper depth.' }];
    return { ok: false, failures, problems: failures.map(f => `${f.path}: ${f.message}`) };
  }
  const parsed = schemas[depth].safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  const failures = schemaFailures(parsed.error);
  return { ok: false, failures, problems: failures.map(f => `${f.path}: ${f.message}`) };
}
