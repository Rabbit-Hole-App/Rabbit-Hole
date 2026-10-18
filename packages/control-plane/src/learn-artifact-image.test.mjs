import test from 'node:test';
import assert from 'node:assert/strict';
import { generateArtifact } from './learn-artifact.js';

const imageSource = { blockId: 'image', contentSha256: 'a'.repeat(64), coverage: 'whole-image' };
const content = { title: 'Read values', columns: ['Name', 'Value'], rows: [['A', '2']] };
const image = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } };
test('image table extraction uses actual supplied pixels and retains uncertainty through normal artifact validation', async () => {
  let calls = 0;
  const uncertainties = [{ location: 'row A', message: 'The value is faint.' }];
  const out = await generateArtifact({}, { command: 'explain', args: 'Make an editable table', imageSource, documents: [image] }, {
    callModel: async (_env, request) => {
      calls++;
      assert.deepEqual(request.messages[0].content[0], image);
      assert.ok(request.tools.find(tool => tool.name === 'make_table').input_schema.properties.uncertainties);
      return Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'make_table', input: { content, uncertainties } }] });
    },
  });
  assert.equal(out.result, 'artifact');
  assert.equal(out.block.type, 'table');
  assert.deepEqual(out.block.rows, content.rows);
  assert.deepEqual(out.extraction, { source: imageSource, uncertainties });
  assert.equal(calls, 1);
});
test('invalid image extraction stops after one call and can ask clarification instead of inventing data', async () => {
  for (const input of [{ content: { ...content, rows: [['wrong-width']] }, uncertainties: [] }, { clarify: { question: 'Which column is the unit?' } }]) {
    let calls = 0;
    const out = await generateArtifact({}, { command: 'explain', args: 'Read the table', imageSource, documents: [image] }, {
      callModel: async () => { calls++; return Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'make_table', input }] }); },
    });
    assert.equal(out.result, input.clarify ? 'clarification' : 'validation_error');
    assert.equal(calls, 1, 'no automatic paid repair');
  }
});
