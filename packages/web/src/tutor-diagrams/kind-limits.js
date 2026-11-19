// A read-only table of what each kind accepts, read from the kinds' own zod schemas (the objects parseTutorDiagram uses), so it cannot drift from them.
// kindLimits(kind) returns one entry per field path: { path, type, optional, min, max, ... }.
//   list     min/max = the item count (zod array length checks).
//   text     min/max = the SHOWN-character limit, counted by shownLength (spec.js): a formula's delimiters, braces and spaces are free. It is NOT the schema's own max,
//            which is twice as large; the limit comes from the text() helper itself (spec.js textLimits). counts: 'shownLength' marks it.
//   int / number   min/max = the value bounds (minExclusive / maxExclusive when the bound itself is refused).
//   enum / literal   values.   string   an id (pattern).   object   a group of fields.   diagram   a whole child diagram of one of `kinds` (use kindLimits(kind)).
// Path syntax: `a.b` field, `a[]` list item, `a{k}` the branch of a union discriminated by `kind` (e.g. annotations[]{polygon}), `a|n` the n-th alternative of a plain union.
// A field marked `nullable` also takes null. Rules BETWEEN fields (one weight per target token, a query index inside the source, cells per row equal to columns...) live in
// the check functions of spec.js and the ml-*-spec.js files, not here.
// Built on the first call and cached: nothing runs when this module is imported.
import { shownLength, textLimits, tutorDiagramSchema } from './spec.js';

export { shownLength };

const def = schema => schema._zod.def;
const checks = schema => (def(schema).checks ?? []).map(check => def(check));
function lengths(schema) {
  const list = checks(schema), out = {};
  const min = list.filter(c => c.check === 'min_length').map(c => c.minimum), max = list.filter(c => c.check === 'max_length').map(c => c.maximum);
  const exact = list.filter(c => c.check === 'length_equals').map(c => c.length);
  if (min.length || exact.length) out.min = Math.max(...min, ...exact);
  if (max.length || exact.length) out.max = Math.min(...max, ...exact);
  return out;
}

function values(schema) {
  const list = checks(schema), out = {};
  const low = list.filter(c => c.check === 'greater_than'), high = list.filter(c => c.check === 'less_than');
  if (low.length) { const top = low.reduce((a, b) => (b.value > a.value || (b.value === a.value && !b.inclusive) ? b : a)); out.min = top.value; if (!top.inclusive) out.minExclusive = true; }
  if (high.length) { const top = high.reduce((a, b) => (b.value < a.value || (b.value === a.value && !b.inclusive) ? b : a)); out.max = top.value; if (!top.inclusive) out.maxExclusive = true; }
  return out;
}

function walk(schema, path, flags, ctx, out) {
  const d = def(schema), join = key => path ? `${path}.${key}` : key;
  const add = entry => out.push({ path, ...entry, optional: !!flags.optional, ...(flags.nullable && { nullable: true }) });
  switch (d.type) {
    case 'optional': return walk(d.innerType, path, { ...flags, optional: true }, ctx, out);
    case 'nullable': return walk(d.innerType, path, { ...flags, nullable: true }, ctx, out);
    case 'default': case 'prefault': return walk(d.innerType, path, { ...flags, optional: true }, ctx, out);
    case 'readonly': case 'nonoptional': return walk(d.innerType, path, flags, ctx, out);
    case 'lazy': return walk(d.getter(), path, flags, ctx, out);
    case 'pipe': return walk(d.in, path, flags, ctx, out);
    case 'string': {
      const limit = textLimits.get(schema);
      if (limit !== undefined) return add({ type: 'text', min: lengths(schema).min, max: limit, counts: 'shownLength' });
      const pattern = checks(schema).find(c => c.pattern)?.pattern;
      return add({ type: 'string', ...lengths(schema), ...(pattern && { pattern: pattern.source }) });
    }
    case 'number': return add({ type: d.format === 'safeint' || checks(schema).some(c => c.check === 'number_format' && c.format === 'safeint') ? 'int' : 'number', ...values(schema) });
    case 'boolean': return add({ type: 'boolean' });
    case 'null': return add({ type: 'null' });
    case 'enum': return add({ type: 'enum', values: Object.values(d.entries) });
    case 'literal': return add({ type: 'literal', values: [...d.values] });
    case 'array': {
      add({ type: 'list', min: 0, ...lengths(schema) });
      return walk(d.element, `${path}[]`, {}, ctx, out);
    }
    case 'object': {
      if (path) add({ type: 'object' });
      for (const [key, field] of Object.entries(d.shape)) if (!(key === 'kind' && def(field).type === 'literal')) walk(field, join(key), {}, ctx, out);
      return;
    }
    case 'union': {
      const options = d.options.filter(option => def(option).type !== 'null');
      if (options.length < d.options.length && options.length === 1) return walk(options[0], path, { ...flags, nullable: true }, ctx, out);
      if (d.discriminator === 'kind') {
        if (options.every(option => ctx.top.has(option))) return add({ type: 'diagram', kinds: options.map(option => def(option.shape.kind).values[0]) });
        return options.forEach(option => walk(option, `${path}{${def(option.shape.kind).values[0]}}`, flags, ctx, out));
      }
      return d.options.forEach((option, index) => walk(option, `${path}|${index}`, flags, ctx, out));
    }
    default: throw new Error(`kind-limits: no rule for a zod ${d.type} at ${path}`);
  }
}

let table;
function build() {
  const options = def(tutorDiagramSchema.shape.diagram).options, ctx = { top: new Set(options) }, built = new Map();
  for (const option of options) {
    const entries = [];
    walk(option, '', {}, ctx, entries);
    built.set(def(option.shape.kind).values[0], Object.freeze(entries.map(entry => Object.freeze(entry))));
  }
  return built;
}

export const kindLimitKinds = () => [...(table ??= build()).keys()];
export function kindLimits(kind) {
  const entries = (table ??= build()).get(kind);
  if (!entries) throw new Error(`kind-limits: unknown kind ${kind}`);
  return entries;
}
