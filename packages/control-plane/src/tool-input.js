// packages/control-plane/src/tool-input.js
// The schema-directed boundary for a model's tool input (LP1 live API run, 2026-10-05: claude-sonnet-5-5 returned an
// array and an object as JSON strings). Where the tool's input_schema says a field is an array or an object and the model
// sent a string, the string is JSON.parse'd exactly once and kept only when the result has that type: an array for array,
// a plain non-null object for object. Anything else - malformed JSON, the wrong type - is left as it came, so the
// existing validator rejects it as before. The walk follows the schema (an object's properties and additionalProperties,
// an array's items); a field whose schema type is anything else, or has no type, is never touched: no string field is
// parsed, no boolean or number is coerced, nothing is repaired or defaulted. Unchanged values keep their reference.
// Pure and import-free.

const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const fits = (type, v) => (type === 'array' ? Array.isArray(v) : isPlain(v));

// options.dropNull (off by default, so every other caller is unchanged; /animation author and repair turn it on, FX-AN-058): a null on an optional property whose schema is known
// and does not allow null is dropped before validation (Gate 1 r16 sent timeline: null). A required property, or one whose type includes null, keeps its null.
const allowsNull = type => type === 'null' || (Array.isArray(type) && type.includes('null'));
export function normalizeToolInput(schema, value, options = {}) {
  const type = schema?.type;
  if (type !== 'array' && type !== 'object') return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (!fits(type, parsed)) return value;
      value = parsed;
    } catch { return value; }
  }
  if (type === 'array') {
    if (!Array.isArray(value) || !schema.items) return value;
    const items = value.map(item => normalizeToolInput(schema.items, item, options));
    return items.some((item, i) => item !== value[i]) ? items : value;
  }
  if (!isPlain(value)) return value;
  let out = value;
  for (const key of Object.keys(value)) {
    const child = schema.properties && Object.hasOwn(schema.properties, key) ? schema.properties[key] : isPlain(schema.additionalProperties) ? schema.additionalProperties : null;
    if (options.dropNull && value[key] === null && child && !allowsNull(child.type) && !(schema.required || []).includes(key)) { if (out === value) out = { ...value }; delete out[key]; continue; }
    const next = normalizeToolInput(child, value[key], options);
    if (next !== value[key]) { if (out === value) out = { ...value }; out[key] = next; }
  }
  return out;
}
