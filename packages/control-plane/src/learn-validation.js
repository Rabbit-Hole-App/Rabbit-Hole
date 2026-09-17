// Report schema paths and constraints, never the learner's content.
export function validateToolInput(value, schema, path = 'input') {
  const fail = message => { throw new Error(`${path}: ${message}`); };
  const types = [].concat(schema.type || []);
  const isType = type => type === 'null' ? value === null : type === 'array' ? Array.isArray(value) : type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value) : type === 'integer' ? Number.isInteger(value) : typeof value === type;
  if (types.length && !types.some(isType)) fail(`expected ${types.join(' or ')}`);
  if (schema.enum && !schema.enum.includes(value)) fail(`expected one of ${schema.enum.join(', ')}`);
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.trim().length < schema.minLength) fail(`requires at least ${schema.minLength} non-whitespace characters`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) fail(`maximum ${schema.maxLength} characters; received ${value.length}`);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('requires a finite number');
    if (schema.minimum !== undefined && value < schema.minimum) fail(`minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) fail(`maximum ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) fail(`requires at least ${schema.minItems} items; received ${value.length}`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) fail(`maximum ${schema.maxItems} items; received ${value.length}`);
    if (schema.items) value.forEach((item, index) => validateToolInput(item, schema.items, `${path}[${index}]`));
  } else if (value !== null && typeof value === 'object') {
    for (const key of schema.required || []) if (!(key in value)) throw new Error(`${path}.${key}: required field missing`);
    for (const [key, item] of Object.entries(value)) {
      if (schema.properties?.[key]) validateToolInput(item, schema.properties[key], `${path}.${key}`);
      else if (schema.additionalProperties === false) fail(`unexpected field; allowed fields: ${Object.keys(schema.properties || {}).join(', ')}`);
    }
  }
  return value;
}
