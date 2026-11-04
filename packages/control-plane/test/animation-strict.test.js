// AN-17 item 5 (plan 13.6 follow-up 1), evaluated against the current Anthropic documentation of 3 Nov 2026 (strict tool use:
// platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use; schema subset: .../build-with-claude/structured-outputs "JSON Schema
// limitations" and "Schema complexity limits"): `strict: true` is a top-level tool property, needs no beta header, is supported on claude-opus-5-5, and
// guarantees the tool input follows input_schema, so a required field cannot be omitted. An unsupported schema is a 400. The subset rejects numerical
// constraints (minimum, maximum, exclusiveMinimum, multipleOf), string constraints (minLength, maxLength) and array constraints beyond minItems 0 or 1;
// objects must set additionalProperties false; and a request may carry at most 24 optional parameters (any property not in `required`) and 16
// parameters with union types (anyOf or a type array) across all its strict schemas.
// Result: the repair tool cannot be made strict without losing the artifact's shape. Its keyword constraints could be moved to descriptions (what the
// SDK helpers do) with the local validation kept, but it has 44 to 45 optional parameters against a limit of 24, and they are not optional by accident:
// a box has no radius, a node may have no parent or drag. So strict is NOT enabled; this test records the measurement and fails if the schema ever
// becomes conformable, which is the cue to enable `strict: true` on the repair tool with a fixture that a reply missing `program` is refused.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTHOR_TOOL, REPAIR_TOOL, repairTool } from '../src/agents/animation-author.js';
import { animationRequest } from '../src/animation-policy.js';
import { TASKS } from './animation-fixture.js';

export const STRICT_LIMITS = { optional: 24, unions: 16 };
const UNSUPPORTED = ['minLength', 'maxLength', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'maxItems'];

// What the documented subset would reject in a schema: unsupported keywords by name, objects left open, and the two counted limits.
export function strictViolations(schema) {
  const found = { keywords: {}, optional: 0, unions: 0, open: 0 };
  const walk = node => {
    if (!node || typeof node !== 'object') return;
    for (const keyword of UNSUPPORTED) if (keyword in node) found.keywords[keyword] = (found.keywords[keyword] || 0) + 1;
    if (node.minItems > 1) found.keywords['minItems>1'] = (found.keywords['minItems>1'] || 0) + 1;
    if (Array.isArray(node.type) || node.anyOf) found.unions++;
    if (node.type === 'object') {
      if (node.additionalProperties !== false) found.open++;
      found.optional += Object.keys(node.properties || {}).filter(key => !(node.required || []).includes(key)).length;
    }
    Object.values(node.properties || {}).forEach(walk);
    walk(node.items);
  };
  walk(schema);
  return found;
}

test('the checker accepts a schema inside the documented subset and names what a schema outside it breaks', () => {
  const ok = { type: 'object', additionalProperties: false, required: ['a'], properties: { a: { type: 'string', enum: ['x'] }, b: { type: 'array', minItems: 1, items: { type: 'number' } } } };
  assert.deepEqual(strictViolations(ok), { keywords: {}, optional: 1, unions: 0, open: 0 });
  const bad = { type: 'object', required: [], properties: { a: { type: 'string', maxLength: 5 }, b: { type: 'array', minItems: 3, maxItems: 3 }, c: { type: ['string', 'null'] }, d: { type: 'integer', minimum: 0 } } };
  assert.deepEqual(strictViolations(bad), { keywords: { maxLength: 1, maxItems: 1, 'minItems>1': 1, minimum: 1 }, optional: 4, unions: 1, open: 1 });
});

test('the repair tool is outside the strict subset in a way no keyword move fixes: 54 optional parameters (44 before the AN-18 contract fields) against a limit of 24; strict is not enabled', () => {
  for (const tool of [REPAIR_TOOL, repairTool({ program: true }), AUTHOR_TOOL]) {
    const found = strictViolations(tool.input_schema);
    // Strippable into descriptions (the SDK helpers' transformation), local validation kept: every one of these is rejected by the API as it stands.
    for (const keyword of ['maxLength', 'maxItems', 'minItems>1', 'minimum', 'maximum', 'exclusiveMinimum']) assert.ok(found.keywords[keyword] > 0, `${tool.name} uses ${keyword}`);
    // Not strippable: how many parameters may be left out is the schema's shape. If this fails, the schema became conformable: enable strict (see the header).
    assert.ok(found.optional > STRICT_LIMITS.optional, `${tool.name} has ${found.optional} optional parameters`);
    assert.ok(found.unions <= STRICT_LIMITS.unions && found.open === 0, 'unions and closed objects are inside the limits');
  }
  assert.deepEqual([strictViolations(REPAIR_TOOL.input_schema).optional, strictViolations(repairTool({ program: true }).input_schema).optional], [55, 54]); // [45, 44] on the MVP2b lane alone; the AN-18/AN-19 contract fields add ten optional parameters
  // So no request carries the flag: the model's reply is checked locally, as before (FX-AN-043 asks again once for a missing program).
  for (const [role, tool] of [['repair', repairTool({ program: true })], ['author', AUTHOR_TOOL]]) assert.equal('strict' in animationRequest({}, role, { system: 's', tool, content: 'x' }, TASKS).tools[0], false);
});
